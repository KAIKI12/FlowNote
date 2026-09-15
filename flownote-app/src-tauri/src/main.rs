// Prevents additional console window on Windows in release mode
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    flownote::configure_app(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
