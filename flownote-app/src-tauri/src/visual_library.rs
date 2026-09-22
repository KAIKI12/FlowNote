use crate::file_error::{FileError, FileResult};
use crate::note_commands::ManagedNotes;
use crate::note_files::{asset_mime, validate_asset_path, BlockAsset, BlockPackage};
use crate::note_format;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use uuid::Uuid;

const VISUAL_LIBRARY_VERSION: u64 = 1;
const MAX_LIBRARY_ITEMS: usize = 512;
const MAX_TITLE_CHARS: usize = 160;
const MAX_VISUAL_BYTES: usize = 16 * 1024 * 1024;
const MAX_VISUAL_FILES: usize = 256;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VisualMetadata {
    format_version: u64,
    id: String,
    title: String,
    created_at_ms: u64,
    updated_at_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualLibraryItem {
    pub id: String,
    pub title: String,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
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

fn require_main<R: Runtime>(window: &WebviewWindow<R>) -> FileResult<()> {
    if window.label() != "main" {
        return Err(FileError::new("permission", "此窗口无权操作 Visual Library"));
    }
    Ok(())
}

fn library_root<R: Runtime>(app: &AppHandle<R>) -> FileResult<PathBuf> {
    let root = app.path().app_data_dir()
        .map_err(|error| FileError::io("无法定位 FlowNote Visual Library 目录", error))?
        .join("visual-library")
        .join("items");
    Ok(root)
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
    let bytes = read_bounded(&item.join("visual.json"), crate::file_data::MAX_MARKDOWN_BYTES)?;
    let metadata: VisualMetadata = serde_json::from_slice(&bytes)
        .map_err(|error| FileError::new("invalidFormat", format!("Visual metadata 无效：{error}")))?;
    if metadata.format_version != VISUAL_LIBRARY_VERSION {
        return Err(FileError::new("unsupportedVersion", "Visual Library 项目格式版本不受支持"));
    }
    validate_visual_id(&metadata.id)?;
    title(&metadata.title)?;
    Ok(metadata)
}

fn load_config(item: &Path) -> FileResult<Value> {
    let bytes = read_bounded(&item.join("block.json"), crate::file_data::MAX_MARKDOWN_BYTES)?;
    let config: Value = serde_json::from_slice(&bytes)
        .map_err(|error| FileError::new("invalidFormat", format!("Visual block.json 无效：{error}")))?;
    note_format::validate_config(&config)?;
    Ok(config)
}

fn load_item(root: &Path, id: &str) -> FileResult<(VisualLibraryItem, String, Vec<String>)> {
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
    let (item, _, _) = load_item(root, &id)?;
    Ok(item)
}

pub fn list(root: &Path) -> FileResult<Vec<VisualLibraryItem>> {
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
        let (item, _, _) = load_item(root, &name)?;
        result.push(item);
        if result.len() > MAX_LIBRARY_ITEMS {
            return Err(FileError::new("tooLarge", "Visual Library 项目数量超过上限"));
        }
    }
    result.sort_by(|left, right| right.created_at_ms.cmp(&left.created_at_ms).then_with(|| left.title.cmp(&right.title)));
    Ok(result)
}

pub fn package(root: &Path, id: &str) -> FileResult<VisualLibraryPackage> {
    let (item, original_html, paths) = load_item(root, id)?;
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

#[tauri::command]
pub async fn visual_library_list<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> FileResult<Vec<VisualLibraryItem>> {
    require_main(&window)?;
    let root = library_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || list(&root))
        .await.map_err(|error| FileError::io("Visual Library 列表操作被中断", error))?
}

#[tauri::command]
pub async fn visual_library_collect<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: VisualCollectRequest,
) -> FileResult<VisualLibraryItem> {
    require_main(&window)?;
    let root = library_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let source = {
            let state = app.state::<ManagedNotes>();
            let notes = state.0.lock().map_err(|error| FileError::io("Note 服务状态异常", error))?;
            notes.block_package(&request.note_id, &request.revision, &request.block_id)?
        };
        collect(&root, &request.title, source)
    }).await.map_err(|error| FileError::io("Visual 收藏操作被中断", error))?
}

#[tauri::command]
pub async fn visual_library_package<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: VisualIdRequest,
) -> FileResult<VisualLibraryPackage> {
    require_main(&window)?;
    let root = library_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || package(&root, &request.id))
        .await.map_err(|error| FileError::io("Visual Library 读取操作被中断", error))?
}

#[tauri::command]
pub async fn visual_library_read_asset<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: VisualAssetRequest,
) -> FileResult<BlockAsset> {
    require_main(&window)?;
    let root = library_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || read_asset(&root, &request.id, &request.path))
        .await.map_err(|error| FileError::io("Visual Library 资源读取被中断", error))?
}
