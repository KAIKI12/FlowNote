#![cfg(windows)]

mod note_support;

use flownote::browser_bundle::{BrowserBundleBlock, MarkdownExportRequest};
use flownote::note_files::NoteStore;
use note_support::*;
use std::fs;

fn request(file: &flownote::note_files::NoteSnapshot) -> MarkdownExportRequest {
    MarkdownExportRequest {
        id: file.id.clone(),
        revision: file.revision.clone(),
        folder_name: "Markdown Export".into(),
        markdown_name: "Exported.md".into(),
        content: format!(
            "# Local draft\n\n[HTML Visual](./blocks/{}/index.html)\n",
            FIRST
        ),
        blocks: vec![BrowserBundleBlock {
            id: FIRST.into(),
            html: "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"connect-src 'none'\"><link rel=\"stylesheet\" href=\"./assets/style.css\"><div>Unsaved Current</div>".into(),
        }],
    }
}

#[test]
fn markdown_export_materializes_links_current_html_and_owned_resources_without_touching_source() {
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

    let result = store.export_markdown_selected(&export_parent, request(&loaded)).unwrap();
    let output = std::path::PathBuf::from(&result.path);
    assert_eq!(output, export_parent.join("Markdown Export"));
    assert_eq!(result.name, "Markdown Export");
    assert_eq!(std::path::PathBuf::from(&result.markdown_path), output.join("Exported.md"));
    assert!(fs::read_to_string(output.join("Exported.md")).unwrap()
        .contains(&format!("[HTML Visual](./blocks/{}/index.html)", FIRST)));
    assert!(fs::read_to_string(output.join("blocks").join(FIRST).join("index.html")).unwrap()
        .contains("Unsaved Current"));
    assert_eq!(fs::read(output.join("assets/images/plot.png")).unwrap(), [1, 2, 3, 4]);
    assert_eq!(fs::read_to_string(output.join("blocks").join(FIRST).join("assets/style.css")).unwrap(), "body{color:red}");
    assert!(!output.join("index.html").exists());
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
fn markdown_export_rejects_stale_unsafe_and_missing_requests_without_partial_publish() {
    let root = folder();
    let note_path = root.join("source.note");
    let export_parent = root.join("exports");
    fs::create_dir(&export_parent).unwrap();

    let mut store = NoteStore::default();
    let file = store.save_as_selected(&note_path, draft()).unwrap();
    let loaded = store.reload(&file.id).unwrap();

    let mut stale = request(&loaded);
    stale.revision = "stale".into();
    assert_eq!(store.export_markdown_selected(&export_parent, stale).unwrap_err().code, "conflict");

    let mut bad_name = request(&loaded);
    bad_name.markdown_name = "../escape.md".into();
    assert_eq!(store.export_markdown_selected(&export_parent, bad_name).unwrap_err().code, "invalidPath");

    let mut wrong_extension = request(&loaded);
    wrong_extension.markdown_name = "Exported.txt".into();
    assert_eq!(store.export_markdown_selected(&export_parent, wrong_extension).unwrap_err().code, "invalidPath");

    let mut missing = request(&loaded);
    missing.blocks[0].id = SECOND.into();
    assert_eq!(store.export_markdown_selected(&export_parent, missing).unwrap_err().code, "notFound");

    fs::create_dir(export_parent.join("Markdown Export")).unwrap();
    assert_eq!(store.export_markdown_selected(&export_parent, request(&loaded)).unwrap_err().code, "conflict");
    assert!(!fs::read_dir(&export_parent).unwrap().any(|entry| {
        entry.unwrap().file_name().to_string_lossy().contains("flownote-export")
    }));
}
