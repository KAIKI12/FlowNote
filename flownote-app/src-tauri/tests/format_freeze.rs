#![cfg(windows)]

mod note_support;

use flownote::note_files::NoteStore;
use note_support::*;
use serde_json::json;
use std::fs;
use uuid::Uuid;

#[test]
fn partial_blocks_open_read_only_without_deleting_incomplete_data() {
    for include_index in [false, true] {
        let root = folder();
        let path = root.join(if include_index { "missing-original.note" } else { "block-json-only.note" });
        let mut store = NoteStore::default();
        let file = store.save_as_selected(&path, draft()).unwrap();

        let first = path.join("blocks").join(FIRST);
        let second = path.join("blocks").join(SECOND);
        fs::create_dir(&second).unwrap();
        fs::copy(first.join("block.json"), second.join("block.json")).unwrap();
        if include_index {
            fs::copy(first.join("index.html"), second.join("index.html")).unwrap();
        }
        fs::create_dir(second.join("assets")).unwrap();
        fs::write(second.join("assets/recovery.bin"), [9, 8, 7, 6]).unwrap();

        let content = format!("Markdown A\n\n{}\nMarkdown B\n\n{}\nMarkdown C\n", anchor(FIRST), anchor(SECOND));
        fs::write(path.join("content.md"), &content).unwrap();

        let opened = store.reload(&file.id).unwrap();
        assert!(opened.read_only, "partial Block must enter read-only safe mode");
        assert_eq!(opened.content, content);
        assert_eq!(opened.mixed.blocks.len(), 1, "readable Blocks must remain available");
        assert_eq!(opened.mixed.blocks[0].id, FIRST);
        assert!(opened.diagnostics.iter().any(|item|
            item.block_id.as_deref() == Some(SECOND) && ["missingBlock", "partialPackage"].contains(&item.kind.as_str())));
        assert!(second.join("block.json").is_file());
        assert_eq!(second.join("index.html").is_file(), include_index);
        assert!(!second.join("original.html").exists());
        assert_eq!(fs::read(second.join("assets/recovery.bin")).unwrap(), [9, 8, 7, 6]);
        assert!(store.save(edit(&opened)).is_err(), "read-only partial package must not be rewritten");
        assert_eq!(fs::read_to_string(path.join("content.md")).unwrap(), content);
        assert_eq!(fs::read(second.join("assets/recovery.bin")).unwrap(), [9, 8, 7, 6]);
    }
}

#[test]
fn sibling_recovery_temp_is_preserved_and_never_replaces_the_bound_note() {
    let root = folder();
    let path = root.join("stable.note");
    let saved = NoteStore::default().save_as_selected(&path, draft()).unwrap();
    let recovery = root.join(format!(".stable.note.flownote-current-{}.tmp", Uuid::new_v4()));
    fs::create_dir(&recovery).unwrap();
    fs::write(recovery.join("content.md"), "RECOVERY CANDIDATE\n").unwrap();
    fs::write(recovery.join("marker.bin"), [1, 3, 3, 7]).unwrap();

    let original_content = fs::read(path.join("content.md")).unwrap();
    let mut store = NoteStore::default();
    let opened = store.open_selected(&path).unwrap();
    assert!(!opened.read_only);
    assert_eq!(opened.content.as_bytes(), original_content.as_slice());
    assert_ne!(opened.id, saved.id);
    assert_eq!(fs::read(recovery.join("content.md")).unwrap(), b"RECOVERY CANDIDATE\n");
    assert_eq!(fs::read(recovery.join("marker.bin")).unwrap(), [1, 3, 3, 7]);

    store.close(&opened.id).unwrap();
    let reopened = store.open_selected(&path).unwrap();
    assert_eq!(reopened.content.as_bytes(), original_content.as_slice());
    assert_eq!(fs::read(recovery.join("marker.bin")).unwrap(), [1, 3, 3, 7],
        "normal reopen must not auto-delete recovery artifacts");
}

#[test]
fn unknown_future_version_is_read_only_and_never_downgraded_or_rewritten() {
    let root = folder();
    let path = root.join("future.note");
    fs::create_dir(&path).unwrap();
    let metadata = br#"{"formatVersion":999,"type":"future-mixed","future":{"layout":"v99"},"opaque":[1,2,3]}"#;
    let content = b"# Future Source\n\nopaque syntax stays here\n";
    fs::write(path.join("note.json"), metadata).unwrap();
    fs::write(path.join("content.md"), content).unwrap();

    let mut store = NoteStore::default();
    let opened = store.open_selected(&path).unwrap();
    assert!(opened.read_only);
    assert_eq!(opened.mixed.metadata["formatVersion"], 999);
    assert_eq!(opened.mixed.metadata["future"]["layout"], "v99");
    assert!(opened.notice.as_deref().unwrap_or_default().contains("999"));

    let mut request = edit(&opened);
    request.mixed.metadata["formatVersion"] = json!(1);
    request.mixed.metadata["type"] = json!("mixed");
    assert!(store.save(request).is_err());
    assert!(store.save_as_selected(&root.join("future-copy.note"), copy(&opened)).is_err());

    assert_eq!(fs::read(path.join("note.json")).unwrap(), metadata);
    assert_eq!(fs::read(path.join("content.md")).unwrap(), content);
    assert!(!root.join("future-copy.note").exists());
}
