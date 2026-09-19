#![cfg(windows)]

use flownote::file_commands::ManagedFiles;
use flownote::markdown_files::{FileSnapshot, MAX_MARKDOWN_BYTES};
use flownote::note_commands::ManagedNotes;
use flownote::workspace::ManagedWorkspace;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
use tauri::{App, Manager, WebviewWindow, WebviewWindowBuilder};
use uuid::Uuid;

mod note_support;

const SUCCESS_CALLBACK: u32 = 0;
const ERROR_CALLBACK: u32 = 1;
const CLOSE_HANDLER: u32 = 12;

struct Desktop {
    _app: App<MockRuntime>,
    window: WebviewWindow<MockRuntime>,
    path: PathBuf,
    file: FileSnapshot,
}

impl Desktop {
    fn new(label: &str) -> Self {
        let app = flownote::configure_app(mock_builder()).build(tauri::generate_context!()).unwrap();
        let window = WebviewWindowBuilder::new(&app, label, Default::default()).build().unwrap();
        let directory = std::env::temp_dir().join(format!("flownote-ipc-{}", Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let path = directory.join("中文.md");
        fs::write(&path, "ORIGINAL\n").unwrap();
        // Only selection is supplied by the test; commands and disk operations are production code.
        let file = app.state::<ManagedFiles>().0.lock().unwrap().open_selected(&path).unwrap();
        Self { _app: app, window, path, file }
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

    fn save_request(&self, content: &str) -> Value {
        json!({ "request": { "id": self.file.id, "revision": self.file.revision, "content": content } })
    }
}

#[test]
fn production_dispatch_saves_reloads_and_releases_the_selected_file() {
    let desktop = Desktop::new("main");
    let content = "\u{feff}---\r\ntitle: IPC\r\n---\r\n\r\n[[保留]]\r\n";
    let saved = desktop.call("markdown_save", desktop.save_request(content)).unwrap();
    assert_eq!(saved["content"], content);
    assert!(saved["readOnly"].is_boolean());
    assert!(saved.get("read_only").is_none());
    assert_eq!(fs::read(&desktop.path).unwrap(), content.as_bytes());
    let identity = json!({ "id": desktop.file.id });
    assert_eq!(desktop.call("markdown_reload", identity.clone()).unwrap()["content"], content);
    assert!(desktop.call("markdown_release", identity.clone()).unwrap().is_null());
    assert_eq!(desktop.call("markdown_reload", identity).unwrap_err()["code"], "closed");
}

#[test]
fn production_dispatch_reads_only_bound_markdown_assets() {
    let desktop = Desktop::new("main");
    let directory = desktop.path.parent().unwrap().join("中文.assets");
    fs::create_dir(&directory).unwrap();
    fs::write(directory.join("plot.png"), [137, 80, 78, 71]).unwrap();
    let asset = desktop.call("markdown_read_asset", json!({ "request": {
        "id": desktop.file.id, "path": "中文.assets/plot.png" } })).unwrap();
    assert_eq!(asset["mime"], "image/png");
    assert_eq!(asset["bytes"], json!([137, 80, 78, 71]));
    assert_eq!(desktop.call("markdown_read_asset", json!({ "request": {
        "id": desktop.file.id, "path": "../outside.png" } })).unwrap_err()["code"], "invalidPath");
}

#[test]
fn malformed_save_payloads_never_write_the_file() {
    let desktop = Desktop::new("main");
    let mut extra = desktop.save_request("BAD");
    extra["request"]["path"] = json!("C:/unselected.md");
    for args in [json!({}), json!({ "request": { "id": desktop.file.id } }), extra] {
        assert!(desktop.call("markdown_save", args).is_err());
        assert_eq!(fs::read_to_string(&desktop.path).unwrap(), "ORIGINAL\n");
    }
}

#[test]
fn forged_handles_and_external_conflicts_return_structured_errors() {
    let desktop = Desktop::new("main");
    let mut forged = desktop.save_request("BAD");
    forged["request"]["id"] = json!("forged");
    assert_eq!(desktop.call("markdown_save", forged).unwrap_err()["code"], "closed");
    fs::write(&desktop.path, "EXTERNAL\n").unwrap();
    let error = desktop.call("markdown_save", desktop.save_request("LOCAL\n")).unwrap_err();
    assert_eq!(error["code"], "conflict");
    assert!(error["message"].is_string());
    assert_eq!(fs::read_to_string(&desktop.path).unwrap(), "EXTERNAL\n");
}

#[test]
fn secondary_windows_cannot_invoke_any_file_command() {
    let desktop = Desktop::new("secondary");
    let calls = [
        ("markdown_open", json!({})),
        ("markdown_save", desktop.save_request("BAD")),
        ("markdown_save_as", json!({ "request": { "name": "copy.md", "content": "BAD" } })),
        ("markdown_reload", json!({ "id": desktop.file.id })),
        ("markdown_read_asset", json!({ "request": { "id": desktop.file.id, "path": "中文.assets/plot.png" } })),
        ("markdown_release", json!({ "id": desktop.file.id })),
    ];
    for (command, args) in calls {
        assert_eq!(desktop.call(command, args).unwrap_err()["code"], "permission", "{command}");
    }
    assert_eq!(fs::read_to_string(&desktop.path).unwrap(), "ORIGINAL\n");
}

#[test]
fn invalid_save_as_names_are_rejected_before_native_dialogs() {
    let desktop = Desktop::new("main");
    for name in ["", "../outside.md", "folder\\outside.md", "invalid\0.md"] {
        let args = json!({ "request": { "name": name, "content": "LOCAL" } });
        assert_eq!(desktop.call("markdown_save_as", args).unwrap_err()["code"], "invalidPath");
    }
}

#[test]
fn content_validation_runs_at_the_command_boundary() {
    let desktop = Desktop::new("main");
    for (content, code) in [("NUL\0text".into(), "encoding"), ("x".repeat(MAX_MARKDOWN_BYTES + 1), "tooLarge")] {
        assert_eq!(desktop.call("markdown_save", desktop.save_request(&content)).unwrap_err()["code"], code);
        let args = json!({ "request": { "name": "copy.md", "content": content } });
        assert_eq!(desktop.call("markdown_save_as", args).unwrap_err()["code"], code);
    }
    assert_eq!(fs::read_to_string(&desktop.path).unwrap(), "ORIGINAL\n");
}

#[test]
fn remote_origin_cannot_read_a_selected_local_file() {
    let desktop = Desktop::new("main");
    let result = desktop.call_from("markdown_reload", (json!({ "id": desktop.file.id }), "https://example.com"));
    assert!(result.is_err(), "An external document received a selected local file: {result:?}");
}

#[test]
fn configured_webview_origin_can_use_file_commands() {
    let desktop = Desktop::new("main");
    let origin = desktop.window.url().unwrap();
    let file = desktop.call_from("markdown_reload", (json!({ "id": desktop.file.id }), origin.as_str())).unwrap();
    assert_eq!(file["content"], "ORIGINAL\n");
}

#[test]
fn close_event_subscription_is_allowed_by_the_production_capability() {
    let desktop = Desktop::new("main");
    let args = json!({ "event": "tauri://close-requested", "target": { "kind": "Window", "label": "main" }, "handler": CLOSE_HANDLER });
    let id = desktop.call("plugin:event|listen", args).unwrap();
    assert!(id.is_number());
    assert!(desktop.call("plugin:event|unlisten", json!({ "event": "tauri://close-requested", "eventId": id })).is_ok());
}


#[test]
fn workspace_commands_bind_scan_search_and_open_through_existing_stores() {
    let desktop = Desktop::new("main");
    let root = desktop.path.parent().unwrap().to_path_buf();
    {
        let state = desktop._app.state::<ManagedWorkspace>();
        state.0.lock().unwrap().bind(&root).unwrap();
    }

    let note_path = root.join("visual.note");
    {
        let state = desktop._app.state::<ManagedNotes>();
        state.0.lock().unwrap().save_as_selected(&note_path, note_support::draft()).unwrap();
    }

    let scan = desktop.call("workspace_scan", json!({})).unwrap();
    assert!(scan["entries"].as_array().unwrap().iter().any(|entry| entry["relativePath"] == "中文.md"));
    assert!(scan["entries"].as_array().unwrap().iter().any(|entry| entry["relativePath"] == "visual.note"));

    let search = desktop.call("workspace_search", json!({ "request": { "query": "ORIGINAL" } })).unwrap();
    assert_eq!(search[0]["relativePath"], "中文.md");

    let markdown = desktop.call("markdown_open_workspace", json!({ "request": { "relativePath": "中文.md" } })).unwrap();
    assert_eq!(markdown["content"], "ORIGINAL\n");
    let markdown_id = markdown["id"].as_str().unwrap().to_string();
    assert_eq!(desktop.call("markdown_reload", json!({ "id": markdown_id })).unwrap()["content"], "ORIGINAL\n");

    let note = desktop.call("note_open_workspace", json!({ "request": { "relativePath": "visual.note" } })).unwrap();
    assert!(note["content"].as_str().unwrap().contains("flownote-html"));
    let note_id = note["id"].as_str().unwrap().to_string();
    assert!(desktop.call("note_reload", json!({ "id": note_id })).is_ok());

    let created = desktop.call("workspace_create_markdown", json!({ "request": { "folder": "" } })).unwrap();
    assert!(created["relativePath"].as_str().unwrap().ends_with(".md"));
    let renamed = desktop.call("workspace_rename", json!({ "request": {
        "relativePath": created["relativePath"], "newName": "Renamed.md"
    } })).unwrap();
    assert_eq!(renamed["relativePath"], "Renamed.md");
    assert!(root.join("Renamed.md").is_file());
}

#[test]
fn secondary_window_cannot_use_workspace_commands() {
    let desktop = Desktop::new("secondary");
    let commands = [
        ("workspace_scan", json!({})),
        ("workspace_search", json!({ "request": { "query": "x" } })),
        ("workspace_create_markdown", json!({ "request": { "folder": "" } })),
        ("workspace_rename", json!({ "request": { "relativePath": "x.md", "newName": "y.md" } })),
        ("markdown_open_workspace", json!({ "request": { "relativePath": "中文.md" } })),
        ("note_open_workspace", json!({ "request": { "relativePath": "x.note" } })),
    ];
    for (command, args) in commands {
        let error = desktop.call(command, args).unwrap_err();
        assert_eq!(error["code"], "permission", "{command}");
    }
}
