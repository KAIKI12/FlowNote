mod atomic_save;
pub mod browser_bundle;
mod file_data;
pub mod file_commands;
pub mod file_error;
pub mod markdown_files;
pub mod note_commands;
pub mod note_files;
pub mod workspace;
pub mod visual_library;
pub mod visual_localization;
mod note_format;
mod note_path;
mod note_repair;
#[cfg(windows)]
mod windows_file;
#[cfg(windows)]
mod windows_save;
#[cfg(windows)]
mod windows_metadata;
#[cfg(windows)]
mod windows_security;
#[cfg(windows)]
mod windows_note_io;
#[cfg(windows)]
mod windows_note_tree;
#[cfg(windows)]
mod windows_note_stage;
#[cfg(windows)]
mod windows_note_save;

pub fn configure_app<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(file_commands::ManagedFiles::default())
        .manage(note_commands::ManagedNotes::default())
        .manage(visual_library::ManagedVisualLibrary::default())
        .manage(workspace::ManagedWorkspace::default())
        .invoke_handler(tauri::generate_handler![
            file_commands::markdown_open,
            file_commands::markdown_open_workspace,
            file_commands::markdown_save,
            file_commands::markdown_save_as,
            file_commands::markdown_reload,
            file_commands::markdown_read_asset,
            file_commands::markdown_release,
            note_commands::note_open,
            note_commands::note_open_workspace,
            note_commands::note_save,
            note_commands::note_save_as,
            note_commands::note_reload,
            note_commands::note_probe,
            note_commands::note_repair_remove_reference,
            note_commands::note_repair_restore_orphan,
            note_commands::note_read_asset,
            note_commands::note_list_assets,
            note_commands::note_read_image,
            note_commands::note_export_browser_bundle,
            note_commands::note_export_markdown,
            note_commands::note_release,
            visual_library::visual_library_list,
            visual_library::visual_library_collect,
            visual_library::visual_library_package,
            visual_library::visual_library_read_asset,
            visual_library::visual_library_update,
            visual_library::visual_library_trash,
            visual_library::visual_library_restore,
            visual_library::visual_library_localize,
            workspace::workspace_pick,
            workspace::workspace_restore,
            workspace::workspace_scan,
            workspace::workspace_search,
            workspace::workspace_create_markdown,
            workspace::workspace_rename,
            workspace::workspace_trash,
            workspace::workspace_trash_list,
            workspace::workspace_trash_restore,
            workspace::workspace_trash_delete,
        ])
}
