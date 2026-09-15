#![cfg(windows)]

mod note_support;
use flownote::note_files::NoteStore;
use note_support::*;
use serde_json::{json, Value};
use std::fs;

#[test]
fn creates_real_note_files_and_reopens_current_original_order_and_unknown_fields() {
    let path = folder().join("中文.note");
    let request = draft();
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, request).unwrap();
    assert!(file.id.starts_with("note:"));
    assert_eq!(file.name, "中文.note");
    assert_eq!(fs::read_to_string(path.join("content.md")).unwrap(), file.content);
    let metadata: Value = serde_json::from_slice(&fs::read(path.join("note.json")).unwrap()).unwrap();
    assert_eq!(metadata["formatVersion"], 1);
    assert!(metadata.get("blocks").is_none());
    let mut request = edit(&file);
    request.mixed.blocks[0].html = "<article>编辑后</article>".into();
    request.mixed.blocks[0].config["viewport"]["heightPx"] = json!(640);
    let saved = store.save(request).unwrap();
    assert_ne!(saved.revision, file.revision);
    store.close(&file.id).unwrap();
    assert_eq!(store.reload(&file.id).unwrap_err().code, "closed");
    let reopened = NoteStore::default().open_selected(&path).unwrap();
    assert_eq!(reopened.content, file.content);
    assert_eq!(reopened.mixed.blocks[0].html, "<article>编辑后</article>");
    assert_eq!(reopened.mixed.blocks[0].original_html, "<div>首次输入</div>");
    assert_eq!(reopened.mixed.blocks[0].config["futureCompatible"], "retained");
    assert_eq!(reopened.mixed.blocks[0].config["viewport"]["futureFit"], true);
    assert_eq!(reopened.mixed.metadata["futureCompatible"]["accent"], "blue");
}

#[test]
fn editing_an_existing_original_is_rejected_without_changing_the_package() {
    let path = folder().join("original.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    let mut request = edit(&file);
    request.mixed.blocks[0].original_html = "forged original".into();
    assert_eq!(store.save(request).unwrap_err().code, "originalChanged");
    assert_eq!(store.reload(&file.id).unwrap().revision, file.revision);
}

#[test]
fn deleting_an_anchor_retains_orphan_resources_and_save_as_copies_them() {
    let path = folder().join("source.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    let block = path.join("blocks").join(FIRST);
    fs::create_dir(block.join("assets")).unwrap();
    fs::write(block.join("assets/chart.css"), "PRIVATE CSS").unwrap();
    fs::write(path.join("extra.bin"), [0, 255, 1, 2]).unwrap();
    let loaded = store.reload(&file.id).unwrap();
    let mut request = edit(&loaded);
    request.content = "Only Markdown remains\n".into();
    request.mixed.blocks.clear();
    let saved = store.save(request).unwrap();
    assert!(block.join("original.html").is_file());
    let target = path.with_file_name("copy.note");
    store.save_as_selected(&target, copy(&saved)).unwrap();
    assert_eq!(fs::read(target.join("extra.bin")).unwrap(), [0, 255, 1, 2]);
    assert_eq!(fs::read_to_string(target.join("blocks").join(FIRST).join("assets/chart.css")).unwrap(), "PRIVATE CSS");
    assert!(target.join("blocks").join(FIRST).join("original.html").is_file());
}

#[test]
fn stale_revisions_and_external_resource_edits_cannot_be_overwritten() {
    let path = folder().join("conflict.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    fs::write(path.join("blocks").join(FIRST).join("index.html"), "EXTERNAL").unwrap();
    assert_eq!(store.save(edit(&file)).unwrap_err().code, "conflict");
    assert_eq!(store.save_as_selected(&path.with_file_name("copy.note"), copy(&file)).unwrap_err().code, "conflict");
    let current = store.reload(&file.id).unwrap();
    assert_eq!(current.mixed.blocks[0].html, "EXTERNAL");
    fs::write(path.join("new-resource.bin"), [42]).unwrap();
    assert_eq!(store.save(edit(&current)).unwrap_err().code, "conflict");
}

#[test]
fn invalid_duplicate_and_missing_anchors_preserve_source_and_are_read_only() {
    let source = [anchor("../outside"), format!("{}\n{}", anchor(FIRST), anchor(FIRST)), anchor(SECOND)];
    for content in source {
        let path = folder().join("diagnostic.note");
        let mut store = NoteStore::default();
        let file = store.save_as_selected(&path, draft()).unwrap();
        fs::write(path.join("content.md"), &content).unwrap();
        let opened = store.reload(&file.id).unwrap();
        assert_eq!(opened.content, content);
        assert!(opened.read_only);
        assert!(opened.notice.is_some());
        assert!(store.save(edit(&opened)).is_err());
        assert_eq!(fs::read_to_string(path.join("content.md")).unwrap(), content);
    }
}

#[test]
fn unknown_version_is_read_only_even_with_only_known_content_and_no_blocks() {
    let path = folder().join("future.note");
    fs::create_dir(&path).unwrap();
    fs::write(path.join("note.json"), "{\"formatVersion\":999,\"future\":true}").unwrap();
    fs::write(path.join("content.md"), "future source\n").unwrap();
    let mut store = NoteStore::default();
    let opened = store.open_selected(&path).unwrap();
    assert!(opened.read_only);
    assert_eq!(opened.mixed.metadata["formatVersion"], 999);
    assert!(opened.mixed.blocks.is_empty());
    assert!(opened.notice.as_deref().unwrap().contains("999"));
    let mut request = edit(&opened);
    request.mixed.metadata["formatVersion"] = json!(1);
    assert!(store.save(request).is_err());
    assert!(store.save_as_selected(&path.with_file_name("copy.note"), copy(&opened)).is_err());
    assert_eq!(fs::read_to_string(path.join("note.json")).unwrap(), "{\"formatVersion\":999,\"future\":true}");
}

#[test]
fn conversion_keeps_markdown_and_refuses_existing_destinations() {
    let parent = folder();
    let markdown = parent.join("source.md");
    fs::write(&markdown, "ORIGINAL MARKDOWN").unwrap();
    let target = parent.join("new.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&target, draft()).unwrap();
    assert_eq!(fs::read_to_string(&markdown).unwrap(), "ORIGINAL MARKDOWN");
    assert_eq!(store.save_as_selected(&target, draft()).unwrap_err().code, "conflict");
    assert_eq!(store.reload(&file.id).unwrap().revision, file.revision);
    assert_eq!(store.open_selected(&markdown).unwrap_err().code, "invalidPath");
}

#[test]
fn unsafe_payloads_and_invalid_utf8_do_not_create_a_successful_note() {
    let parent = folder();
    let target = parent.join("invalid.note");
    let mut store = NoteStore::default();
    let mut request = draft();
    request.mixed.blocks[0].id = "../outside".into();
    assert!(store.save_as_selected(&target, request).is_err());
    assert!(!target.exists());
    let mut request = draft();
    request.mixed.blocks[0].config["networkAllowed"] = json!(true);
    assert!(store.save_as_selected(&target, request).is_err());
    assert!(!target.exists());
    store.save_as_selected(&target, draft()).unwrap();
    fs::write(target.join("blocks").join(FIRST).join("index.html"), [255]).unwrap();
    let opened = store.open_selected(&target).unwrap();
    assert!(opened.read_only);
    assert!(opened.notice.as_deref().unwrap().contains("UTF-8"));
    assert!(opened.mixed.blocks.is_empty());
}

#[test]
fn unchanged_saves_leave_existing_bytes_and_directory_identity_untouched() {
    let path = folder().join("unchanged.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    let count = fs::read_dir(path.parent().unwrap()).unwrap().count();
    let before = fs::metadata(&path).unwrap().created().unwrap();
    let saved = store.save(edit(&file)).unwrap();
    assert_eq!(saved.revision, file.revision);
    assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), count);
    assert_eq!(fs::metadata(&path).unwrap().created().unwrap(), before);
}
