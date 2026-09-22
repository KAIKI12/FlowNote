#![cfg(windows)]

use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
use tauri::{App, Manager, WebviewWindow, WebviewWindowBuilder};

mod note_support;

const SUCCESS_CALLBACK: u32 = 0;
const ERROR_CALLBACK: u32 = 1;

struct Desktop {
    _app: App<MockRuntime>,
    window: WebviewWindow<MockRuntime>,
}

impl Desktop {
    fn new(label: &str) -> Self {
        let app = flownote::configure_app(mock_builder()).build(tauri::generate_context!()).unwrap();
        let window = WebviewWindowBuilder::new(&app, label, Default::default()).build().unwrap();
        Self { _app: app, window }
    }

    fn call(&self, command: &str, args: Value) -> Result<Value, Value> {
        self.call_from(command, (args, "http://tauri.localhost"))
    }

    fn call_from(&self, command: &str, input: (Value, &str)) -> Result<Value, Value> {
        get_ipc_response(&self.window, tauri::webview::InvokeRequest {
            cmd: command.into(), callback: CallbackFn(SUCCESS_CALLBACK), error: CallbackFn(ERROR_CALLBACK),
            url: input.1.parse().unwrap(), body: InvokeBody::Json(input.0),
            headers: Default::default(), invoke_key: INVOKE_KEY.into(),
        }).map(|body| body.deserialize::<Value>().unwrap())
    }

    fn selected(&self) -> (std::path::PathBuf, flownote::note_files::NoteSnapshot) {
        let path = note_support::folder().join("commands.note");
        let note = self._app.state::<flownote::note_commands::ManagedNotes>().0.lock().unwrap()
            .save_as_selected(&path, note_support::draft()).unwrap();
        (path, note)
    }
}

fn mixed() -> Value {
    json!({ "metadata": { "formatVersion": 1, "type": "mixed", "title": "Note",
        "createdAt": "2026-09-14T23:00:00+08:00", "updatedAt": "2026-09-14T23:00:00+08:00" },
        "blocks": [] })
}

#[test]
fn new_note_commands_are_registered_and_capabilities_are_not_paths() {
    let desktop = Desktop::new("main");
    assert!(desktop.call("note_release", json!({ "id": "note:closed" })).unwrap().is_null());
    for command in ["note_reload", "note_probe", "note_save"] {
        let args = if command == "note_save" {
            json!({ "request": { "id": "E:/unselected.note", "revision": "forged",
                "content": "BAD", "mixed": mixed() } })
        } else { json!({ "id": "E:/unselected.note" }) };
        assert_eq!(desktop.call(command, args).unwrap_err()["code"], "closed");
    }
}

#[test]
fn every_note_command_denies_non_main_windows_before_dialog_or_disk_access() {
    let desktop = Desktop::new("untrusted-preview");
    let calls = [
        ("note_open", json!({})),
        ("note_save", json!({ "request": { "id": "note:unknown", "revision": "x", "content": "BAD", "mixed": mixed() } })),
        ("note_save_as", json!({ "request": { "name": "new.note", "content": "BAD", "mixed": mixed() } })),
        ("note_reload", json!({ "id": "note:unknown" })),
        ("note_probe", json!({ "id": "note:unknown" })),
        ("note_repair_remove_reference", json!({ "request": { "id": "note:unknown", "revision": "x", "blockId": note_support::SECOND } })),
        ("note_repair_restore_orphan", json!({ "request": { "id": "note:unknown", "revision": "x", "blockId": note_support::SECOND } })),
        ("note_read_asset", json!({ "request": { "id": "note:unknown", "blockId": note_support::FIRST, "path": "assets/style.css" } })),
        ("note_list_assets", json!({ "request": { "id": "note:unknown", "blockId": note_support::FIRST } })),
        ("note_read_image", json!({ "request": { "id": "note:unknown", "path": "assets/images/plot.png" } })),
        ("note_export_browser_bundle", json!({ "request": { "id": "note:unknown", "revision": "x",
            "folderName": "Export", "title": "Export", "content": "text", "indexHtml": "<html></html>", "blocks": [] } })),
        ("note_export_markdown", json!({ "request": { "id": "note:unknown", "revision": "x",
            "folderName": "Markdown Export", "markdownName": "Export.md", "content": "text", "blocks": [] } })),
        ("note_release", json!({ "id": "note:unknown" })),
        ("visual_library_list", json!({})),
        ("visual_library_collect", json!({ "request": { "noteId": "note:unknown", "revision": "x",
            "blockId": note_support::FIRST, "title": "Visual" } })),
        ("visual_library_package", json!({ "request": { "id": note_support::FIRST } })),
        ("visual_library_read_asset", json!({ "request": { "id": note_support::FIRST, "path": "assets/style.css" } })),
        ("visual_library_update", json!({ "request": { "id": note_support::FIRST, "title": "Visual",
            "favorite": true, "tags": ["report"] } })),
        ("visual_library_trash", json!({ "request": { "id": note_support::FIRST } })),
        ("visual_library_restore", json!({ "request": { "id": note_support::FIRST } })),
        ("visual_library_localize", json!({ "request": { "id": note_support::FIRST,
            "dependencies": [{ "source": "https://cdn.example/app.js", "kind": "script" }] } })),
    ];
    for (command, args) in calls {
        assert_eq!(desktop.call(command, args).unwrap_err()["code"], "permission", "{command}");
    }
}

#[test]
fn production_dispatch_saves_reloads_and_releases_a_mixed_note() {
    let desktop = Desktop::new("main");
    let (path, note) = desktop.selected();
    let mut mixed = note.mixed.clone();
    mixed.blocks[0].html = "<h2>IPC edited</h2>".into();
    let saved = desktop.call("note_save", json!({ "request": { "id": note.id, "revision": note.revision,
        "content": note.content, "mixed": mixed } })).unwrap();
    assert_eq!(saved["mixed"]["blocks"][0]["html"], "<h2>IPC edited</h2>");
    assert!(saved["readOnly"].is_boolean());
    assert!(saved.get("read_only").is_none());
    let identity = json!({ "id": note.id });
    assert_eq!(desktop.call("note_reload", identity.clone()).unwrap()["revision"], saved["revision"]);
    assert!(desktop.call("note_release", identity.clone()).unwrap().is_null());
    assert_eq!(desktop.call("note_reload", identity).unwrap_err()["code"], "closed");
    assert_eq!(std::fs::read_to_string(path.join("blocks").join(note_support::FIRST).join("index.html")).unwrap(), "<h2>IPC edited</h2>");
}

#[test]
fn production_dispatch_probes_external_note_changes_without_accepting_them() {
    let desktop = Desktop::new("main");
    let (path, note) = desktop.selected();
    let clean = desktop.call("note_probe", json!({ "id": note.id })).unwrap();
    assert_eq!(clean["changed"], false);
    assert_eq!(clean["revision"], note.revision);
    std::fs::write(path.join("content.md"), format!("External\n\n{}", note_support::anchor(note_support::FIRST))).unwrap();
    let changed = desktop.call("note_probe", json!({ "id": note.id })).unwrap();
    assert_eq!(changed["changed"], true);
    assert_ne!(changed["revision"], note.revision);
    let save = desktop.call("note_save", json!({ "request": { "id": note.id, "revision": note.revision,
        "content": note.content, "mixed": note.mixed } })).unwrap_err();
    assert_eq!(save["code"], "conflict");
}

#[test]
fn production_dispatch_repairs_missing_reference_and_restores_orphan() {
    let desktop = Desktop::new("main");
    let (path, note) = desktop.selected();
    std::fs::write(path.join("content.md"), format!("{}{}", note_support::anchor(note_support::FIRST), note_support::anchor(note_support::SECOND))).unwrap();
    let missing = desktop.call("note_reload", json!({ "id": note.id })).unwrap();
    let repaired = desktop.call("note_repair_remove_reference", json!({ "request": {
        "id": note.id, "revision": missing["revision"], "blockId": note_support::SECOND } })).unwrap();
    assert!(!repaired["content"].as_str().unwrap().contains(note_support::SECOND));

    let orphan = path.join("blocks").join(note_support::SECOND);
    std::fs::create_dir(&orphan).unwrap();
    for name in ["block.json", "index.html", "original.html"] {
        std::fs::copy(path.join("blocks").join(note_support::FIRST).join(name), orphan.join(name)).unwrap();
    }
    let with_orphan = desktop.call("note_reload", json!({ "id": note.id })).unwrap();
    let restored = desktop.call("note_repair_restore_orphan", json!({ "request": {
        "id": note.id, "revision": with_orphan["revision"], "blockId": note_support::SECOND } })).unwrap();
    assert!(restored["content"].as_str().unwrap().contains(note_support::SECOND));
    assert_eq!(restored["mixed"]["blocks"].as_array().unwrap().len(), 2);
}

#[test]
fn production_dispatch_reads_scoped_block_assets() {
    let desktop = Desktop::new("main");
    let (path, note) = desktop.selected();
    let assets = path.join("blocks").join(note_support::FIRST).join("assets");
    std::fs::create_dir(&assets).unwrap();
    std::fs::write(assets.join("style.css"), "body{color:red}").unwrap();
    desktop.call("note_reload", json!({ "id": note.id })).unwrap();
    let listed = desktop.call("note_list_assets", json!({ "request": { "id": note.id,
        "blockId": note_support::FIRST } })).unwrap();
    assert_eq!(listed.as_array().unwrap().len(), 1);
    assert_eq!(listed[0]["path"], "assets/style.css");
    assert_eq!(listed[0]["mime"], "text/css");
    assert_eq!(listed[0]["size"], 15);
    assert_eq!(listed[0]["editable"], true);
    let asset = desktop.call("note_read_asset", json!({ "request": { "id": note.id,
        "blockId": note_support::FIRST, "path": "assets/style.css" } })).unwrap();
    assert_eq!(asset["path"], "assets/style.css");
    assert_eq!(asset["mime"], "text/css");
    assert_eq!(asset["bytes"], json!(b"body{color:red}"));
    let escaped = desktop.call("note_read_asset", json!({ "request": { "id": note.id,
        "blockId": note_support::FIRST, "path": "../index.html" } })).unwrap_err();
    assert_eq!(escaped["code"], "invalidPath");
}

#[test]
fn production_dispatch_reads_scoped_note_images() {
    let desktop = Desktop::new("main");
    let (path, note) = desktop.selected();
    let images = path.join("assets/images");
    std::fs::create_dir_all(&images).unwrap();
    std::fs::write(images.join("plot.png"), [137, 80, 78, 71]).unwrap();
    desktop.call("note_reload", json!({ "id": note.id })).unwrap();
    let asset = desktop.call("note_read_image", json!({ "request": { "id": note.id,
        "path": "assets/images/plot.png" } })).unwrap();
    assert_eq!(asset["mime"], "image/png");
    assert_eq!(asset["bytes"], json!([137, 80, 78, 71]));
}

#[test]
fn invalid_names_and_extra_path_payloads_are_rejected_without_dialogs_or_writes() {
    let desktop = Desktop::new("main");
    for name in ["", "../outside.note", "folder\\outside.note", "stream:private.note", "CON.note"] {
        let args = json!({ "request": { "name": name, "content": "text", "mixed": mixed() } });
        assert_eq!(desktop.call("note_save_as", args).unwrap_err()["code"], "invalidPath");
    }
    let (_, note) = desktop.selected();
    let forged = json!({ "request": { "id": note.id, "path": "C:/unselected.note", "revision": note.revision,
        "content": note.content, "mixed": note.mixed } });
    assert!(desktop.call("note_save", forged).is_err());
    assert_eq!(desktop.call("note_reload", json!({ "id": note.id })).unwrap()["revision"], note.revision);
}

#[test]
fn remote_web_content_cannot_read_the_bound_note() {
    let desktop = Desktop::new("main");
    let (_, note) = desktop.selected();
    let result = desktop.call_from("note_reload", (json!({ "id": note.id }), "https://example.com"));
    assert!(result.is_err(), "External content received the local Note: {result:?}");
}
