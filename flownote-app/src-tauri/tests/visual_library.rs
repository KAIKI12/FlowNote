#![cfg(windows)]

mod note_support;

use flownote::note_files::{BlockAssetImport, HtmlBlockData, NoteSaveRequest, NoteStore};
use flownote::visual_library::{self, VisualMetadataUpdateRequest};
use note_support::{anchor, draft, folder, FIRST, SECOND};
use std::fs;

#[test]
fn visual_library_collects_saved_block_with_private_assets_without_mutating_source() {
    let root = folder();
    let note_path = root.join("source.note");
    let library = root.join("library");

    let mut store = NoteStore::default();
    let saved = store.save_as_selected(&note_path, draft()).unwrap();
    let asset_dir = note_path.join("blocks").join(FIRST).join("assets");
    fs::create_dir_all(&asset_dir).unwrap();
    fs::write(asset_dir.join("style.css"), "#card{color:purple}").unwrap();
    fs::write(asset_dir.join("pixel.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"2\" height=\"2\"/>").unwrap();
    let loaded = store.reload(&saved.id).unwrap();

    let before_content = fs::read(note_path.join("content.md")).unwrap();
    let before_current = fs::read(note_path.join("blocks").join(FIRST).join("index.html")).unwrap();
    let before_original = fs::read(note_path.join("blocks").join(FIRST).join("original.html")).unwrap();

    let package = store.block_package(&loaded.id, &loaded.revision, FIRST).unwrap();
    assert_eq!(package.assets.len(), 2);
    let item = visual_library::collect(&library, "Reusable Card", package).unwrap();

    assert_eq!(item.title, "Reusable Card");
    assert_eq!(item.asset_count, 2);
    assert_eq!(visual_library::list(&library).unwrap().len(), 1);

    let stored = visual_library::package(&library, &item.id).unwrap();
    assert_eq!(stored.item.html, "<div>首次输入</div>");
    assert_eq!(stored.original_html, "<div>首次输入</div>");
    assert_eq!(stored.assets.len(), 2);
    assert_eq!(visual_library::read_asset(&library, &item.id, "assets/style.css").unwrap().bytes,
        b"#card{color:purple}");

    assert_eq!(fs::read(note_path.join("content.md")).unwrap(), before_content);
    assert_eq!(fs::read(note_path.join("blocks").join(FIRST).join("index.html")).unwrap(), before_current);
    assert_eq!(fs::read(note_path.join("blocks").join(FIRST).join("original.html")).unwrap(), before_original);
    assert!(!store.probe(&loaded.id).unwrap().changed);
}

#[test]
fn visual_library_package_can_be_inserted_as_independent_block_with_owned_assets() {
    let root = folder();
    let source_path = root.join("source.note");
    let target_path = root.join("target.note");
    let library = root.join("library");

    let mut store = NoteStore::default();
    let source = store.save_as_selected(&source_path, draft()).unwrap();
    let source_assets = source_path.join("blocks").join(FIRST).join("assets");
    fs::create_dir_all(&source_assets).unwrap();
    fs::write(source_assets.join("theme.css"), "body{background:#fff}").unwrap();
    let source = store.reload(&source.id).unwrap();

    let item = visual_library::collect(&library, "Card",
        store.block_package(&source.id, &source.revision, FIRST).unwrap()).unwrap();
    let visual = visual_library::package(&library, &item.id).unwrap();

    let target = store.save_as_selected(&target_path, draft()).unwrap();
    let mut mixed = target.mixed.clone();
    let mut imported: HtmlBlockData = mixed.blocks[0].clone();
    imported.id = SECOND.into();
    imported.html = visual.item.html.clone();
    imported.original_html = visual.original_html.clone();
    imported.config = visual.item.config.clone();
    mixed.blocks.push(imported);

    let request = NoteSaveRequest {
        id: target.id.clone(),
        revision: target.revision.clone(),
        content: format!("{}\n{}", target.content, anchor(SECOND)),
        mixed,
        block_copies: Vec::new(),
        block_asset_edits: Vec::new(),
        block_asset_imports: visual.assets.into_iter().map(|asset| BlockAssetImport {
            block_id: SECOND.into(),
            path: asset.path,
            bytes: asset.bytes,
        }).collect(),
    };
    let saved = store.save(request).unwrap();

    assert!(saved.mixed.blocks.iter().any(|block| block.id == FIRST));
    assert!(saved.mixed.blocks.iter().any(|block| block.id == SECOND));
    assert_eq!(fs::read_to_string(target_path.join("blocks").join(SECOND).join("assets/theme.css")).unwrap(),
        "body{background:#fff}");
    assert_ne!(FIRST, SECOND);
}

#[test]
fn legacy_metadata_updates_tags_favorites_and_survives_trash_restore() {
    let root = folder();
    let note_path = root.join("source.note");
    let items = root.join("visual-library/items");
    let trash = root.join("visual-library/trash");
    let mut store = NoteStore::default();
    let source = store.save_as_selected(&note_path, draft()).unwrap();
    let assets = note_path.join("blocks").join(FIRST).join("assets");
    fs::create_dir_all(&assets).unwrap();
    fs::write(assets.join("style.css"), ".card{color:purple}").unwrap();
    let source = store.reload(&source.id).unwrap();
    let item = visual_library::collect(&items, "Legacy Visual",
        store.block_package(&source.id, &source.revision, FIRST).unwrap()).unwrap();

    let metadata_path = items.join(&item.id).join("visual.json");
    fs::write(&metadata_path, serde_json::to_vec_pretty(&serde_json::json!({
        "formatVersion": 1,
        "id": item.id,
        "title": "Legacy Visual",
        "createdAtMs": item.created_at_ms,
        "updatedAtMs": item.updated_at_ms
    })).unwrap()).unwrap();

    let legacy = visual_library::list(&items).unwrap().pop().unwrap();
    assert!(!legacy.favorite);
    assert!(legacy.tags.is_empty());
    assert!(!legacy.trashed);

    let updated = visual_library::update_metadata(&items, &trash, VisualMetadataUpdateRequest {
        id: legacy.id.clone(),
        title: "Renamed Visual".into(),
        favorite: true,
        tags: vec!["Report".into(), "report".into(), " dark ".into()],
    }).unwrap();
    assert_eq!(updated.title, "Renamed Visual");
    assert!(updated.favorite);
    assert_eq!(updated.tags, vec!["Report", "dark"]);

    let deleted = visual_library::move_to_trash(&items, &trash, &updated.id).unwrap();
    assert!(deleted.trashed);
    assert!(!items.join(&updated.id).exists());
    assert!(trash.join(&updated.id).is_dir());
    assert!(visual_library::package(&items, &updated.id).is_err());
    assert_eq!(visual_library::read_asset_with_trash(&items, &trash, &updated.id, "assets/style.css").unwrap().bytes,
        b".card{color:purple}");
    let all = visual_library::list_with_trash(&items, &trash).unwrap();
    assert_eq!(all.len(), 1);
    assert!(all[0].trashed);
    assert!(all[0].favorite);
    assert_eq!(all[0].tags, vec!["Report", "dark"]);

    let restored = visual_library::restore_from_trash(&items, &trash, &updated.id).unwrap();
    assert!(!restored.trashed);
    assert!(items.join(&updated.id).is_dir());
    assert!(!trash.join(&updated.id).exists());
    assert_eq!(restored.title, "Renamed Visual");
    assert!(restored.favorite);
    assert_eq!(restored.tags, vec!["Report", "dark"]);
    assert!(!store.probe(&source.id).unwrap().changed);
}

#[test]
fn metadata_update_recovers_an_interrupted_backup_only_state() {
    let root = folder();
    let note_path = root.join("source.note");
    let items = root.join("visual-library/items");
    let trash = root.join("visual-library/trash");
    let mut store = NoteStore::default();
    let source = store.save_as_selected(&note_path, draft()).unwrap();
    let item = visual_library::collect(&items, "Recoverable",
        store.block_package(&source.id, &source.revision, FIRST).unwrap()).unwrap();

    let directory = items.join(&item.id);
    fs::rename(directory.join("visual.json"), directory.join(".visual.json.flownote-backup")).unwrap();
    let listed = visual_library::list(&items).unwrap();
    assert_eq!(listed[0].title, "Recoverable");

    let updated = visual_library::update_metadata(&items, &trash, VisualMetadataUpdateRequest {
        id: item.id.clone(),
        title: "Recovered".into(),
        favorite: true,
        tags: vec!["recovery".into()],
    }).unwrap();
    assert_eq!(updated.title, "Recovered");
    assert!(directory.join("visual.json").is_file());
    assert!(!directory.join(".visual.json.flownote-backup").exists());
}

#[test]
fn visual_library_rejects_stale_note_revision_and_unsafe_asset_paths() {
    let root = folder();
    let note_path = root.join("source.note");
    let mut store = NoteStore::default();
    let saved = store.save_as_selected(&note_path, draft()).unwrap();

    assert_eq!(store.block_package(&saved.id, "stale", FIRST).unwrap_err().code, "conflict");
    assert!(visual_library::read_asset(&root.join("missing-library"), FIRST, "../escape.css").is_err());
}
