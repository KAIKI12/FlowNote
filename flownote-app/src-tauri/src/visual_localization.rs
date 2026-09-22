use crate::file_error::{FileError, FileResult};
use crate::note_files::validate_asset_path;
use crate::{note_format, visual_library};
use regex::Regex;
use reqwest::blocking::Client;
use reqwest::header::{CONTENT_LENGTH, CONTENT_TYPE, LOCATION};
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fs;
use std::io::Read;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use url::Url;
use uuid::Uuid;

const MAX_DOWNLOAD_BYTES: usize = 4 * 1024 * 1024;
const MAX_VISUAL_BYTES: usize = 16 * 1024 * 1024;
const MAX_VISUAL_FILES: usize = 256;
const MAX_LOCALIZED_RESOURCES: usize = 64;
const MAX_REDIRECTS: usize = 5;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalizationDependency {
    pub source: String,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FetchResponse {
    pub final_url: String,
    pub mime: String,
    pub bytes: Vec<u8>,
}

pub trait RemoteFetcher {
    fn fetch(&self, source: &str, kind: &str) -> FileResult<FetchResponse>;
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct LocalizedResource {
    source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resolved_source: Option<String>,
    path: String,
    #[serde(rename = "type")]
    kind: String,
    mime: String,
    sha256: String,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct LocalizationIssue {
    source: String,
    reason: String,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

pub struct HttpsFetcher;

fn network(message: impl Into<String>) -> FileError {
    FileError::new("network", message)
}

fn invalid_format(message: impl Into<String>) -> FileError {
    FileError::new("invalidFormat", message)
}

fn now_ms() -> FileResult<u64> {
    let value = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| FileError::io("系统时间无效", error))?
        .as_millis();
    u64::try_from(value).map_err(|_| invalid_format("系统时间超出范围"))
}

fn dependency_kind(kind: &str) -> FileResult<&str> {
    match kind {
        "script" | "stylesheet" | "image" | "style-asset" => Ok(kind),
        _ => Err(invalid_format("Visual localization dependency type 无效")),
    }
}

fn https_url(source: &str) -> FileResult<Url> {
    let url = Url::parse(source).map_err(|_| network("Make Local 只接受有效的 HTTPS URL"))?;
    if url.scheme() != "https" {
        return Err(network("Make Local 第一阶段只允许 HTTPS 资源"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(network("Make Local 不允许 URL 携带凭据"));
    }
    if url.host_str().is_none() {
        return Err(network("Make Local URL 缺少主机"));
    }
    Ok(url)
}

fn normalize_mime(value: &str) -> String {
    value
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

fn mime_allowed(kind: &str, mime: &str) -> bool {
    match kind {
        "stylesheet" => mime == "text/css",
        "script" => matches!(
            mime,
            "text/javascript"
                | "application/javascript"
                | "text/ecmascript"
                | "application/ecmascript"
                | "application/x-javascript"
        ),
        "image" => mime.starts_with("image/"),
        "style-asset" => {
            mime.starts_with("image/")
                || mime.starts_with("font/")
                || matches!(
                    mime,
                    "application/font-woff"
                        | "application/font-woff2"
                        | "application/vnd.ms-fontobject"
                        | "application/x-font-ttf"
                        | "application/x-font-opentype"
                )
        }
        _ => false,
    }
}

fn extension_for(kind: &str, mime: &str) -> &'static str {
    match mime {
        "text/css" => "css",
        "text/javascript"
        | "application/javascript"
        | "text/ecmascript"
        | "application/ecmascript"
        | "application/x-javascript" => "js",
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "font/woff" | "application/font-woff" => "woff",
        "font/woff2" | "application/font-woff2" => "woff2",
        _ if kind == "image" => "img",
        _ if kind == "style-asset" => "bin",
        _ if kind == "script" => "js",
        _ => "bin",
    }
}

fn sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn asset_path(kind: &str, mime: &str, digest: &str) -> String {
    format!(
        "assets/localized/{digest}/payload.{}",
        extension_for(kind, mime)
    )
}

fn config_arrays(config: &Value) -> FileResult<(Vec<LocalizedResource>, Vec<LocalizationIssue>)> {
    let resources = match config.get("resources") {
        None | Some(Value::Null) => return Ok((Vec::new(), Vec::new())),
        Some(Value::Object(value)) => value,
        _ => return Err(invalid_format("block.json resources 必须是对象")),
    };
    let localized = match resources.get("localized") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(values)) => values
            .iter()
            .cloned()
            .map(|value| {
                serde_json::from_value(value)
                    .map_err(|error| invalid_format(format!("localized mapping 无效：{error}")))
            })
            .collect::<FileResult<Vec<_>>>()?,
        _ => return Err(invalid_format("resources.localized 必须是数组")),
    };
    let issues = match resources.get("localizationIssues") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(values)) => values
            .iter()
            .cloned()
            .map(|value| {
                serde_json::from_value(value)
                    .map_err(|error| invalid_format(format!("localization issue 无效：{error}")))
            })
            .collect::<FileResult<Vec<_>>>()?,
        _ => return Err(invalid_format("resources.localizationIssues 必须是数组")),
    };
    Ok((localized, issues))
}

fn put_config_arrays(
    config: &mut Value,
    localized: &[LocalizedResource],
    issues: &[LocalizationIssue],
) -> FileResult<()> {
    let object = config
        .as_object_mut()
        .ok_or_else(|| invalid_format("block.json 必须是对象"))?;
    let resources = object
        .entry("resources")
        .or_insert_with(|| Value::Object(Map::new()));
    let resources = resources
        .as_object_mut()
        .ok_or_else(|| invalid_format("block.json resources 必须是对象"))?;
    resources.insert(
        "localized".into(),
        serde_json::to_value(localized)
            .map_err(|error| FileError::io("无法编码 localized mapping", error))?,
    );
    resources.insert(
        "localizationIssues".into(),
        serde_json::to_value(issues)
            .map_err(|error| FileError::io("无法编码 localization issue", error))?,
    );
    note_format::validate_config(config)
}

fn add_issue(issues: &mut Vec<LocalizationIssue>, source: String, reason: &str) {
    if issues
        .iter()
        .any(|item| item.source == source && item.reason == reason)
    {
        return;
    }
    issues.push(LocalizationIssue {
        source,
        reason: reason.into(),
        extra: Map::new(),
    });
}

fn css_dependencies(
    css: &str,
    base: &Url,
    issues: &mut Vec<LocalizationIssue>,
) -> FileResult<Vec<LocalizationDependency>> {
    let import = Regex::new(r#"(?i)@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)"#)
        .map_err(|error| FileError::io("无法初始化 CSS @import 检查", error))?;
    for capture in import.captures_iter(css) {
        let raw = capture.get(1).map(|value| value.as_str()).unwrap_or("");
        let source = base
            .join(raw)
            .map(|url| url.to_string())
            .unwrap_or_else(|_| raw.to_string());
        add_issue(issues, source, "css-import-not-supported");
    }
    let stripped = import.replace_all(css, "");
    let url_pattern = Regex::new(r#"(?i)url\(\s*['"]?([^'")]+)['"]?\s*\)"#)
        .map_err(|error| FileError::io("无法初始化 CSS url() 检查", error))?;
    let mut result = Vec::new();
    for capture in url_pattern.captures_iter(&stripped) {
        let raw = capture
            .get(1)
            .map(|value| value.as_str().trim())
            .unwrap_or("");
        if raw.is_empty()
            || raw.starts_with('#')
            || raw.starts_with("data:")
            || raw.starts_with("blob:")
        {
            continue;
        }
        let url = match base.join(raw) {
            Ok(url) => url,
            Err(_) => {
                add_issue(issues, raw.into(), "invalid-css-url");
                continue;
            }
        };
        if url.scheme() == "https" {
            result.push(LocalizationDependency {
                source: url.to_string(),
                kind: "style-asset".into(),
            });
        } else if url.scheme() == "http" {
            add_issue(issues, url.to_string(), "insecure-http-not-supported");
        }
    }
    Ok(result)
}

fn validated_response(
    source: &str,
    kind: &str,
    response: FetchResponse,
) -> FileResult<(FetchResponse, Url, String)> {
    let final_url = https_url(&response.final_url)?;
    let mime = normalize_mime(&response.mime);
    if !mime_allowed(kind, &mime) {
        return Err(network(format!(
            "Make Local 资源 MIME 与类型不匹配：{source} ({mime})"
        )));
    }
    if response.bytes.len() > MAX_DOWNLOAD_BYTES {
        return Err(FileError::new(
            "tooLarge",
            "单个 Make Local 资源不能超过 4 MiB",
        ));
    }
    Ok((response, final_url, mime))
}

fn visual_json(source: &Path) -> FileResult<Value> {
    let current = source.join("visual.json");
    let backup = source.join(".visual.json.flownote-backup");
    let path = if current.is_file() { current } else { backup };
    let bytes =
        fs::read(&path).map_err(|error| FileError::io("无法读取 Visual metadata", error))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| invalid_format(format!("Visual metadata 无效：{error}")))
}

fn json_bytes(value: &Value) -> FileResult<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| FileError::io("无法编码 Visual localization JSON", error))?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn write_file(root: &Path, relative: &str, bytes: &[u8]) -> FileResult<()> {
    if relative.starts_with("assets/") {
        validate_asset_path(relative)?;
    }
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| FileError::io("无法创建 Visual localization 目录", error))?;
    }
    fs::write(path, bytes)
        .map_err(|error| FileError::io("无法写入 Visual localization 文件", error))
}

fn stage_item(
    items: &Path,
    id: &str,
    html: &str,
    original_html: &str,
    config: &Value,
    assets: &BTreeMap<String, Vec<u8>>,
) -> FileResult<PathBuf> {
    let source = items.join(id);
    let candidate = items.join(format!(".{id}.localize-{}.tmp", Uuid::new_v4()));
    fs::create_dir(&candidate)
        .map_err(|error| FileError::io("无法创建 Visual localization 暂存目录", error))?;
    let result = (|| -> FileResult<()> {
        let mut metadata = visual_json(&source)?;
        let object = metadata
            .as_object_mut()
            .ok_or_else(|| invalid_format("Visual metadata 必须是对象"))?;
        object.insert("updatedAtMs".into(), Value::from(now_ms()?));
        write_file(&candidate, "visual.json", &json_bytes(&metadata)?)?;
        write_file(&candidate, "index.html", html.as_bytes())?;
        write_file(&candidate, "original.html", original_html.as_bytes())?;
        write_file(&candidate, "block.json", &json_bytes(config)?)?;
        for (path, bytes) in assets {
            write_file(&candidate, path, bytes)?;
        }
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&candidate);
        return Err(error);
    }
    Ok(candidate)
}

fn publish_stage(
    items: &Path,
    id: &str,
    candidate: &Path,
) -> FileResult<visual_library::VisualLibraryItem> {
    let source = items.join(id);
    let backup = items.join(format!(".{id}.localize-{}.backup", Uuid::new_v4()));
    fs::rename(&source, &backup)
        .map_err(|error| FileError::io("无法暂存旧 Visual Library 项目", error))?;
    if let Err(error) = fs::rename(candidate, &source) {
        let _ = fs::rename(&backup, &source);
        let _ = fs::remove_dir_all(candidate);
        return Err(FileError::io("无法提交 Visual localization", error));
    }
    match visual_library::package(items, id) {
        Ok(package) => {
            let _ = fs::remove_dir_all(&backup);
            Ok(package.item)
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&source);
            let _ = fs::rename(&backup, &source);
            Err(error)
        }
    }
}

pub fn localize_with_fetcher<F: RemoteFetcher>(
    items: &Path,
    _trash: &Path,
    id: &str,
    dependencies: Vec<LocalizationDependency>,
    fetcher: &F,
) -> FileResult<visual_library::VisualLibraryItem> {
    if dependencies.len() > MAX_LOCALIZED_RESOURCES {
        return Err(FileError::new(
            "tooLarge",
            "Make Local 一次最多处理 64 个资源",
        ));
    }
    let package = visual_library::package(items, id)?;
    let mut config = package.item.config.clone();
    let (existing_mappings, _) = config_arrays(&config)?;
    let mut mappings: BTreeMap<String, LocalizedResource> = existing_mappings
        .into_iter()
        .map(|item| (item.source.clone(), item))
        .collect();
    let mut issues = Vec::new();
    let mut assets: BTreeMap<String, Vec<u8>> = package
        .assets
        .into_iter()
        .map(|asset| (asset.path, asset.bytes))
        .collect();
    let mut queue: VecDeque<(LocalizationDependency, bool)> = dependencies
        .into_iter()
        .map(|value| (value, true))
        .collect();
    let mut seen = BTreeSet::new();

    while let Some((dependency, top_level)) = queue.pop_front() {
        let kind = dependency_kind(&dependency.kind)?.to_string();
        let url = https_url(&dependency.source)?;
        let source = url.to_string();
        if !seen.insert((source.clone(), kind.clone())) {
            continue;
        }
        if seen.len() > MAX_LOCALIZED_RESOURCES {
            return Err(FileError::new(
                "tooLarge",
                "Make Local 解析出的资源超过 64 个",
            ));
        }
        if let Some(mapped) = mappings.get(&source) {
            if assets.contains_key(&mapped.path) {
                continue;
            }
        }
        if top_level
            && !package.item.html.contains(&dependency.source)
            && !package.item.html.contains(&source)
        {
            return Err(invalid_format(
                "Make Local 请求包含 Current HTML 未引用的资源",
            ));
        }

        let response = fetcher.fetch(&source, &kind)?;
        let (response, final_url, mime) = validated_response(&source, &kind, response)?;
        let digest = sha256(&response.bytes);
        let path = asset_path(&kind, &mime, &digest);
        validate_asset_path(&path)?;
        if let Some(previous) = assets.get(&path) {
            if previous != &response.bytes {
                return Err(invalid_format("Localized asset hash 路径发生冲突"));
            }
        } else {
            assets.insert(path.clone(), response.bytes.clone());
        }
        mappings.insert(
            source.clone(),
            LocalizedResource {
                source: source.clone(),
                resolved_source: (final_url.as_str() != source).then(|| final_url.to_string()),
                path,
                kind: kind.clone(),
                mime: mime.clone(),
                sha256: digest,
                extra: Map::new(),
            },
        );

        if kind == "stylesheet" {
            let css = std::str::from_utf8(&response.bytes).map_err(|error| {
                FileError::new("encoding", format!("Localized CSS 不是有效 UTF-8：{error}"))
            })?;
            for nested in css_dependencies(css, &final_url, &mut issues)? {
                queue.push_back((nested, false));
            }
        }
    }

    if assets.len() > MAX_VISUAL_FILES {
        return Err(FileError::new(
            "tooLarge",
            "Visual localization 后资源文件数量超过 256",
        ));
    }
    let mut localized: Vec<_> = mappings.into_values().collect();
    localized.sort_by(|left, right| left.source.cmp(&right.source));
    issues.sort_by(|left, right| {
        left.source
            .cmp(&right.source)
            .then_with(|| left.reason.cmp(&right.reason))
    });
    put_config_arrays(&mut config, &localized, &issues)?;

    let config_size = serde_json::to_vec(&config)
        .map_err(|error| FileError::io("无法编码 block.json", error))?
        .len();
    let total = package
        .item
        .html
        .len()
        .saturating_add(package.original_html.len())
        .saturating_add(config_size)
        .saturating_add(assets.values().map(Vec::len).sum::<usize>());
    if total > MAX_VISUAL_BYTES {
        return Err(FileError::new(
            "tooLarge",
            "Make Local 后 Visual Library 项目超过 16 MiB 上限",
        ));
    }

    let candidate = stage_item(
        items,
        id,
        &package.item.html,
        &package.original_html,
        &config,
        &assets,
    )?;
    publish_stage(items, id, &candidate)
}

fn ipv4_public(ip: Ipv4Addr) -> bool {
    let [a, b, c, d] = ip.octets();
    if a == 0 || a == 10 || a == 127 || a >= 224 {
        return false;
    }
    if a == 100 && (64..=127).contains(&b) {
        return false;
    }
    if a == 169 && b == 254 {
        return false;
    }
    if a == 172 && (16..=31).contains(&b) {
        return false;
    }
    if a == 192 && b == 168 {
        return false;
    }
    if a == 192 && b == 0 && (c == 0 || c == 2) {
        return false;
    }
    if a == 192 && b == 88 && c == 99 {
        return false;
    }
    if a == 198 && (b == 18 || b == 19) {
        return false;
    }
    if a == 198 && b == 51 && c == 100 {
        return false;
    }
    if a == 203 && b == 0 && c == 113 {
        return false;
    }
    !(a == 255 && b == 255 && c == 255 && d == 255)
}

fn ipv6_public(ip: Ipv6Addr) -> bool {
    if ip.is_unspecified() || ip.is_loopback() || ip.is_multicast() {
        return false;
    }
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return ipv4_public(mapped);
    }
    let segments = ip.segments();
    if segments[0] & 0xfe00 == 0xfc00 {
        return false;
    }
    if segments[0] & 0xffc0 == 0xfe80 {
        return false;
    }
    if segments[0] == 0x2001 && segments[1] == 0x0db8 {
        return false;
    }
    true
}

pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ipv4_public(ip),
        IpAddr::V6(ip) => ipv6_public(ip),
    }
}

fn resolved_public_address(url: &Url) -> FileResult<(String, SocketAddr)> {
    let host = url
        .host_str()
        .ok_or_else(|| network("Make Local URL 缺少主机"))?
        .to_string();
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") {
        return Err(network("Make Local 不允许访问 localhost"));
    }
    let port = url
        .port_or_known_default()
        .ok_or_else(|| network("Make Local URL 缺少端口"))?;
    if let Ok(ip) = host.parse::<IpAddr>() {
        if !is_public_ip(ip) {
            return Err(network("Make Local 不允许访问非公网地址"));
        }
        return Ok((host, SocketAddr::new(ip, port)));
    }
    let addresses: Vec<_> = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|error| FileError::io("Make Local DNS 解析失败", error))?
        .collect();
    if addresses.is_empty() {
        return Err(network("Make Local DNS 没有返回地址"));
    }
    if addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err(network("Make Local 主机解析到了非公网地址"));
    }
    Ok((host, addresses[0]))
}

impl RemoteFetcher for HttpsFetcher {
    fn fetch(&self, source: &str, _kind: &str) -> FileResult<FetchResponse> {
        let mut current = https_url(source)?;
        for redirect in 0..=MAX_REDIRECTS {
            let (host, address) = resolved_public_address(&current)?;
            let client = Client::builder()
                .redirect(Policy::none())
                .timeout(Duration::from_secs(12))
                .user_agent("FlowNote/0.1 Make-Local")
                .resolve(&host, address)
                .build()
                .map_err(|error| FileError::io("无法初始化 Make Local HTTPS 客户端", error))?;
            let response = client
                .get(current.clone())
                .send()
                .map_err(|error| FileError::io("Make Local HTTPS 下载失败", error))?;
            if response.status().is_redirection() {
                if redirect == MAX_REDIRECTS {
                    return Err(network("Make Local 重定向次数超过上限"));
                }
                let location = response
                    .headers()
                    .get(LOCATION)
                    .ok_or_else(|| network("Make Local 重定向缺少 Location"))?
                    .to_str()
                    .map_err(|_| network("Make Local 重定向 Location 无效"))?;
                current = current
                    .join(location)
                    .map_err(|_| network("Make Local 重定向 URL 无效"))?;
                https_url(current.as_str())?;
                continue;
            }
            if !response.status().is_success() {
                return Err(network(format!(
                    "Make Local 下载返回 HTTP {}",
                    response.status()
                )));
            }
            if response
                .headers()
                .get(CONTENT_LENGTH)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<usize>().ok())
                .is_some_and(|size| size > MAX_DOWNLOAD_BYTES)
            {
                return Err(FileError::new(
                    "tooLarge",
                    "单个 Make Local 资源不能超过 4 MiB",
                ));
            }
            let mime = response
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .map(normalize_mime)
                .unwrap_or_default();
            let mut bytes = Vec::new();
            response
                .take((MAX_DOWNLOAD_BYTES + 1) as u64)
                .read_to_end(&mut bytes)
                .map_err(|error| FileError::io("Make Local 下载读取失败", error))?;
            if bytes.len() > MAX_DOWNLOAD_BYTES {
                return Err(FileError::new(
                    "tooLarge",
                    "单个 Make Local 资源不能超过 4 MiB",
                ));
            }
            return Ok(FetchResponse {
                final_url: current.to_string(),
                mime,
                bytes,
            });
        }
        Err(network("Make Local 重定向次数超过上限"))
    }
}
