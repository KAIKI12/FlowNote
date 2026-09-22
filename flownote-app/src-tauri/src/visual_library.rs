use crate::file_error::{FileError, FileResult};
use crate::note_commands::ManagedNotes;
use crate::note_files::{asset_mime, validate_asset_path, BlockAsset, BlockPackage};
use crate::note_format;
use crate::visual_localization::{self, HttpsFetcher, LocalizationDependency};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use uuid::Uuid;

const VISUAL_LIBRARY_VERSION: u64 = 1;
const MAX_LIBRARY_ITEMS: usize = 512;
const MAX_TITLE_CHARS: usize = 160;
const MAX_TAGS: usize = 16;
const MAX_TAG_CHARS: usize = 32;
const MAX_VISUAL_BYTES: usize = 16 * 1024 * 1024;
const MAX_VISUAL_FILES: usize = 256;
const METADATA_BACKUP: &str = ".visual.json.flownote-backup";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VisualMetadata {
    format_version: u64,
    id: String,
    title: String,
    created_at_ms: u64,
    updated_at_ms: u64,
    #[serde(default)]
    favorite: bool,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualLibraryItem {
    pub id: String,
    pub title: String,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub trashed: bool,
    pub html: String,
    pub config: Value,
    pub asset_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualLibraryPackage {
    pub item: VisualLibraryItem,
    pub original_html: String,
    pub assets: Vec<BlockAsset>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisualCollectRequest {
    pub note_id: String,
    pub revision: String,
    pub block_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisualIdRequest {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisualAssetRequest {
    pub id: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisualMetadataUpdateRequest {
    pub id: String,
    pub title: String,
    pub favorite: bool,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisualLocalizeRequest {
    pub id: String,
    pub dependencies: Vec<LocalizationDependency>,
}

#[derive(Default)]
pub struct ManagedVisualLibrary(pub Mutex<()>);

#[derive(Debug, Clone)]
struct LibraryRoots {
    items: PathBuf,
    trash: PathBuf,
}

fn require_main<R: Runtime>(window: &WebviewWindow<R>) -> FileResult<()> {
    if window.label() != "main" {
        return Err(FileError::new("permission", "此窗口无权操作 Visual Library"));
    }
    Ok(())
}

fn library_roots<R: Runtime>(app: &AppHandle<R>) -> FileResult<LibraryRoots> {
    let root = app.path().app_data_dir()
        .map_err(|error| FileError::io("无法定位 FlowNote Visual Library 目录", error))?
        .join("visual-library");
    Ok(LibraryRoots { items: root.join("items"), trash: root.join("trash") })
}

fn now_ms() -> FileResult<u64> {
    let value = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|error| FileError::io("系统时间无效", error))?
        .as_millis();
    u64::try_from(value).map_err(|_| FileError::new("invalidFormat", "系统时间超出范围"))
}

fn title(value: &str) -> FileResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(FileError::new("invalidFormat", "Visual 标题不能为空"));
    }
    if trimmed.chars().count() > MAX_TITLE_CHARS || trimmed.chars().any(|value| value.is_control()) {
        return Err(FileError::new("invalidFormat", "Visual 标题过长或包含控制字符"));
    }
    Ok(trimmed.to_string())
}

fn normalize_tags(values: Vec<String>) -> FileResult<Vec<String>> {
    if values.len() > MAX_TAGS {
        return Err(FileError::new("invalidFormat", "Visual tags 最多 16 个"));
    }
    let mut seen = BTreeSet::new();
    let mut result = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() || trimmed.chars().count() > MAX_TAG_CHARS || trimmed.chars().any(|ch| ch.is_control()) {
            return Err(FileError::new("invalidFormat", "Visual tag 不能为空、超过 32 字符或包含控制字符"));
        }
        let key = trimmed.to_lowercase();
        if seen.insert(key) { result.push(trimmed.to_string()); }
    }
    Ok(result)
}

fn validate_visual_id(id: &str) -> FileResult<()> {
    note_format::validate_id(id)
}

fn json_bytes<T: Serialize>(value: &T) -> FileResult<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| FileError::io("无法编码 Visual Library 元数据", error))?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn write_new(path: &Path, bytes: &[u8]) -> FileResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| FileError::io("无法创建 Visual Library 目录", error))?;
    }
    fs::write(path, bytes).map_err(|error| FileError::io("无法写入 Visual Library", error))
}

fn replace_metadata(item: &Path, metadata: &VisualMetadata) -> FileResult<()> {
    ensure_directory(item)?;
    let current = item.join("visual.json");
    let backup = item.join(METADATA_BACKUP);
    if !current.exists() && backup.exists() {
        ensure_regular_file(&backup)?;
        fs::rename(&backup, &current).map_err(|error| FileError::io("无法恢复 Visual metadata 备份", error))?;
    }
    ensure_regular_file(&current)?;
    if backup.exists() {
        ensure_regular_file(&backup)?;
        fs::remove_file(&backup).map_err(|error| FileError::io("无法清理 Visual metadata 备份", error))?;
    }
    let candidate = item.join(format!(".visual.json.{}.tmp", Uuid::new_v4()));
    write_new(&candidate, &json_bytes(metadata)?)?;
    fs::rename(&current, &backup).map_err(|error| {
        let _ = fs::remove_file(&candidate);
        FileError::io("无法暂存 Visual metadata", error)
    })?;
    if let Err(error) = fs::rename(&candidate, &current) {
        let _ = fs::rename(&backup, &current);
        let _ = fs::remove_file(&candidate);
        return Err(FileError::io("无法提交 Visual metadata", error));
    }
    let _ = fs::remove_file(&backup);
    Ok(())
}

fn ensure_regular_file(path: &Path) -> FileResult<()> {
    let metadata = fs::symlink_metadata(path).map_err(|error| FileError::io("无法读取 Visual Library 文件", error))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(FileError::new("invalidPath", "Visual Library 只允许普通文件"));
    }
    Ok(())
}

fn ensure_directory(path: &Path) -> FileResult<()> {
    let metadata = fs::symlink_metadata(path).map_err(|error| FileError::io("无法读取 Visual Library 目录", error))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(FileError::new("invalidPath", "Visual Library 只允许普通目录"));
    }
    Ok(())
}

fn read_bounded(path: &Path, limit: usize) -> FileResult<Vec<u8>> {
    ensure_regular_file(path)?;
    let metadata = fs::metadata(path).map_err(|error| FileError::io("无法读取 Visual Library 文件大小", error))?;
    if metadata.len() > limit as u64 {
        return Err(FileError::new("tooLarge", "Visual Library 文件超过大小上限"));
    }
    fs::read(path).map_err(|error| FileError::io("无法读取 Visual Library 文件", error))
}

fn read_text(path: &Path) -> FileResult<String> {
    let bytes = read_bounded(path, crate::file_data::MAX_MARKDOWN_BYTES)?;
    let text = String::from_utf8(bytes).map_err(|error| FileError::new("encoding", format!("Visual Library 文件不是 UTF-8：{error}")))?;
    crate::file_data::validate_content(&text)?;
    Ok(text)
}

fn item_dir(root: &Path, id: &str) -> FileResult<PathBuf> {
    validate_visual_id(id)?;
    Ok(root.join(id))
}

fn safe_asset_path(item: &Path, relative: &str) -> FileResult<PathBuf> {
    validate_asset_path(relative)?;
    ensure_directory(item)?;
    let mut current = item.to_path_buf();
    for part in relative.split('/') {
        current.push(part);
        let metadata = fs::symlink_metadata(&current).map_err(|error| FileError::io("Visual 资源不存在", error))?;
        if metadata.file_type().is_symlink() {
            return Err(FileError::new("invalidPath", "Visual Library 资源不能经过符号链接"));
        }
    }
    ensure_regular_file(&current)?;
    Ok(current)
}

fn asset_paths(item: &Path) -> FileResult<Vec<String>> {
    let assets = item.join("assets");
    match fs::symlink_metadata(&assets) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(FileError::io("无法读取 Visual assets", error)),
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() =>
            return Err(FileError::new("invalidPath", "Visual assets 必须是普通目录")),
        Ok(_) => {}
    }
    let mut pending = vec![(assets, "assets".to_string())];
    let mut result = Vec::new();
    while let Some((directory, relative)) = pending.pop() {
        for entry in fs::read_dir(&directory).map_err(|error| FileError::io("无法列出 Visual assets", error))? {
            let entry = entry.map_err(|error| FileError::io("无法读取 Visual asset", error))?;
            let name = entry.file_name().into_string().map_err(|_| FileError::new("invalidPath", "Visual asset 路径编码无效"))?;
            if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', '\0', ':']) {
                return Err(FileError::new("invalidPath", "Visual asset 名称无效"));
            }
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).map_err(|error| FileError::io("无法读取 Visual asset 状态", error))?;
            if metadata.file_type().is_symlink() {
                return Err(FileError::new("invalidPath", "Visual Library 不允许符号链接资源"));
            }
            let child = format!("{relative}/{name}");
            if metadata.is_dir() {
                pending.push((path, child));
            } else if metadata.is_file() {
                validate_asset_path(&child)?;
                result.push(child);
                if result.len() > MAX_VISUAL_FILES {
                    return Err(FileError::new("tooLarge", "Visual 资源文件数量超过上限"));
                }
            } else {
                return Err(FileError::new("invalidPath", "Visual Library 资源类型不受支持"));
            }
        }
    }
    result.sort();
    Ok(result)
}

fn load_metadata(item: &Path) -> FileResult<VisualMetadata> {
    let current = item.join("visual.json");
    let backup = item.join(METADATA_BACKUP);
    let path = if current.exists() { current } else if backup.exists() { backup } else { current };
    let bytes = read_bounded(&path, crate::file_data::MAX_MARKDOWN_BYTES)?;
    let mut metadata: VisualMetadata = serde_json::from_slice(&bytes)
        .map_err(|error| FileError::new("invalidFormat", format!("Visual metadata 无效：{error}")))?;
    if metadata.format_version != VISUAL_LIBRARY_VERSION {
        return Err(FileError::new("unsupportedVersion", "Visual Library 项目格式版本不受支持"));
    }
    validate_visual_id(&metadata.id)?;
    metadata.title = title(&metadata.title)?;
    metadata.tags = normalize_tags(metadata.tags)?;
    Ok(metadata)
}

fn load_config(item: &Path) -> FileResult<Value> {
    let bytes = read_bounded(&item.join("block.json"), crate::file_data::MAX_MARKDOWN_BYTES)?;
    let config: Value = serde_json::from_slice(&bytes)
        .map_err(|error| FileError::new("invalidFormat", format!("Visual block.json 无效：{error}")))?;
    note_format::validate_config(&config)?;
    Ok(config)
}

fn load_item(root: &Path, id: &str, trashed: bool) -> FileResult<(VisualLibraryItem, String, Vec<String>)> {
    let item = item_dir(root, id)?;
    ensure_directory(&item)?;
    let metadata = load_metadata(&item)?;
    if metadata.id != id {
        return Err(FileError::new("invalidFormat", "Visual 目录 ID 与 metadata 不一致"));
    }
    let html = read_text(&item.join("index.html"))?;
    let original_html = read_text(&item.join("original.html"))?;
    let config = load_config(&item)?;
    let assets = asset_paths(&item)?;
    Ok((VisualLibraryItem {
        id: metadata.id,
        title: metadata.title,
        created_at_ms: metadata.created_at_ms,
        updated_at_ms: metadata.updated_at_ms,
        favorite: metadata.favorite,
        tags: metadata.tags,
        trashed,
        html,
        config,
        asset_count: assets.len(),
    }, original_html, assets))
}

pub fn collect(root: &Path, requested_title: &str, source: BlockPackage) -> FileResult<VisualLibraryItem> {
    fs::create_dir_all(root).map_err(|error| FileError::io("无法创建 Visual Library", error))?;
    if fs::read_dir(root).map_err(|error| FileError::io("无法读取 Visual Library", error))?.count() >= MAX_LIBRARY_ITEMS {
        return Err(FileError::new("tooLarge", "Visual Library 已达到 512 项上限"));
    }
    let id = Uuid::new_v4().hyphenated().to_string();
    let timestamp = now_ms()?;
    let metadata = VisualMetadata {
        format_version: VISUAL_LIBRARY_VERSION,
        id: id.clone(),
        title: title(requested_title)?,
        created_at_ms: timestamp,
        updated_at_ms: timestamp,
        favorite: false,
        tags: Vec::new(),
    };
    note_format::validate_config(&source.block.config)?;
    crate::file_data::validate_content(&source.block.html)?;
    crate::file_data::validate_content(&source.block.original_html)?;

    let candidate = root.join(format!(".{id}.flownote-collect.tmp"));
    let target = root.join(&id);
    if candidate.exists() { fs::remove_dir_all(&candidate).map_err(|error| FileError::io("无法清理 Visual 暂存目录", error))?; }
    fs::create_dir(&candidate).map_err(|error| FileError::io("无法创建 Visual 暂存目录", error))?;
    let result = (|| -> FileResult<()> {
        write_new(&candidate.join("visual.json"), &json_bytes(&metadata)?)?;
        write_new(&candidate.join("index.html"), source.block.html.as_bytes())?;
        write_new(&candidate.join("original.html"), source.block.original_html.as_bytes())?;
        write_new(&candidate.join("block.json"), &json_bytes(&source.block.config)?)?;
        let mut total = source.block.html.len() + source.block.original_html.len();
        for asset in &source.assets {
            validate_asset_path(&asset.path)?;
            total = total.saturating_add(asset.bytes.len());
            if total > MAX_VISUAL_BYTES {
                return Err(FileError::new("tooLarge", "Visual Library 项目超过 16 MiB 上限"));
            }
            write_new(&candidate.join(Path::new(&asset.path)), &asset.bytes)?;
        }
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&candidate);
        return Err(error);
    }
    fs::rename(&candidate, &target).map_err(|error| {
        let _ = fs::remove_dir_all(&candidate);
        FileError::io("无法发布 Visual Library 项目", error)
    })?;
    let (item, _, _) = load_item(root, &id, false)?;
    Ok(item)
}

fn list_at(root: &Path, trashed: bool) -> FileResult<Vec<VisualLibraryItem>> {
    match fs::symlink_metadata(root) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(FileError::io("无法读取 Visual Library", error)),
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() =>
            return Err(FileError::new("invalidPath", "Visual Library 根目录无效")),
        Ok(_) => {}
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| FileError::io("无法列出 Visual Library", error))? {
        let entry = entry.map_err(|error| FileError::io("无法读取 Visual Library 项目", error))?;
        let name = match entry.file_name().into_string() { Ok(value) => value, Err(_) => continue };
        if name.starts_with('.') || validate_visual_id(&name).is_err() { continue; }
        let (item, _, _) = load_item(root, &name, trashed)?;
        result.push(item);
        if result.len() > MAX_LIBRARY_ITEMS {
            return Err(FileError::new("tooLarge", "Visual Library 项目数量超过上限"));
        }
    }
    result.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms)
        .then_with(|| right.created_at_ms.cmp(&left.created_at_ms))
        .then_with(|| left.title.cmp(&right.title)));
    Ok(result)
}

pub fn list(root: &Path) -> FileResult<Vec<VisualLibraryItem>> {
    list_at(root, false)
}

pub fn list_with_trash(items: &Path, trash: &Path) -> FileResult<Vec<VisualLibraryItem>> {
    let mut active = list_at(items, false)?;
    let mut deleted = list_at(trash, true)?;
    active.append(&mut deleted);
    Ok(active)
}

pub fn package(root: &Path, id: &str) -> FileResult<VisualLibraryPackage> {
    let (item, original_html, paths) = load_item(root, id, false)?;
    let directory = item_dir(root, id)?;
    let mut assets = Vec::new();
    let mut total = item.html.len() + original_html.len();
    for relative in paths {
        let path = safe_asset_path(&directory, &relative)?;
        let bytes = read_bounded(&path, MAX_VISUAL_BYTES)?;
        total = total.saturating_add(bytes.len());
        if total > MAX_VISUAL_BYTES {
            return Err(FileError::new("tooLarge", "Visual Library 项目超过 16 MiB 上限"));
        }
        assets.push(BlockAsset { path: relative.clone(), mime: asset_mime(&relative).into(), bytes });
    }
    Ok(VisualLibraryPackage { item, original_html, assets })
}

pub fn read_asset(root: &Path, id: &str, relative: &str) -> FileResult<BlockAsset> {
    let item = item_dir(root, id)?;
    let path = safe_asset_path(&item, relative)?;
    let bytes = read_bounded(&path, MAX_VISUAL_BYTES)?;
    Ok(BlockAsset { path: relative.into(), mime: asset_mime(relative).into(), bytes })
}

fn located_root<'a>(items: &'a Path, trash: &'a Path, id: &str) -> FileResult<(&'a Path, bool)> {
    validate_visual_id(id)?;
    let active = item_dir(items, id)?;
    match fs::symlink_metadata(&active) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() =>
            return Err(FileError::new("invalidPath", "Visual Library 项目目录无效")),
        Ok(_) => return Ok((items, false)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(FileError::io("无法检查 Visual Library 项目", error)),
    }
    let deleted = item_dir(trash, id)?;
    match fs::symlink_metadata(&deleted) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() =>
            Err(FileError::new("invalidPath", "Visual Library Trash 项目目录无效")),
        Ok(_) => Ok((trash, true)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound =>
            Err(FileError::new("notFound", "Visual Library 项目不存在")),
        Err(error) => Err(FileError::io("无法检查 Visual Library Trash", error)),
    }
}

pub fn update_metadata(items: &Path, trash: &Path, request: VisualMetadataUpdateRequest) -> FileResult<VisualLibraryItem> {
    let (root, trashed) = located_root(items, trash, &request.id)?;
    let directory = item_dir(root, &request.id)?;
    let mut metadata = load_metadata(&directory)?;
    metadata.title = title(&request.title)?;
    metadata.favorite = request.favorite;
    metadata.tags = normalize_tags(request.tags)?;
    metadata.updated_at_ms = now_ms()?;
    replace_metadata(&directory, &metadata)?;
    load_item(root, &request.id, trashed).map(|(item, _, _)| item)
}

pub fn move_to_trash(items: &Path, trash: &Path, id: &str) -> FileResult<VisualLibraryItem> {
    validate_visual_id(id)?;
    let source = item_dir(items, id)?;
    ensure_directory(&source)?;
    fs::create_dir_all(trash).map_err(|error| FileError::io("无法创建 Visual Library Trash", error))?;
    let target = item_dir(trash, id)?;
    if fs::symlink_metadata(&target).is_ok() {
        return Err(FileError::new("conflict", "Visual Library Trash 中已存在同 ID 项目"));
    }
    let mut metadata = load_metadata(&source)?;
    metadata.updated_at_ms = now_ms()?;
    replace_metadata(&source, &metadata)?;
    fs::rename(&source, &target).map_err(|error| FileError::io("无法移动 Visual 到 Trash", error))?;
    load_item(trash, id, true).map(|(item, _, _)| item)
}

pub fn restore_from_trash(items: &Path, trash: &Path, id: &str) -> FileResult<VisualLibraryItem> {
    validate_visual_id(id)?;
    let source = item_dir(trash, id)?;
    ensure_directory(&source)?;
    fs::create_dir_all(items).map_err(|error| FileError::io("无法创建 Visual Library", error))?;
    let target = item_dir(items, id)?;
    if fs::symlink_metadata(&target).is_ok() {
        return Err(FileError::new("conflict", "Visual Library 中已存在同 ID 项目"));
    }
    let mut metadata = load_metadata(&source)?;
    metadata.updated_at_ms = now_ms()?;
    replace_metadata(&source, &metadata)?;
    fs::rename(&source, &target).map_err(|error| FileError::io("无法从 Trash 恢复 Visual", error))?;
    load_item(items, id, false).map(|(item, _, _)| item)
}

pub fn read_asset_with_trash(items: &Path, trash: &Path, id: &str, relative: &str) -> FileResult<BlockAsset> {
    let (root, _) = located_root(items, trash, id)?;
    read_asset(root, id, relative)
}
#[tauri::command]
pub async fn visual_library_list<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> FileResult<Vec<VisualLibraryItem>> {
    require_main(&window)?;
    let roots = library_roots(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ManagedVisualLibrary>();
        let _guard = state.0.lock().map_err(|error| FileError::io("Visual Library 状态异常", error))?;
        list_with_trash(&roots.items, &roots.trash)
    }).await.map_err(|error| FileError::io("Visual Library 列表操作被中断", error))?
}

#[tauri::command]
pub async fn visual_library_collect<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: VisualCollectRequest,
) -> FileResult<VisualLibraryItem> {
    require_main(&window)?;
    let roots = library_roots(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let library = app.state::<ManagedVisualLibrary>();
        let _guard = library.0.lock().map_err(|error| FileError::io("Visual Library 状态异常", error))?;
        let source = {
            let state = app.state::<ManagedNotes>();
            let notes = state.0.lock().map_err(|error| FileError::io("Note 服务状态异常", error))?;
            notes.block_package(&request.note_id, &request.revision, &request.block_id)?
        };
        collect(&roots.items, &request.title, source)
    }).await.map_err(|error| FileError::io("Visual 收藏操作被中断", error))?
}

#[tauri::command]
pub async fn visual_library_package<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: VisualIdRequest,
) -> FileResult<VisualLibraryPackage> {
    require_main(&window)?;
    let roots = library_roots(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ManagedVisualLibrary>();
        let _guard = state.0.lock().map_err(|error| FileError::io("Visual Library 状态异常", error))?;
        package(&roots.items, &request.id)
    }).await.map_err(|error| FileError::io("Visual Library 读取操作被中断", error))?
}

#[tauri::command]
pub async fn visual_library_read_asset<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: VisualAssetRequest,
) -> FileResult<BlockAsset> {
    require_main(&window)?;
    let roots = library_roots(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ManagedVisualLibrary>();
        let _guard = state.0.lock().map_err(|error| FileError::io("Visual Library 状态异常", error))?;
        read_asset_with_trash(&roots.items, &roots.trash, &request.id, &request.path)
    }).await.map_err(|error| FileError::io("Visual Library 资源读取被中断", error))?
}

#[tauri::command]
pub async fn visual_library_update<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: VisualMetadataUpdateRequest,
) -> FileResult<VisualLibraryItem> {
    require_main(&window)?;
    let roots = library_roots(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ManagedVisualLibrary>();
        let _guard = state.0.lock().map_err(|error| FileError::io("Visual Library 状态异常", error))?;
        update_metadata(&roots.items, &roots.trash, request)
    }).await.map_err(|error| FileError::io("Visual metadata 更新被中断", error))?
}

#[tauri::command]
pub async fn visual_library_trash<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: VisualIdRequest,
) -> FileResult<VisualLibraryItem> {
    require_main(&window)?;
    let roots = library_roots(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ManagedVisualLibrary>();
        let _guard = state.0.lock().map_err(|error| FileError::io("Visual Library 状态异常", error))?;
        move_to_trash(&roots.items, &roots.trash, &request.id)
    }).await.map_err(|error| FileError::io("Visual Trash 操作被中断", error))?
}

#[tauri::command]
pub async fn visual_library_restore<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: VisualIdRequest,
) -> FileResult<VisualLibraryItem> {
    require_main(&window)?;
    let roots = library_roots(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ManagedVisualLibrary>();
        let _guard = state.0.lock().map_err(|error| FileError::io("Visual Library 状态异常", error))?;
        restore_from_trash(&roots.items, &roots.trash, &request.id)
    }).await.map_err(|error| FileError::io("Visual Restore 操作被中断", error))?
}

#[tauri::command]
pub async fn visual_library_localize<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: VisualLocalizeRequest,
) -> FileResult<VisualLibraryItem> {
    require_main(&window)?;
    let roots = library_roots(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ManagedVisualLibrary>();
        let _guard = state.0.lock().map_err(|error| FileError::io("Visual Library 状态异常", error))?;
        let fetcher = HttpsFetcher;
        visual_localization::localize_with_fetcher(
            &roots.items, &roots.trash, &request.id, request.dependencies, &fetcher,
        )
    }).await.map_err(|error| FileError::io("Visual Make Local 操作被中断", error))?
}
