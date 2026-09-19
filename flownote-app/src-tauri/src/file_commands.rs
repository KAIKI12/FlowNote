use crate::file_error::{FileError, FileResult};
use crate::markdown_files::{FileAsset, FileSnapshot, FileStore, SaveRequest};
use crate::workspace::WorkspaceOpenRequest;
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct ManagedFiles(pub Mutex<FileStore>);

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SaveAsRequest {
    pub name: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssetRequest {
    pub id: String,
    pub path: String,
}

fn require_main<R: Runtime>(window: &WebviewWindow<R>) -> FileResult<()> {
    if window.label() != "main" {
        return Err(FileError::new("permission", "此窗口无权操作笔记文件"));
    }
    Ok(())
}

fn with_store<T, R: Runtime>(app: &AppHandle<R>, action: impl FnOnce(&mut FileStore) -> FileResult<T>) -> FileResult<T> {
    let state = app.state::<ManagedFiles>();
    let mut files = state.0.lock().map_err(|error| FileError::io("文件服务状态异常", error))?;
    action(&mut files)
}

async fn file_task<T, F, R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, action: F) -> FileResult<T>
where T: Send + 'static, F: FnOnce(&mut FileStore) -> FileResult<T> + Send + 'static {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || with_store(&app, action))
        .await.map_err(|error| FileError::io("文件操作被中断", error))?
}

#[tauri::command]
pub async fn markdown_open<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> FileResult<Option<FileSnapshot>> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().set_parent(&window)
            .add_filter("Markdown", &["md", "markdown"]).blocking_pick_file();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|error| FileError::io("请选择本地 Markdown 文件", error))?;
        with_store(&app, |files| files.open_selected(&path)).map(Some)
    }).await.map_err(|error| FileError::io("文件选择被中断", error))?
}

#[tauri::command]
pub async fn markdown_open_workspace<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: WorkspaceOpenRequest,
) -> FileResult<FileSnapshot> {
    require_main(&window)?;
    let path = crate::workspace::resolve_markdown_from_app(&app, &request.relative_path)?;
    tauri::async_runtime::spawn_blocking(move || with_store(&app, |files| files.open_selected(&path)))
        .await.map_err(|error| FileError::io("Workspace Markdown 打开被中断", error))?
}

#[tauri::command]
pub async fn markdown_save<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, request: SaveRequest) -> FileResult<FileSnapshot> {
    file_task(app, window, move |files| files.save(request)).await
}

#[tauri::command]
pub async fn markdown_save_as<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, request: SaveAsRequest) -> FileResult<Option<FileSnapshot>> {
    require_main(&window)?;
    crate::file_data::validate_content(&request.content)?;
    if request.name.is_empty() || request.name.contains(['/', '\\', '\0']) {
        return Err(FileError::new("invalidPath", "保存文件名无效"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().set_parent(&window).set_file_name(request.name)
            .add_filter("Markdown", &["md", "markdown"]).blocking_save_file();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|error| FileError::io("请选择本地保存位置", error))?;
        with_store(&app, |files| files.save_as_selected(&path, &request.content)).map(Some)
    }).await.map_err(|error| FileError::io("保存位置选择被中断", error))?
}

#[tauri::command]
pub async fn markdown_reload<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, id: String) -> FileResult<FileSnapshot> {
    file_task(app, window, move |files| files.reload(&id)).await
}

#[tauri::command]
pub async fn markdown_read_asset<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, request: AssetRequest) -> FileResult<FileAsset> {
    file_task(app, window, move |files| files.read_asset(&request.id, &request.path)).await
}

#[tauri::command]
pub async fn markdown_release<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, id: String) -> FileResult<()> {
    file_task(app, window, move |files| files.close(&id)).await
}
