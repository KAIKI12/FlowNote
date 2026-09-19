#![cfg(windows)]

mod note_support;

use flownote::browser_bundle::{BrowserBundleBlock, BrowserBundleRequest};
use flownote::note_files::NoteStore;
use note_support::*;
use std::fs;

fn request(file: &flownote::note_files::NoteSnapshot) -> BrowserBundleRequest {
    BrowserBundleRequest {
        id: file.id.clone(),
        revision: file.revision.clone(),
        folder_name: "Browser Export".into(),
        title: "Browser Export".into(),
        content: "# Local draft\n\nLatest markdown\n".into(),
        index_html: "<!doctype html><html><body><p>Latest markdown</p><iframe src=\"./blocks/0199a111-0000-7000-8000-000000000001/index.html\"></iframe></body></html>".into(),
        blocks: vec![BrowserBundleBlock {
            id: FIRST.into(),
            html: "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self' data:; connect-src 'none'\"><link rel=\"stylesheet\" href=\"./assets/style.css\"><div>Unsaved Current</div>".into(),
        }],
    }
}

#[test]
fn browser_bundle_materializes_current_content_and_owned_resources_without_touching_source_note() {
    let root = folder();
    let note_path = root.join("source.note");
    let export_parent = root.join("exports");
    fs::create_dir(&export_parent).unwrap();

    let mut store = NoteStore::default();
    let file = store.save_as_selected(&note_path, draft()).unwrap();

    fs::create_dir_all(note_path.join("assets/images")).unwrap();
    fs::write(note_path.join("assets/images/plot.png"), [1u8, 2, 3, 4]).unwrap();
    fs::create_dir_all(note_path.join("blocks").join(FIRST).join("assets")).unwrap();
    fs::write(note_path.join("blocks").join(FIRST).join("assets/style.css"), "body{color:red}").unwrap();

    let orphan = SECOND;
    fs::create_dir_all(note_path.join("blocks").join(orphan).join("assets")).unwrap();
    fs::write(note_path.join("blocks").join(orphan).join("index.html"), "<div>ORPHAN</div>").unwrap();
    fs::write(note_path.join("blocks").join(orphan).join("original.html"), "<div>ORPHAN ORIGINAL</div>").unwrap();
    fs::write(note_path.join("blocks").join(orphan).join("block.json"),
        r#"{"kind":"html","inputKind":"fragment","scriptPolicy":"off","viewport":{"heightPx":480}}"#).unwrap();
    fs::write(note_path.join("blocks").join(orphan).join("assets/orphan.css"), "body{}").unwrap();

    let loaded = store.reload(&file.id).unwrap();
    let source_revision = loaded.revision.clone();
    let source_content = fs::read(note_path.join("content.md")).unwrap();
    let source_index = fs::read(note_path.join("blocks").join(FIRST).join("index.html")).unwrap();
    let source_original = fs::read(note_path.join("blocks").join(FIRST).join("original.html")).unwrap();

    let mut export = request(&loaded);
    export.revision = source_revision.clone();
    let result = store.export_browser_bundle_selected(&export_parent, export).unwrap();
    let output = std::path::PathBuf::from(&result.path);

    assert_eq!(output, export_parent.join("Browser Export"));
    assert_eq!(result.name, "Browser Export");
    assert_eq!(fs::read_to_string(output.join("content.md")).unwrap(), "# Local draft\n\nLatest markdown\n");
    assert!(fs::read_to_string(output.join("index.html")).unwrap().contains("Latest markdown"));
    assert!(fs::read_to_string(output.join("blocks").join(FIRST).join("index.html")).unwrap().contains("Unsaved Current"));
    assert_eq!(fs::read(output.join("assets/images/plot.png")).unwrap(), [1, 2, 3, 4]);
    assert_eq!(fs::read_to_string(output.join("blocks").join(FIRST).join("assets/style.css")).unwrap(), "body{color:red}");

    assert!(!output.join("note.json").exists());
    assert!(!output.join("blocks").join(FIRST).join("original.html").exists());
    assert!(!output.join("blocks").join(FIRST).join("block.json").exists());
    assert!(!output.join("blocks").join(orphan).exists());

    assert_eq!(fs::read(note_path.join("content.md")).unwrap(), source_content);
    assert_eq!(fs::read(note_path.join("blocks").join(FIRST).join("index.html")).unwrap(), source_index);
    assert_eq!(fs::read(note_path.join("blocks").join(FIRST).join("original.html")).unwrap(), source_original);
    assert!(!store.probe(&loaded.id).unwrap().changed);
    assert_eq!(store.probe(&loaded.id).unwrap().revision, source_revision);
}

#[test]
fn browser_bundle_rejects_stale_duplicate_missing_and_existing_destination_without_partial_publish() {
    let root = folder();
    let note_path = root.join("source.note");
    let export_parent = root.join("exports");
    fs::create_dir(&export_parent).unwrap();

    let mut store = NoteStore::default();
    let file = store.save_as_selected(&note_path, draft()).unwrap();
    let loaded = store.reload(&file.id).unwrap();

    let mut forged = request(&loaded);
    forged.id = "note:forged-capability".into();
    assert_eq!(store.export_browser_bundle_selected(&export_parent, forged).unwrap_err().code, "closed");

    let mut stale = request(&loaded);
    stale.revision = "stale".into();
    assert_eq!(store.export_browser_bundle_selected(&export_parent, stale).unwrap_err().code, "conflict");

    let mut duplicate = request(&loaded);
    duplicate.blocks.push(duplicate.blocks[0].clone());
    assert_eq!(store.export_browser_bundle_selected(&export_parent, duplicate).unwrap_err().code, "invalidFormat");

    let mut missing = request(&loaded);
    missing.blocks[0].id = SECOND.into();
    assert_eq!(store.export_browser_bundle_selected(&export_parent, missing).unwrap_err().code, "notFound");

    fs::create_dir(export_parent.join("Browser Export")).unwrap();
    let existing = request(&loaded);
    assert_eq!(store.export_browser_bundle_selected(&export_parent, existing).unwrap_err().code, "conflict");
    assert!(!fs::read_dir(&export_parent).unwrap().any(|entry| {
        entry.unwrap().file_name().to_string_lossy().contains("flownote-export")
    }));

    let inside_source = request(&loaded);
    assert_eq!(store.export_browser_bundle_selected(&note_path, inside_source).unwrap_err().code, "invalidPath");
    assert!(!note_path.join("Browser Export").exists(), "export modified the source Note directory");
}

#[test]
fn browser_bundle_rejects_unsafe_folder_names() {
    let root = folder();
    let note_path = root.join("source.note");
    let export_parent = root.join("exports");
    fs::create_dir(&export_parent).unwrap();

    let mut store = NoteStore::default();
    let file = store.save_as_selected(&note_path, draft()).unwrap();
    let loaded = store.reload(&file.id).unwrap();

    for name in ["../escape", "bad\\name", "bad:name", "NUL", "bad\0name"] {
        let mut value = request(&loaded);
        value.folder_name = name.into();
        assert_eq!(store.export_browser_bundle_selected(&export_parent, value).unwrap_err().code, "invalidPath", "{name}");
    }
    assert_eq!(fs::read_dir(&export_parent).unwrap().count(), 0);
}


#[test]
fn browser_bundle_rejects_reparse_export_parent_and_future_version() {
    let root = folder();
    let note_path = root.join("source.note");
    let real_parent = root.join("real-export-parent");
    let linked_parent = root.join("linked-export-parent");
    fs::create_dir(&real_parent).unwrap();

    let mut store = NoteStore::default();
    let file = store.save_as_selected(&note_path, draft()).unwrap();
    let loaded = store.reload(&file.id).unwrap();

    let status = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(&linked_parent)
        .arg(&real_parent)
        .status()
        .unwrap();
    assert!(status.success(), "Failed to create a test junction");
    let error = store.export_browser_bundle_selected(&linked_parent, request(&loaded)).unwrap_err();
    assert!(matches!(error.code.as_str(), "invalidPath" | "unsupportedMetadata"),
        "junction parent unexpectedly failed as {}", error.code);
    assert!(!real_parent.join("Browser Export").exists());

    let future_path = root.join("future.note");
    fs::create_dir(&future_path).unwrap();
    fs::write(future_path.join("note.json"),
        r#"{"formatVersion":999,"type":"mixed","title":"Future"}"#).unwrap();
    fs::write(future_path.join("content.md"), "# future\n").unwrap();
    let future = store.open_selected(&future_path).unwrap();
    assert!(future.read_only);
    let mut future_request = BrowserBundleRequest {
        id: future.id.clone(),
        revision: future.revision.clone(),
        folder_name: "Future Export".into(),
        title: "Future".into(),
        content: "# future\n".into(),
        index_html: "<!doctype html><p>future</p>".into(),
        blocks: vec![],
    };
    assert_eq!(store.export_browser_bundle_selected(&real_parent, future_request.clone()).unwrap_err().code, "readonly");
    assert!(!real_parent.join("Future Export").exists());

    future_request.folder_name = "Future Export 2".into();
    store.close(&future.id).unwrap();
    assert_eq!(store.export_browser_bundle_selected(&real_parent, future_request).unwrap_err().code, "closed");
}
