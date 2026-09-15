use flownote::file_error::{FileError, FileResult};
use flownote::markdown_files::{FileStore, SaveRequest};
use flownote::note_files::{NoteSaveAsRequest, NoteSaveRequest, NoteStore};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

const RESPONSE_PREFIX: &str = "FLOWNOTE_FILE_RESULT ";

#[derive(Deserialize)]
struct Input {
    sequence: u64,
    command: String,
    args: Value,
    selection: Option<PathBuf>,
}

fn id(args: &Value) -> FileResult<&str> {
    args.get("id").and_then(Value::as_str)
        .ok_or_else(|| FileError::new("protocol", "Test driver requires a file id"))
}

fn selected(store: &mut FileStore, input: &Input) -> FileResult<Value> {
    let Some(path) = &input.selection else { return Ok(Value::Null); };
    if input.command == "markdown_open" { return store.open_selected(path).map(|file| json!(file)); }
    let content = input.args.get("request").and_then(|request| request.get("content"))
        .and_then(Value::as_str).ok_or_else(|| FileError::new("protocol", "Test driver requires content"))?;
    store.save_as_selected(path, content).map(|file| json!(file))
}

fn selected_note(store: &mut NoteStore, input: &Input) -> FileResult<Value> {
    let Some(path) = &input.selection else { return Ok(Value::Null); };
    if input.command == "note_open" { return store.open_selected(path).map(|note| json!(note)); }
    let request: NoteSaveAsRequest = serde_json::from_value(input.args["request"].clone())
        .map_err(|error| FileError::io("Invalid Note save-as request", error))?;
    store.save_as_selected(path, request).map(|note| json!(note))
}

fn dispatch_note(store: &mut NoteStore, input: &Input) -> FileResult<Value> {
    match input.command.as_str() {
        "note_open" | "note_save_as" => selected_note(store, input),
        "note_save" => {
            let request: NoteSaveRequest = serde_json::from_value(input.args["request"].clone())
                .map_err(|error| FileError::io("Invalid Note save request", error))?;
            store.save(request).map(|note| json!(note))
        }
        "note_reload" => store.reload(id(&input.args)?).map(|note| json!(note)),
        "note_release" => store.close(id(&input.args)?).map(|_| Value::Null),
        _ => Err(FileError::new("protocol", "Unknown Note test command")),
    }
}

fn dispatch(store: &mut FileStore, notes: &mut NoteStore, input: &Input) -> FileResult<Value> {
    if input.command.starts_with("note_") { return dispatch_note(notes, input); }
    match input.command.as_str() {
        "markdown_open" | "markdown_save_as" => selected(store, input),
        "markdown_save" => {
            let request: SaveRequest = serde_json::from_value(input.args["request"].clone())
                .map_err(|error| FileError::io("Invalid test request", error))?;
            store.save(request).map(|file| json!(file))
        }
        "markdown_reload" => store.reload(id(&input.args)?).map(|file| json!(file)),
        "markdown_release" => store.close(id(&input.args)?).map(|_| Value::Null),
        _ => Err(FileError::new("protocol", "Unknown test command")),
    }
}

// Test-only transport: replaces the OS picker, never the production disk operations.
#[test]
#[ignore = "Driven through stdin by the editor-to-disk integration suite"]
fn stdio_file_driver() {
    let mut store = FileStore::default();
    let mut notes = NoteStore::default();
    for line in io::stdin().lock().lines() {
        let input: Input = serde_json::from_str(&line.expect("Read test request")).expect("Parse test request");
        let result = match dispatch(&mut store, &mut notes, &input) {
            Ok(value) => json!({ "sequence": input.sequence, "ok": true, "value": value }),
            Err(error) => json!({ "sequence": input.sequence, "ok": false, "error": error }),
        };
        println!("{RESPONSE_PREFIX}{result}");
        io::stdout().flush().expect("Flush test response");
    }
}
