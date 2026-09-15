mod atomic_save;
mod file_data;
pub mod file_commands;
pub mod file_error;
pub mod markdown_files;
pub mod note_commands;
pub mod note_files;
mod note_format;
mod note_path;
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
        .invoke_handler(tauri::generate_handler![
            file_commands::markdown_open,
            file_commands::markdown_save,
            file_commands::markdown_save_as,
            file_commands::markdown_reload,
            file_commands::markdown_release,
            note_commands::note_open,
            note_commands::note_save,
            note_commands::note_save_as,
            note_commands::note_reload,
            note_commands::note_release,
        ])
}
