#![cfg(windows)]

mod note_support;
use flownote::note_files::{NoteAssetData, NoteStore};
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
fn note_images_are_read_only_and_scoped_to_assets_images() {
    let path = folder().join("note-images.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    let images = path.join("assets/images");
    fs::create_dir_all(&images).unwrap();
    fs::write(images.join("plot.png"), [137, 80, 78, 71, 2]).unwrap();
    let loaded = store.reload(&file.id).unwrap();
    let asset = store.read_note_asset(&loaded.id, "assets/images/plot.png").unwrap();
    assert_eq!(asset.mime, "image/png");
    assert_eq!(asset.bytes, [137, 80, 78, 71, 2]);
    assert_eq!(store.read_note_asset(&loaded.id, "blocks/x/assets/plot.png").unwrap_err().code, "invalidPath");
    assert_eq!(store.read_note_asset(&loaded.id, "assets/images/../note.json").unwrap_err().code, "invalidPath");
}

#[test]
fn block_assets_are_read_only_and_scoped_to_the_bound_block() {
    let path = folder().join("assets.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    let assets = path.join("blocks").join(FIRST).join("assets");
    fs::create_dir(&assets).unwrap();
    fs::write(assets.join("style.css"), "body { color: red; }").unwrap();
    fs::write(assets.join("image.png"), [137, 80, 78, 71]).unwrap();
    let loaded = store.reload(&file.id).unwrap();
    let css = store.read_asset(&loaded.id, FIRST, "assets/style.css").unwrap();
    assert_eq!(css.mime, "text/css");
    assert_eq!(css.bytes, b"body { color: red; }");
    let png = store.read_asset(&loaded.id, FIRST, "assets/image.png").unwrap();
    assert_eq!(png.mime, "image/png");
    assert_eq!(png.bytes, [137, 80, 78, 71]);
    assert_eq!(store.read_asset(&loaded.id, FIRST, "../original.html").unwrap_err().code, "invalidPath");
    assert_eq!(store.read_asset(&loaded.id, FIRST, "assets/../index.html").unwrap_err().code, "invalidPath");
    assert_eq!(store.read_asset(&loaded.id, FIRST, "assets\\style.css").unwrap_err().code, "invalidPath");
    assert_eq!(store.read_asset(&loaded.id, FIRST, "C:/outside.css").unwrap_err().code, "invalidPath");
    assert_eq!(store.read_asset(&loaded.id, SECOND, "assets/style.css").unwrap_err().code, "notFound");
    assert_eq!(store.read_asset("note:forged", FIRST, "assets/style.css").unwrap_err().code, "closed");
}

#[test]
fn block_asset_reads_detect_external_changes_after_binding() {
    let path = folder().join("asset-conflict.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    let assets = path.join("blocks").join(FIRST).join("assets");
    fs::create_dir(&assets).unwrap();
    fs::write(assets.join("style.css"), "body{color:red}").unwrap();
    let loaded = store.reload(&file.id).unwrap();
    fs::write(assets.join("style.css"), "body{color:blue}").unwrap();
    assert_eq!(store.read_asset(&loaded.id, FIRST, "assets/style.css").unwrap_err().code, "conflict");
}

#[test]
fn block_asset_reads_reject_symlink_escape_when_windows_allows_symlinks() {
    use std::os::windows::fs::symlink_file;
    let path = folder().join("asset-link.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    let assets = path.join("blocks").join(FIRST).join("assets");
    fs::create_dir(&assets).unwrap();
    let outside = path.parent().unwrap().join("outside.css");
    fs::write(&outside, "SECRET").unwrap();
    let loaded = store.reload(&file.id).unwrap();
    if symlink_file(&outside, assets.join("linked.css")).is_err() { return; }
    assert_eq!(store.read_asset(&loaded.id, FIRST, "assets/linked.css").unwrap_err().code, "invalidPath");
}

#[test]
fn probe_detects_external_content_and_resource_changes_without_accepting_revision() {
    let path = folder().join("probe.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    let clean = store.probe(&file.id).unwrap();
    assert!(!clean.changed);
    assert_eq!(clean.revision, file.revision);

    fs::write(path.join("content.md"), format!("Externally changed\n\n{}", anchor(FIRST))).unwrap();
    let changed = store.probe(&file.id).unwrap();
    assert!(changed.changed);
    assert_ne!(changed.revision, file.revision);
    assert_eq!(store.save(edit(&file)).unwrap_err().code, "conflict");

    let reloaded = store.reload(&file.id).unwrap();
    let assets = path.join("blocks").join(FIRST).join("assets");
    fs::create_dir(&assets).unwrap();
    fs::write(assets.join("external.css"), "body{color:blue}").unwrap();
    let resource_changed = store.probe(&reloaded.id).unwrap();
    assert!(resource_changed.changed);
    assert_ne!(resource_changed.revision, reloaded.revision);
    assert_eq!(store.probe("note:forged").unwrap_err().code, "closed");
    store.close(&reloaded.id).unwrap();
    assert_eq!(store.probe(&reloaded.id).unwrap_err().code, "closed");
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
fn snapshots_report_structured_anchor_and_orphan_diagnostics_without_deleting_data() {
    let path = folder().join("structured-diagnostics.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();

    fs::write(path.join("content.md"), anchor("../outside")).unwrap();
    let invalid = store.reload(&file.id).unwrap();
    assert!(invalid.read_only);
    assert!(invalid.diagnostics.iter().any(|item| item.kind == "invalidAnchor"));
    assert_eq!(fs::read_to_string(path.join("content.md")).unwrap(), anchor("../outside"));

    fs::write(path.join("content.md"), format!("{}{}", anchor(FIRST), anchor(FIRST))).unwrap();
    let duplicate = store.reload(&file.id).unwrap();
    assert!(duplicate.read_only);
    assert!(duplicate.diagnostics.iter().any(|item| item.kind == "duplicateAnchor" && item.block_id.as_deref() == Some(FIRST)));

    fs::write(path.join("content.md"), anchor(SECOND)).unwrap();
    let missing = store.reload(&file.id).unwrap();
    assert!(missing.read_only);
    assert!(missing.diagnostics.iter().any(|item| item.kind == "missingBlock" && item.block_id.as_deref() == Some(SECOND)));

    fs::write(path.join("content.md"), anchor(FIRST)).unwrap();
    let orphan = path.join("blocks").join(SECOND);
    fs::create_dir(&orphan).unwrap();
    fs::copy(path.join("blocks").join(FIRST).join("block.json"), orphan.join("block.json")).unwrap();
    fs::copy(path.join("blocks").join(FIRST).join("index.html"), orphan.join("index.html")).unwrap();
    fs::copy(path.join("blocks").join(FIRST).join("original.html"), orphan.join("original.html")).unwrap();
    let with_orphan = store.reload(&file.id).unwrap();
    assert!(!with_orphan.read_only);
    assert!(with_orphan.diagnostics.iter().any(|item| item.kind == "orphanBlock" && item.block_id.as_deref() == Some(SECOND)));
    assert!(orphan.join("original.html").is_file(), "orphan resources were deleted during diagnosis");
}

#[test]
fn explicit_repairs_remove_missing_reference_and_restore_orphan_transactionally() {
    let path = folder().join("repair.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();

    fs::write(path.join("content.md"), format!("{}{}", anchor(FIRST), anchor(SECOND))).unwrap();
    let missing = store.reload(&file.id).unwrap();
    assert!(missing.read_only);
    assert_eq!(missing.mixed.blocks.len(), 1, "a missing Block discarded other readable Blocks");
    assert_eq!(missing.mixed.blocks[0].id, FIRST);
    let repaired = store.repair_remove_reference(&missing.id, &missing.revision, SECOND).unwrap();
    assert!(!repaired.read_only);
    assert!(repaired.content.contains(FIRST));
    assert!(!repaired.content.contains(SECOND));
    assert_eq!(repaired.mixed.blocks.len(), 1);
    assert!(!path.join("blocks").join(SECOND).exists(), "missing repair fabricated a Block directory");

    let orphan = path.join("blocks").join(SECOND);
    fs::create_dir(&orphan).unwrap();
    fs::copy(path.join("blocks").join(FIRST).join("block.json"), orphan.join("block.json")).unwrap();
    fs::copy(path.join("blocks").join(FIRST).join("index.html"), orphan.join("index.html")).unwrap();
    fs::copy(path.join("blocks").join(FIRST).join("original.html"), orphan.join("original.html")).unwrap();
    fs::create_dir(orphan.join("assets")).unwrap();
    fs::write(orphan.join("assets/private.css"), "PRIVATE").unwrap();
    let with_orphan = store.reload(&repaired.id).unwrap();
    assert!(with_orphan.diagnostics.iter().any(|item| item.kind == "orphanBlock" && item.block_id.as_deref() == Some(SECOND)));
    let restored = store.repair_restore_orphan(&with_orphan.id, &with_orphan.revision, SECOND).unwrap();
    assert!(!restored.read_only);
    assert!(restored.content.contains(FIRST) && restored.content.contains(SECOND));
    assert_eq!(restored.mixed.blocks.len(), 2);
    assert_eq!(fs::read_to_string(orphan.join("assets/private.css")).unwrap(), "PRIVATE");
}

#[test]
fn repair_rejects_stale_revision_without_changing_disk() {
    let path = folder().join("repair-stale.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    fs::write(path.join("content.md"), format!("{}{}", anchor(FIRST), anchor(SECOND))).unwrap();
    let missing = store.reload(&file.id).unwrap();
    let external = format!("External text\n\n{}{}", anchor(FIRST), anchor(SECOND));
    fs::write(path.join("content.md"), &external).unwrap();
    assert_eq!(store.repair_remove_reference(&missing.id, &missing.revision, SECOND).unwrap_err().code, "conflict");
    assert_eq!(fs::read_to_string(path.join("content.md")).unwrap(), external);
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
fn deep_copy_creates_independent_block_identity_current_original_and_private_assets() {
    let path = folder().join("deep-copy.note");
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, draft()).unwrap();
    let source_assets = path.join("blocks").join(FIRST).join("assets");
    fs::create_dir(&source_assets).unwrap();
    fs::write(source_assets.join("style.css"), "SOURCE CSS").unwrap();
    fs::write(source_assets.join("image.png"), [1, 2, 3, 4]).unwrap();
    let loaded = store.reload(&file.id).unwrap();
    let mut target = loaded.mixed.blocks[0].clone();
    target.id = SECOND.into();
    let request: flownote::note_files::NoteSaveRequest = serde_json::from_value(json!({
        "id": loaded.id,
        "revision": loaded.revision,
        "content": format!("{}\n{}", loaded.content, anchor(SECOND)),
        "mixed": { "metadata": loaded.mixed.metadata, "blocks": [loaded.mixed.blocks[0], target] },
        "blockCopies": [{ "sourceId": FIRST, "targetId": SECOND }]
    })).unwrap();
    let copied = store.save(request).unwrap();
    let target_dir = path.join("blocks").join(SECOND);
    assert_eq!(fs::read_to_string(target_dir.join("assets/style.css")).unwrap(), "SOURCE CSS");
    assert_eq!(fs::read(target_dir.join("assets/image.png")).unwrap(), [1, 2, 3, 4]);
    assert_eq!(copied.mixed.blocks[1].html, copied.mixed.blocks[0].html);
    assert_eq!(copied.mixed.blocks[1].original_html, copied.mixed.blocks[0].original_html);

    let mut edit_copy = edit(&copied);
    edit_copy.mixed.blocks[1].html = "<div>Copy Changed</div>".into();
    let changed = store.save(edit_copy).unwrap();
    assert_eq!(changed.mixed.blocks[0].html, "<div>首次输入</div>");
    assert_eq!(changed.mixed.blocks[1].html, "<div>Copy Changed</div>");
    assert_eq!(changed.mixed.blocks[1].original_html, "<div>首次输入</div>");
    fs::write(target_dir.join("assets/style.css"), "COPY CSS").unwrap();
    assert_eq!(fs::read_to_string(source_assets.join("style.css")).unwrap(), "SOURCE CSS");
}

#[test]
fn conversion_can_stage_managed_markdown_images_without_metadata_duplication() {
    let path = folder().join("images.note");
    let mut request = draft();
    request.content = format!("![plot](assets/images/plot.png)\n\n{}", anchor(FIRST));
    request.assets.push(NoteAssetData { path: "assets/images/plot.png".into(), bytes: vec![137, 80, 78, 71] });
    let mut store = NoteStore::default();
    let file = store.save_as_selected(&path, request).unwrap();
    assert_eq!(fs::read(path.join("assets/images/plot.png")).unwrap(), [137, 80, 78, 71]);
    let metadata: Value = serde_json::from_slice(&fs::read(path.join("note.json")).unwrap()).unwrap();
    assert!(metadata.get("assets").is_none());
    assert!(metadata.get("assetList").is_none());
    assert!(file.content.contains("assets/images/plot.png"));
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
