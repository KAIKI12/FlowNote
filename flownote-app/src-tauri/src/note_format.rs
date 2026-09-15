use crate::file_data::{validate_content, MAX_MARKDOWN_BYTES};
use crate::file_error::{FileError, FileResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use uuid::Uuid;

pub const FORMAT_VERSION: u64 = 1;
pub const MAX_NOTE_BLOCKS: usize = 128;
const MAX_VIEWPORT_HEIGHT: u64 = 16_384;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HtmlBlockData {
    pub id: String,
    pub html: String,
    pub original_html: String,
    pub config: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct MixedNoteData {
    pub metadata: Value,
    pub blocks: Vec<HtmlBlockData>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct NoteDocument {
    pub content: String,
    pub mixed: MixedNoteData,
    pub read_only: bool,
    pub notice: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Anchor { id: String }

struct Fence { marker: char, width: usize, anchor: bool, body: String }

fn format_error(message: impl Into<String>) -> FileError {
    FileError::new("invalidFormat", message)
}

pub(crate) fn validate_id(id: &str) -> FileResult<()> {
    let parsed = Uuid::parse_str(id).map_err(|_| format_error("Block ID 必须是规范的小写 UUID"))?;
    if parsed.hyphenated().to_string() != id {
        return Err(format_error("Block ID 必须是规范的小写 UUID"));
    }
    Ok(())
}

fn fence_start(line: &str) -> Option<(char, usize, &str)> {
    let trimmed = line.trim_start_matches(' ');
    if line.len() - trimmed.len() > 3 { return None; }
    let marker = trimmed.chars().next()?;
    if marker != '`' && marker != '~' { return None; }
    let width = trimmed.chars().take_while(|value| *value == marker).count();
    if width < 3 { return None; }
    let info = &trimmed[width..];
    if marker == '`' && info.contains('`') { return None; }
    Some((marker, width, info.trim()))
}

fn close_fence(fence: &Fence, line: &str) -> bool {
    fence_start(line).is_some_and(|(marker, width, rest)|
        marker == fence.marker && width >= fence.width && rest.is_empty())
}

fn append_anchor(body: &str, ids: &mut Vec<String>) -> FileResult<()> {
    let anchor: Anchor = serde_json::from_str(body)
        .map_err(|error| format_error(format!("无效 FlowNote Anchor：{error}")))?;
    validate_id(&anchor.id)?;
    if ids.contains(&anchor.id) { return Err(format_error("同一个 HTML Block 被重复引用")); }
    ids.push(anchor.id);
    if ids.len() > MAX_NOTE_BLOCKS { return Err(FileError::new("tooLarge", "HTML Block 数量超过 128")); }
    Ok(())
}

pub(crate) fn anchor_ids(content: &str) -> FileResult<Vec<String>> {
    let mut active: Option<Fence> = None;
    let mut ids = Vec::new();
    for line in content.trim_start_matches('\u{feff}').lines() {
        if let Some(fence) = &mut active {
            if close_fence(fence, line) {
                if fence.anchor { append_anchor(&fence.body, &mut ids)?; }
                active = None;
            } else if fence.anchor { fence.body.push_str(line); fence.body.push('\n'); }
            continue;
        }
        if let Some((marker, width, info)) = fence_start(line) {
            if info.starts_with("flownote-html") && info != "flownote-html" {
                return Err(format_error("FlowNote Anchor 不允许附加 fence 配置"));
            }
            active = Some(Fence { marker, width, anchor: info == "flownote-html", body: String::new() });
        } else if line.contains("flownote-html") && (line.contains("```") || line.contains("~~~")) {
            return Err(format_error("当前无法安全解释嵌套的 FlowNote Anchor，请保留源码并在顶层修复"));
        }
    }
    if active.is_some_and(|fence| fence.anchor) { return Err(format_error("FlowNote Anchor 缺少结束 fence")); }
    Ok(ids)
}

fn forbidden_fields(value: &Value) -> FileResult<()> {
    match value {
        Value::Object(fields) => {
            for (key, child) in fields {
                let normalized: String = key.chars().filter(char::is_ascii_alphanumeric).flat_map(char::to_lowercase).collect();
                if ["network", "networkallowed", "allownetwork", "networkpolicy", "trusted", "trustedhtml",
                    "allowflownoteapi", "hostaccess", "allowhostaccess", "unsafemode", "runtimepermission",
                    "runtimepermissions", "permissions", "runtimetrust"].contains(&normalized.as_str()) {
                    return Err(format_error(format!("运行期权限不能持久化：{key}")));
                }
                forbidden_fields(child)?;
            }
        }
        Value::Array(values) => { for child in values { forbidden_fields(child)?; } }
        _ => {}
    }
    Ok(())
}

fn validate_metadata(metadata: &Value) -> FileResult<()> {
    let object = metadata.as_object().ok_or_else(|| format_error("note.json 必须是对象"))?;
    if metadata["formatVersion"].as_u64() != Some(FORMAT_VERSION) {
        return Err(FileError::new("unsupportedVersion", "此格式版本仅可只读打开，不能重写或降级"));
    }
    if metadata["type"] != "mixed" { return Err(format_error("Note type 必须是 mixed")); }
    for field in ["title", "createdAt", "updatedAt"] {
        if metadata[field].as_str().is_none() { return Err(format_error(format!("Note 缺少文本字段 {field}"))); }
    }
    for field in ["blocks", "blockOrder", "content", "markdown", "body", "html", "assetList"] {
        if object.contains_key(field) { return Err(format_error(format!("note.json 不能保存 {field}"))); }
    }
    forbidden_fields(metadata)
}

fn validate_config(config: &Value) -> FileResult<()> {
    let object = config.as_object().ok_or_else(|| format_error("block.json 必须是对象"))?;
    if config["kind"] != "html" { return Err(format_error("Block kind 必须是 html")); }
    if ![Some("fragment"), Some("document")].contains(&config["inputKind"].as_str()) {
        return Err(format_error("Block inputKind 必须是 fragment 或 document"));
    }
    if ![Some("off"), Some("sandbox")].contains(&config["scriptPolicy"].as_str()) {
        return Err(format_error("Block scriptPolicy 必须是 off 或 sandbox"));
    }
    if !config["viewport"]["heightPx"].as_u64().is_some_and(|height| height > 0 && height <= MAX_VIEWPORT_HEIGHT) {
        return Err(format_error("Block viewport.heightPx 必须是 1 到 16384 的整数"));
    }
    for field in ["order", "previous", "next", "content", "markdown", "html", "originalHtml"] {
        if object.contains_key(field) { return Err(format_error(format!("block.json 不能保存 {field}"))); }
    }
    forbidden_fields(config)
}

pub(crate) fn validate_mixed(content: &str, mixed: &MixedNoteData) -> FileResult<Vec<String>> {
    validate_content(content)?;
    validate_metadata(&mixed.metadata)?;
    if mixed.blocks.len() > MAX_NOTE_BLOCKS { return Err(FileError::new("tooLarge", "HTML Block 数量超过 128")); }
    let mut ids = HashSet::new();
    for block in &mixed.blocks {
        validate_id(&block.id)?;
        if !ids.insert(block.id.as_str()) { return Err(format_error("Block 数据中存在重复 ID")); }
        validate_content(&block.html)?;
        validate_content(&block.original_html)?;
        validate_config(&block.config)?;
    }
    let anchors = anchor_ids(content)?;
    if anchors.iter().any(|id| !ids.contains(id.as_str())) {
        return Err(format_error("HTML Block Missing：Anchor 引用了未提供的 Block"));
    }
    if ids.iter().any(|id| !anchors.iter().any(|anchor| anchor == id)) {
        return Err(format_error("保存请求含未引用的 Block；既有 Orphan 会从原目录保留"));
    }
    Ok(anchors)
}

fn text_file<'a>(files: &'a BTreeMap<String, &[u8]>, path: &str) -> FileResult<&'a str> {
    let bytes = files.get(path).ok_or_else(|| format_error(format!("HTML Block Missing 或缺少文件：{path}")))?;
    if bytes.len() > MAX_MARKDOWN_BYTES { return Err(FileError::new("tooLarge", "Note 文本文件不能超过 2 MiB")); }
    let content = std::str::from_utf8(bytes).map_err(|error| FileError::new("encoding", format!("{path} 不是有效 UTF-8：{error}")))?;
    validate_content(content)?;
    Ok(content)
}

fn json_file(files: &BTreeMap<String, &[u8]>, path: &str) -> FileResult<Value> {
    serde_json::from_str(text_file(files, path)?.trim_start_matches('\u{feff}'))
        .map_err(|error| format_error(format!("{path} 不是有效 JSON：{error}")))
}

fn read_block(files: &BTreeMap<String, &[u8]>, id: String) -> FileResult<HtmlBlockData> {
    let prefix = format!("blocks/{id}");
    let config = json_file(files, &format!("{prefix}/block.json"))?;
    validate_config(&config)?;
    Ok(HtmlBlockData { id, config, html: text_file(files, &format!("{prefix}/index.html"))?.into(),
        original_html: text_file(files, &format!("{prefix}/original.html"))?.into() })
}

pub(crate) fn parse(files: &BTreeMap<String, &[u8]>, read_only: bool) -> FileResult<NoteDocument> {
    let content = text_file(files, "content.md")?.to_string();
    let metadata = json_file(files, "note.json")?;
    let version = metadata["formatVersion"].as_u64().ok_or_else(|| format_error("note.json 缺少有效 formatVersion"))?;
    let mut document = NoteDocument { content, mixed: MixedNoteData { metadata, blocks: Vec::new() }, read_only, notice: None };
    if version != FORMAT_VERSION {
        document.read_only = true;
        document.notice = Some(format!("未知 Note 格式版本 {version}：已按只读安全模式打开，禁止写回或降级"));
        return Ok(document);
    }
    let loaded = validate_metadata(&document.mixed.metadata).and_then(|()| anchor_ids(&document.content))
        .and_then(|ids| ids.into_iter().map(|id| read_block(files, id)).collect::<FileResult<Vec<_>>>());
    match loaded {
        Ok(blocks) => document.mixed.blocks = blocks,
        Err(error) => { document.read_only = true; document.notice = Some(error.message); }
    }
    Ok(document)
}

pub(crate) fn merge_compatible(base: &Value, updated: &mut Value) {
    let (Some(base), Some(updated)) = (base.as_object(), updated.as_object_mut()) else { return; };
    for (key, value) in base {
        match updated.get_mut(key) {
            Some(current) => merge_compatible(value, current),
            None => { updated.insert(key.clone(), value.clone()); }
        }
    }
}
