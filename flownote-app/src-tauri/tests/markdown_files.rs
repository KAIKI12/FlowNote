use std::fs;
use std::path::PathBuf;
use flownote::markdown_files::{FileStore, SaveRequest, MAX_MARKDOWN_BYTES};
use uuid::Uuid;

fn folder() -> PathBuf {
    let directory = std::env::temp_dir().join(format!("flownote-file-test-{}", Uuid::new_v4()));
    fs::create_dir(&directory).unwrap();
    directory
}

fn request(file: &flownote::markdown_files::FileSnapshot, content: &str) -> SaveRequest {
    SaveRequest { id: file.id.clone(), revision: file.revision.clone(), content: content.into() }
}

#[test]
fn reads_only_assets_from_the_bound_markdown_sibling_directory() {
    let parent = folder();
    let markdown = parent.join("Timing.md");
    fs::write(&markdown, "![plot](Timing.assets/plot.png)\n").unwrap();
    let assets = parent.join("Timing.assets");
    fs::create_dir(&assets).unwrap();
    fs::write(assets.join("plot.png"), [137, 80, 78, 71]).unwrap();
    fs::write(parent.join("outside.png"), [1, 2, 3]).unwrap();
    let mut store = FileStore::default();
    let file = store.open_selected(&markdown).unwrap();
    let asset = store.read_asset(&file.id, "Timing.assets/plot.png").unwrap();
    assert_eq!(asset.mime, "image/png");
    assert_eq!(asset.bytes, [137, 80, 78, 71]);
    assert_eq!(store.read_asset(&file.id, "../outside.png").unwrap_err().code, "invalidPath");
    assert_eq!(store.read_asset(&file.id, "Other.assets/plot.png").unwrap_err().code, "invalidPath");
    assert_eq!(store.read_asset("forged", "Timing.assets/plot.png").unwrap_err().code, "closed");
}

#[test]
fn reads_real_utf8_without_losing_bom_or_crlf() {
    let path = folder().join("中文 笔记.md");
    let content = "\u{feff}---\r\ntitle: 笔记\r\n---\r\n\r\n[[双链]] $x_1$\r\n";
    fs::write(&path, content).unwrap();
    let file = FileStore::default().open_selected(&path).unwrap();
    assert_eq!(file.content, content);
    assert_eq!(file.name, "中文 笔记.md");
    assert!(!file.id.is_empty());
    assert_eq!(file.revision.len(), 64);
}

#[test]
fn rejects_bad_extension_invalid_encoding_and_oversized_files() {
    let directory = folder();
    let mut store = FileStore::default();
    let text = directory.join("wrong.txt");
    fs::write(&text, "text").unwrap();
    assert_eq!(store.open_selected(&text).unwrap_err().code, "invalidPath");
    let binary = directory.join("binary.md");
    fs::write(&binary, [0xff, 0xfe, 0x41]).unwrap();
    assert_eq!(store.open_selected(&binary).unwrap_err().code, "encoding");
    let large = directory.join("large.md");
    fs::write(&large, vec![b'x'; MAX_MARKDOWN_BYTES + 1]).unwrap();
    assert_eq!(store.open_selected(&large).unwrap_err().code, "tooLarge");
}

#[test]
fn unchanged_save_preserves_all_original_bytes_and_mtime() {
    let path = folder().join("same.md");
    let content = "\u{feff}# 标题\r\n\r\n- A\r\n";
    fs::write(&path, content).unwrap();
    let before = fs::metadata(&path).unwrap().modified().unwrap();
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    let saved = store.save(request(&file, content)).unwrap();
    assert_eq!(saved.revision, file.revision);
    assert_eq!(fs::read(&path).unwrap(), content.as_bytes());
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), before);
}

#[test]
fn edited_file_can_be_closed_and_reopened_by_a_fresh_store() {
    let path = folder().join("note.md");
    fs::write(&path, "before\n").unwrap();
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    let content = "---\ntitle: Updated\n---\n\n[[保留]]\n\n1. CPU\n   - ALU\n";
    let saved = store.save(request(&file, content)).unwrap();
    assert_ne!(saved.revision, file.revision);
    store.close(&file.id).unwrap();
    assert_eq!(store.reload(&file.id).unwrap_err().code, "closed");
    assert_eq!(FileStore::default().open_selected(&path).unwrap().content, content);
    assert_eq!(fs::read(&path).unwrap(), content.as_bytes());
}

#[test]
fn external_changes_are_not_overwritten() {
    let path = folder().join("conflict.md");
    fs::write(&path, "original").unwrap();
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    fs::write(&path, "external version").unwrap();
    let error = store.save(request(&file, "local version")).unwrap_err();
    assert_eq!(error.code, "conflict");
    assert_eq!(fs::read_to_string(&path).unwrap(), "external version");
    assert_eq!(store.reload(&file.id).unwrap().content, "external version");
}

#[test]
fn stale_revisions_and_unknown_handles_are_rejected() {
    let path = folder().join("version.md");
    fs::write(&path, "A").unwrap();
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    store.save(request(&file, "B")).unwrap();
    assert_eq!(store.save(request(&file, "C")).unwrap_err().code, "conflict");
    let forged = SaveRequest { id: "unselected".into(), revision: file.revision, content: "bad".into() };
    assert_eq!(store.save(forged).unwrap_err().code, "closed");
    assert_eq!(fs::read_to_string(&path).unwrap(), "B");
}

#[test]
fn save_as_writes_new_file_and_keeps_original() {
    let directory = folder();
    let original = directory.join("original.md");
    let target = directory.join("copy.markdown");
    fs::write(&original, "original").unwrap();
    let mut store = FileStore::default();
    store.open_selected(&original).unwrap();
    let saved = store.save_as_selected(&target, "copy\n").unwrap();
    assert_eq!(saved.name, "copy.markdown");
    assert_eq!(fs::read_to_string(&original).unwrap(), "original");
    assert_eq!(fs::read_to_string(&target).unwrap(), "copy\n");
}

#[test]
fn all_qualification_fixtures_survive_actual_disk_save_and_reopen() {
    let fixture_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../flownote-markdown-qualification/fixtures");
    let directory = folder();
    let mut checked = 0;
    for entry in fs::read_dir(fixture_root).unwrap() {
        let entry = entry.unwrap();
        if entry.path().extension().and_then(|value| value.to_str()) != Some("md") { continue; }
        let content = fs::read_to_string(entry.path()).unwrap();
        let path = directory.join(entry.file_name());
        let mut store = FileStore::default();
        let file = store.save_as_selected(&path, &content).unwrap();
        store.close(&file.id).unwrap();
        assert_eq!(FileStore::default().open_selected(&path).unwrap().content, content);
        checked += 1;
    }
    assert_eq!(checked, 8);
}

#[cfg(windows)]
#[test]
fn a_file_locked_before_saving_is_rejected_before_writing_a_copy() {
    use std::os::windows::fs::OpenOptionsExt;
    const SHARE_READ_ONLY: u32 = 0x00000001;
    let path = folder().join("locked.md");
    fs::write(&path, "original").unwrap();
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    let _lock = fs::OpenOptions::new().read(true).share_mode(SHARE_READ_ONLY).open(&path).unwrap();
    let error = store.save(request(&file, "new content")).unwrap_err();
    assert_eq!(error.code, "io");
    assert_eq!(fs::read_to_string(&path).unwrap(), "original");
    assert!(error.recovery_path.is_none());
    assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
}
