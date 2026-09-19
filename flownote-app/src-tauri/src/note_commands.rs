use crate::file_error::{FileError, FileResult};
use crate::note_files::{validate_save_as, BlockAsset, NoteProbe, NoteSaveAsRequest, NoteSaveRequest, NoteSnapshot, NoteStore};
use crate::workspace::WorkspaceOpenRequest;
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct ManagedNotes(pub Mutex<NoteStore>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssetRequest {
    pub id: String,
    pub block_id: String,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteImageRequest {
    pub id: String,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepairRequest {
    pub id: String,
    pub revision: String,
    pub block_id: String,
}

fn require_main<R: Runtime>(window: &WebviewWindow<R>) -> FileResult<()> {
    if window.label() != "main" { return Err(FileError::new("permission", "此窗口无权操作 Note 文件")); }
    Ok(())
}

fn with_store<T, R: Runtime>(app: &AppHandle<R>, action: impl FnOnce(&mut NoteStore) -> FileResult<T>) -> FileResult<T> {
    let state = app.state::<ManagedNotes>();
    let mut notes = state.0.lock().map_err(|error| FileError::io("Note 服务状态异常", error))?;
    action(&mut notes)
}

async fn note_task<T, F, R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, action: F) -> FileResult<T>
where T: Send + 'static, F: FnOnce(&mut NoteStore) -> FileResult<T> + Send + 'static {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || with_store(&app, action))
        .await.map_err(|error| FileError::io("Note 操作被中断", error))?
}

#[tauri::command]
pub async fn note_open<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> FileResult<Option<NoteSnapshot>> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().set_parent(&window).set_title("打开 FlowNote .note 目录").blocking_pick_folder();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|error| FileError::io("请选择本机 .note 目录", error))?;
        with_store(&app, |notes| notes.open_selected(&path)).map(Some)
    }).await.map_err(|error| FileError::io("Note 选择被中断", error))?
}

#[tauri::command]
pub async fn note_open_workspace<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    request: WorkspaceOpenRequest,
) -> FileResult<NoteSnapshot> {
    require_main(&window)?;
    let path = crate::workspace::resolve_note_from_app(&app, &request.relative_path)?;
    tauri::async_runtime::spawn_blocking(move || with_store(&app, |notes| notes.open_selected(&path)))
        .await.map_err(|error| FileError::io("Workspace Note 打开被中断", error))?
}

#[tauri::command]
pub async fn note_save<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, request: NoteSaveRequest) -> FileResult<NoteSnapshot> {
    note_task(app, window, move |notes| notes.save(request)).await
}

#[tauri::command]
pub async fn note_save_as<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, request: NoteSaveAsRequest) -> FileResult<Option<NoteSnapshot>> {
    require_main(&window)?;
    validate_save_as(&request)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().set_parent(&window).set_file_name(&request.name)
            .set_title("创建新的 FlowNote .note 目录").add_filter("FlowNote", &["note"]).blocking_save_file();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|error| FileError::io("请选择本机 Note 保存位置", error))?;
        with_store(&app, |notes| notes.save_as_selected(&path, request)).map(Some)
    }).await.map_err(|error| FileError::io("Note 保存位置选择被中断", error))?
}

#[tauri::command]
pub async fn note_reload<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, id: String) -> FileResult<NoteSnapshot> {
    note_task(app, window, move |notes| notes.reload(&id)).await
}

#[tauri::command]
pub async fn note_probe<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, id: String) -> FileResult<NoteProbe> {
    note_task(app, window, move |notes| notes.probe(&id)).await
}

#[tauri::command]
pub async fn note_repair_remove_reference<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, request: RepairRequest) -> FileResult<NoteSnapshot> {
    note_task(app, window, move |notes| notes.repair_remove_reference(&request.id, &request.revision, &request.block_id)).await
}

#[tauri::command]
pub async fn note_repair_restore_orphan<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, request: RepairRequest) -> FileResult<NoteSnapshot> {
    note_task(app, window, move |notes| notes.repair_restore_orphan(&request.id, &request.revision, &request.block_id)).await
}

#[tauri::command]
pub async fn note_read_asset<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, request: AssetRequest) -> FileResult<BlockAsset> {
    note_task(app, window, move |notes| notes.read_asset(&request.id, &request.block_id, &request.path)).await
}

#[tauri::command]
pub async fn note_read_image<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, request: NoteImageRequest) -> FileResult<BlockAsset> {
    note_task(app, window, move |notes| notes.read_note_asset(&request.id, &request.path)).await
}

#[tauri::command]
pub async fn note_release<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, id: String) -> FileResult<()> {
    note_task(app, window, move |notes| notes.close(&id)).await
}
