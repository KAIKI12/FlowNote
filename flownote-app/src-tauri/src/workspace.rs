use crate::file_error::{FileError, FileResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const MAX_SEARCH_BYTES: u64 = 2 * 1024 * 1024;
const MAX_SEARCH_RESULTS: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceEntryKind {
    Folder,
    Markdown,
    Note,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub name: String,
    pub relative_path: String,
    pub kind: WorkspaceEntryKind,
    pub children: Vec<WorkspaceEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub workspace_id: String,
    pub name: String,
    pub entries: Vec<WorkspaceEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchResult {
    pub relative_path: String,
    pub kind: WorkspaceEntryKind,
    pub title: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMutation {
    pub relative_path: String,
}

#[derive(Default)]
pub struct WorkspaceStore {
    root: Option<PathBuf>,
}

#[derive(Default)]
pub struct ManagedWorkspace(pub Mutex<WorkspaceStore>);

#[derive(Debug, Serialize, Deserialize)]
struct WorkspaceConfig {
    root: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceSearchRequest {
    pub query: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceCreateRequest {
    pub folder: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceRenameRequest {
    pub relative_path: String,
    pub new_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceOpenRequest {
    pub relative_path: String,
}

impl WorkspaceStore {
    pub fn bind(&mut self, path: &Path) -> FileResult<WorkspaceSnapshot> {
        let root = canonical_directory(path)?;
        self.root = Some(root);
        self.snapshot()
    }

    pub fn persist(&self, config_path: &Path) -> FileResult<()> {
        let root = self.root()?;
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|error| FileError::io("无法创建 Workspace 配置目录", error))?;
        }
        let config = WorkspaceConfig { root: root.to_string_lossy().into_owned() };
        let bytes = serde_json::to_vec_pretty(&config).map_err(|error| FileError::io("无法编码 Workspace 配置", error))?;
        fs::write(config_path, bytes).map_err(|error| FileError::io("无法保存 Workspace 配置", error))
    }

    pub fn restore(&mut self, config_path: &Path) -> FileResult<Option<WorkspaceSnapshot>> {
        let bytes = match fs::read(config_path) {
            Ok(value) => value,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(FileError::io("无法读取 Workspace 配置", error)),
        };
        let config: WorkspaceConfig = serde_json::from_slice(&bytes)
            .map_err(|error| FileError::io("Workspace 配置损坏", error))?;
        let root = PathBuf::from(config.root);
        if !root.is_dir() {
            self.clear();
            return Ok(None);
        }
        self.bind(&root).map(Some)
    }

    pub fn clear(&mut self) {
        self.root = None;
    }

    pub fn root(&self) -> FileResult<&Path> {
        self.root.as_deref().ok_or_else(|| FileError::new("closed", "尚未选择 Workspace"))
    }

    pub fn snapshot(&self) -> FileResult<WorkspaceSnapshot> {
        let root = self.root()?;
        let name = root.file_name().and_then(|value| value.to_str()).filter(|value| !value.is_empty())
            .unwrap_or("Workspace").to_string();
        Ok(WorkspaceSnapshot {
            workspace_id: workspace_id(root),
            name,
            entries: scan_directory(root, root)?,
        })
    }

    pub fn resolve_existing(&self, relative: &str) -> FileResult<PathBuf> {
        let root = self.root()?;
        let parts = validate_relative(relative, false)?;
        let mut current = root.to_path_buf();
        for part in parts {
            current.push(part);
            let metadata = fs::symlink_metadata(&current)
                .map_err(|error| FileError::io("Workspace 条目不存在", error))?;
            if metadata.file_type().is_symlink() {
                return Err(FileError::new("invalidPath", "Workspace 路径不能经过符号链接"));
            }
        }
        let canonical = current.canonicalize().map_err(|error| FileError::io("无法解析 Workspace 条目", error))?;
        if !canonical.starts_with(root) {
            return Err(FileError::new("invalidPath", "Workspace 路径越界"));
        }
        Ok(canonical)
    }

    pub fn resolve_markdown(&self, relative: &str) -> FileResult<PathBuf> {
        let path = self.resolve_existing(relative)?;
        if !path.is_file() || !is_markdown_path(&path) {
            return Err(FileError::new("invalidFormat", "所选条目不是 Markdown 文件"));
        }
        Ok(path)
    }

    pub fn resolve_note(&self, relative: &str) -> FileResult<PathBuf> {
        let path = self.resolve_existing(relative)?;
        if !is_note_package(&path) {
            return Err(FileError::new("invalidFormat", "所选条目不是 FlowNote .note"));
        }
        Ok(path)
    }

    pub fn create_markdown(&mut self, folder: &str) -> FileResult<WorkspaceMutation> {
        let directory = self.resolve_folder(folder)?;
        let mut index = 1usize;
        let target = loop {
            let name = if index == 1 { "Untitled.md".to_string() } else { format!("Untitled {index}.md") };
            let candidate = directory.join(name);
            if !candidate.exists() { break candidate; }
            index += 1;
        };
        fs::write(&target, b"").map_err(|error| FileError::io("无法创建 Markdown 笔记", error))?;
        Ok(WorkspaceMutation { relative_path: relative_string(self.root()?, &target)? })
    }

    pub fn rename(&mut self, relative: &str, new_name: &str) -> FileResult<WorkspaceMutation> {
        validate_leaf_name(new_name)?;
        let source = self.resolve_existing(relative)?;
        let source_kind = entry_kind(&source).ok_or_else(|| FileError::new("invalidFormat", "该 Workspace 条目不能重命名"))?;
        let final_name = normalized_rename(&source, source_kind, new_name);
        validate_leaf_name(&final_name)?;
        let parent = source.parent().ok_or_else(|| FileError::new("invalidPath", "Workspace 条目缺少父目录"))?;
        let target = parent.join(final_name);
        if target.exists() {
            return Err(FileError::new("conflict", "目标名称已经存在"));
        }
        fs::rename(&source, &target).map_err(|error| FileError::io("重命名失败", error))?;
        Ok(WorkspaceMutation { relative_path: relative_string(self.root()?, &target)? })
    }

    pub fn search(&self, query: &str) -> FileResult<Vec<WorkspaceSearchResult>> {
        let needle = query.trim().to_lowercase();
        if needle.is_empty() { return Ok(Vec::new()); }
        let root = self.root()?;
        let mut results = Vec::new();
        search_directory(root, root, &needle, &mut results)?;
        Ok(results)
    }

    fn resolve_folder(&self, relative: &str) -> FileResult<PathBuf> {
        if relative.trim().is_empty() {
            return Ok(self.root()?.to_path_buf());
        }
        let path = self.resolve_existing(relative)?;
        if !path.is_dir() || is_note_package(&path) {
            return Err(FileError::new("invalidPath", "目标不是普通 Workspace 文件夹"));
        }
        Ok(path)
    }
}

fn canonical_directory(path: &Path) -> FileResult<PathBuf> {
    let canonical = path.canonicalize().map_err(|error| FileError::io("无法打开 Workspace", error))?;
    let metadata = fs::metadata(&canonical).map_err(|error| FileError::io("无法读取 Workspace", error))?;
    if !metadata.is_dir() {
        return Err(FileError::new("invalidPath", "Workspace 必须是本地目录"));
    }
    Ok(canonical)
}

fn workspace_id(root: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(root.to_string_lossy().to_lowercase().as_bytes());
    format!("{:x}", hasher.finalize())[..16].to_string()
}

fn validate_relative(relative: &str, allow_empty: bool) -> FileResult<Vec<&str>> {
    if relative.contains(['\\', '\0']) || Path::new(relative).is_absolute() {
        return Err(FileError::new("invalidPath", "Workspace 相对路径无效"));
    }
    let mut parts = Vec::new();
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(value) => {
                let part = value.to_str().ok_or_else(|| FileError::new("invalidPath", "Workspace 路径编码无效"))?;
                if part.contains(':') { return Err(FileError::new("invalidPath", "Workspace 相对路径无效")); }
                parts.push(part);
            }
            _ => return Err(FileError::new("invalidPath", "Workspace 相对路径无效")),
        }
    }
    if !allow_empty && parts.is_empty() {
        return Err(FileError::new("invalidPath", "Workspace 相对路径不能为空"));
    }
    Ok(parts)
}

fn validate_leaf_name(name: &str) -> FileResult<()> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." || trimmed.contains(['/', '\\', '\0', ':']) {
        return Err(FileError::new("invalidPath", "名称无效"));
    }
    if Path::new(trimmed).components().count() != 1 {
        return Err(FileError::new("invalidPath", "名称必须是单个文件名"));
    }
    Ok(())
}

fn normalized_rename(source: &Path, kind: WorkspaceEntryKind, requested: &str) -> String {
    let requested = requested.trim();
    match kind {
        WorkspaceEntryKind::Markdown if !is_markdown_path(Path::new(requested)) => {
            let extension = source.extension().and_then(|value| value.to_str()).unwrap_or("md");
            format!("{requested}.{extension}")
        }
        WorkspaceEntryKind::Note if !requested.to_ascii_lowercase().ends_with(".note") => format!("{requested}.note"),
        _ => requested.to_string(),
    }
}

fn should_skip(name: &str) -> bool {
    name.starts_with('.') || matches!(name.to_ascii_lowercase().as_str(), "node_modules" | "target" | "dist")
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()).as_deref(),
        Some("md") | Some("markdown"))
}

fn is_note_package(path: &Path) -> bool {
    path.is_dir()
        && path.file_name().and_then(|value| value.to_str()).is_some_and(|name| name.to_ascii_lowercase().ends_with(".note"))
        && path.join("content.md").is_file()
        && path.join("note.json").is_file()
}

fn entry_kind(path: &Path) -> Option<WorkspaceEntryKind> {
    if is_note_package(path) { Some(WorkspaceEntryKind::Note) }
    else if path.is_dir() { Some(WorkspaceEntryKind::Folder) }
    else if path.is_file() && is_markdown_path(path) { Some(WorkspaceEntryKind::Markdown) }
    else { None }
}

fn scan_directory(root: &Path, directory: &Path) -> FileResult<Vec<WorkspaceEntry>> {
    let mut entries = Vec::new();
    let iterator = fs::read_dir(directory).map_err(|error| FileError::io("无法扫描 Workspace", error))?;
    for item in iterator {
        let item = item.map_err(|error| FileError::io("无法读取 Workspace 条目", error))?;
        let name = item.file_name().to_string_lossy().into_owned();
        if should_skip(&name) { continue; }
        let metadata = item.file_type().map_err(|error| FileError::io("无法读取 Workspace 条目类型", error))?;
        if metadata.is_symlink() { continue; }
        let path = item.path();
        let Some(kind) = entry_kind(&path) else { continue; };
        let children = if kind == WorkspaceEntryKind::Folder { scan_directory(root, &path)? } else { Vec::new() };
        entries.push(WorkspaceEntry { name, relative_path: relative_string(root, &path)?, kind, children });
    }
    entries.sort_by(compare_entries);
    Ok(entries)
}

fn compare_entries(left: &WorkspaceEntry, right: &WorkspaceEntry) -> Ordering {
    let rank = |kind| if kind == WorkspaceEntryKind::Folder { 0 } else { 1 };
    rank(left.kind).cmp(&rank(right.kind))
        .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
}

fn relative_string(root: &Path, path: &Path) -> FileResult<String> {
    let relative = path.strip_prefix(root).map_err(|_| FileError::new("invalidPath", "Workspace 路径越界"))?;
    let parts = relative.components().map(|part| match part {
        Component::Normal(value) => value.to_string_lossy().into_owned(),
        _ => String::new(),
    }).collect::<Vec<_>>();
    if parts.iter().any(|part| part.is_empty()) {
        return Err(FileError::new("invalidPath", "Workspace 相对路径无效"));
    }
    Ok(parts.join("/"))
}

fn search_directory(root: &Path, directory: &Path, needle: &str, results: &mut Vec<WorkspaceSearchResult>) -> FileResult<()> {
    if results.len() >= MAX_SEARCH_RESULTS { return Ok(()); }
    let iterator = fs::read_dir(directory).map_err(|error| FileError::io("无法搜索 Workspace", error))?;
    for item in iterator {
        if results.len() >= MAX_SEARCH_RESULTS { break; }
        let item = item.map_err(|error| FileError::io("无法读取 Workspace 条目", error))?;
        let name = item.file_name().to_string_lossy().into_owned();
        if should_skip(&name) { continue; }
        let file_type = item.file_type().map_err(|error| FileError::io("无法读取 Workspace 条目类型", error))?;
        if file_type.is_symlink() { continue; }
        let path = item.path();
        if is_note_package(&path) {
            search_note(root, &path, needle, results)?;
        } else if file_type.is_dir() {
            search_directory(root, &path, needle, results)?;
        } else if is_markdown_path(&path) {
            search_markdown(root, &path, needle, results)?;
        }
    }
    Ok(())
}

fn read_search_text(path: &Path) -> FileResult<Option<String>> {
    let metadata = fs::metadata(path).map_err(|error| FileError::io("无法读取搜索文件", error))?;
    if metadata.len() > MAX_SEARCH_BYTES { return Ok(None); }
    match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::InvalidData => Ok(None),
        Err(error) => Err(FileError::io("无法读取搜索文件", error)),
    }
}

fn markdown_title(content: &str, fallback: &str) -> String {
    content.lines().find_map(|line| line.strip_prefix("# ").map(str::trim).filter(|value| !value.is_empty()))
        .unwrap_or(fallback).to_string()
}

fn note_title(note_path: &Path, fallback: &str) -> String {
    fs::read_to_string(note_path.join("note.json")).ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|json| json.get("title").and_then(|value| value.as_str()).map(ToOwned::to_owned))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.trim_end_matches(".note").to_string())
}

fn snippet(content: &str, needle: &str) -> String {
    let lower = content.to_lowercase();
    let Some(index) = lower.find(needle) else {
        return content.lines().find(|line| !line.trim().is_empty()).unwrap_or("").trim().chars().take(160).collect();
    };
    let start = lower[..index].char_indices().rev().nth(50).map(|(idx, _)| idx).unwrap_or(0);
    let end = content[index..].char_indices().nth(160).map(|(idx, _)| index + idx).unwrap_or(content.len());
    content[start..end].replace(['\r', '\n'], " ").trim().to_string()
}

fn search_markdown(root: &Path, path: &Path, needle: &str, results: &mut Vec<WorkspaceSearchResult>) -> FileResult<()> {
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("Markdown");
    let Some(content) = read_search_text(path)? else { return Ok(()); };
    let title = markdown_title(&content, name.trim_end_matches(".md").trim_end_matches(".markdown"));
    if name.to_lowercase().contains(needle) || title.to_lowercase().contains(needle) || content.to_lowercase().contains(needle) {
        results.push(WorkspaceSearchResult {
            relative_path: relative_string(root, path)?,
            kind: WorkspaceEntryKind::Markdown,
            title,
            snippet: snippet(&content, needle),
        });
    }
    Ok(())
}

fn search_note(root: &Path, path: &Path, needle: &str, results: &mut Vec<WorkspaceSearchResult>) -> FileResult<()> {
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("Note");
    let content_path = path.join("content.md");
    let Some(content) = read_search_text(&content_path)? else { return Ok(()); };
    let title = note_title(path, name);
    if name.to_lowercase().contains(needle) || title.to_lowercase().contains(needle) || content.to_lowercase().contains(needle) {
        results.push(WorkspaceSearchResult {
            relative_path: relative_string(root, path)?,
            kind: WorkspaceEntryKind::Note,
            title,
            snippet: snippet(&content, needle),
        });
    }
    Ok(())
}


fn require_main<R: Runtime>(window: &WebviewWindow<R>) -> FileResult<()> {
    if window.label() != "main" {
        return Err(FileError::new("permission", "此窗口无权操作 Workspace"));
    }
    Ok(())
}

fn config_path<R: Runtime>(app: &AppHandle<R>) -> FileResult<PathBuf> {
    let directory = app.path().app_config_dir().map_err(|error| FileError::io("无法定位 FlowNote 配置目录", error))?;
    Ok(directory.join("workspace.json"))
}

fn with_workspace<T, R: Runtime>(
    app: &AppHandle<R>,
    action: impl FnOnce(&mut WorkspaceStore) -> FileResult<T>,
) -> FileResult<T> {
    let state = app.state::<ManagedWorkspace>();
    let mut workspace = state.0.lock().map_err(|error| FileError::io("Workspace 状态异常", error))?;
    action(&mut workspace)
}

pub fn resolve_markdown_from_app<R: Runtime>(app: &AppHandle<R>, relative: &str) -> FileResult<PathBuf> {
    with_workspace(app, |workspace| workspace.resolve_markdown(relative))
}

pub fn resolve_note_from_app<R: Runtime>(app: &AppHandle<R>, relative: &str) -> FileResult<PathBuf> {
    with_workspace(app, |workspace| workspace.resolve_note(relative))
}

#[tauri::command]
pub async fn workspace_pick<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> FileResult<Option<WorkspaceSnapshot>> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().set_parent(&window).set_title("选择 FlowNote Workspace").blocking_pick_folder();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|error| FileError::io("请选择本地 Workspace 目录", error))?;
        let snapshot = with_workspace(&app, |workspace| {
            let snapshot = workspace.bind(&path)?;
            workspace.persist(&config_path(&app)?)?;
            Ok(snapshot)
        })?;
        Ok(Some(snapshot))
    }).await.map_err(|error| FileError::io("Workspace 选择被中断", error))?
}

#[tauri::command]
pub async fn workspace_restore<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> FileResult<Option<WorkspaceSnapshot>> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = config_path(&app)?;
        with_workspace(&app, |workspace| workspace.restore(&path))
    }).await.map_err(|error| FileError::io("Workspace 恢复被中断", error))?
}

#[tauri::command]
pub async fn workspace_scan<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> FileResult<WorkspaceSnapshot> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || with_workspace(&app, |workspace| workspace.snapshot()))
        .await.map_err(|error| FileError::io("Workspace 扫描被中断", error))?
}

#[tauri::command]
pub async fn workspace_search<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: WorkspaceSearchRequest,
) -> FileResult<Vec<WorkspaceSearchResult>> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || with_workspace(&app, |workspace| workspace.search(&request.query)))
        .await.map_err(|error| FileError::io("Workspace 搜索被中断", error))?
}

#[tauri::command]
pub async fn workspace_create_markdown<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: WorkspaceCreateRequest,
) -> FileResult<WorkspaceMutation> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || with_workspace(&app, |workspace| workspace.create_markdown(&request.folder)))
        .await.map_err(|error| FileError::io("Workspace 新建笔记被中断", error))?
}

#[tauri::command]
pub async fn workspace_rename<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: WorkspaceRenameRequest,
) -> FileResult<WorkspaceMutation> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        with_workspace(&app, |workspace| workspace.rename(&request.relative_path, &request.new_name))
    }).await.map_err(|error| FileError::io("Workspace 重命名被中断", error))?
}
