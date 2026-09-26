#![cfg(windows)]

use flownote::workspace::{WorkspaceEntryKind, WorkspaceStore};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

fn temp_workspace() -> PathBuf {
    let root = std::env::temp_dir().join(format!("flownote-workspace-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn scans_markdown_and_note_packages_without_descending_into_note_internals() {
    let root = temp_workspace();
    fs::write(root.join("alpha.md"), "# Alpha\n\nBody").unwrap();
    fs::create_dir_all(root.join("Research")).unwrap();
    fs::write(root.join("Research").join("beta.markdown"), "# Beta").unwrap();
    let note = root.join("visual.note");
    fs::create_dir_all(note.join("blocks").join("secret")).unwrap();
    fs::write(note.join("content.md"), "# Visual\n\nneedle inside note").unwrap();
    fs::write(note.join("note.json"), r#"{"formatVersion":1,"type":"mixed","title":"Visual"}"#).unwrap();
    fs::write(note.join("blocks").join("secret").join("source.html"), "SHOULD NOT APPEAR").unwrap();
    fs::create_dir_all(root.join("node_modules")).unwrap();
    fs::write(root.join("node_modules").join("ignored.md"), "# ignored").unwrap();

    let mut store = WorkspaceStore::default();
    let snapshot = store.bind(&root).unwrap();

    assert_eq!(snapshot.entries.len(), 3);
    assert_eq!(snapshot.entries[0].kind, WorkspaceEntryKind::Folder);
    assert_eq!(snapshot.entries[0].children[0].relative_path, "Research/beta.markdown");
    assert_eq!(snapshot.entries[1].relative_path, "alpha.md");
    assert_eq!(snapshot.entries[2].kind, WorkspaceEntryKind::Note);
    assert_eq!(snapshot.entries[2].relative_path, "visual.note");
    assert!(snapshot.entries[2].children.is_empty());

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_parent_absolute_and_backslash_paths() {
    let root = temp_workspace();
    fs::write(root.join("safe.md"), "# Safe").unwrap();
    let mut store = WorkspaceStore::default();
    store.bind(&root).unwrap();

    for invalid in ["../outside.md", "/absolute.md", "folder\\escape.md", "C:/absolute.md"] {
        let error = store.resolve_existing(invalid).unwrap_err();
        assert_eq!(error.code, "invalidPath", "{invalid}");
    }

    assert_eq!(store.resolve_existing("safe.md").unwrap(), root.canonicalize().unwrap().join("safe.md"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn searches_names_headings_markdown_and_note_content() {
    let root = temp_workspace();
    fs::write(root.join("clock.md"), "# Timing Closure\n\nuseful skew improves setup").unwrap();
    let note = root.join("cislunar.note");
    fs::create_dir_all(&note).unwrap();
    fs::write(note.join("content.md"), "# Cislunar Plan\n\ncontact latency needle").unwrap();
    fs::write(note.join("note.json"), r#"{"formatVersion":1,"type":"mixed","title":"Cislunar Visual"}"#).unwrap();

    let mut store = WorkspaceStore::default();
    store.bind(&root).unwrap();

    let skew = store.search("useful skew").unwrap();
    assert_eq!(skew.len(), 1);
    assert_eq!(skew[0].relative_path, "clock.md");
    assert_eq!(skew[0].title, "Timing Closure");

    let contact = store.search("contact latency").unwrap();
    assert_eq!(contact.len(), 1);
    assert_eq!(contact[0].relative_path, "cislunar.note");
    assert_eq!(contact[0].kind, WorkspaceEntryKind::Note);

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn creates_unique_markdown_and_renames_inside_workspace() {
    let root = temp_workspace();
    fs::create_dir_all(root.join("Drafts")).unwrap();
    fs::write(root.join("Drafts").join("Untitled.md"), "").unwrap();

    let mut store = WorkspaceStore::default();
    store.bind(&root).unwrap();
    let created = store.create_markdown("Drafts").unwrap();
    assert_eq!(created.relative_path, "Drafts/Untitled 2.md");
    assert!(root.join("Drafts").join("Untitled 2.md").is_file());

    let renamed = store.rename("Drafts/Untitled 2.md", "Timing.md").unwrap();
    assert_eq!(renamed.relative_path, "Drafts/Timing.md");
    assert!(root.join("Drafts").join("Timing.md").is_file());

    let collision = store.rename("Drafts/Timing.md", "Untitled.md").unwrap_err();
    assert_eq!(collision.code, "conflict");

    fs::remove_dir_all(root).unwrap();
}


#[test]
fn persists_and_restores_the_last_workspace_root() {
    let root = temp_workspace();
    fs::write(root.join("restore.md"), "# Restore").unwrap();
    let config_dir = temp_workspace();
    let config = config_dir.join("workspace.json");

    let mut first = WorkspaceStore::default();
    first.bind(&root).unwrap();
    first.persist(&config).unwrap();

    let mut restored = WorkspaceStore::default();
    let snapshot = restored.restore(&config).unwrap().expect("workspace should restore");
    assert_eq!(snapshot.name, root.file_name().unwrap().to_string_lossy());
    assert_eq!(snapshot.entries[0].relative_path, "restore.md");

    fs::remove_dir_all(root).unwrap();
    fs::remove_dir_all(config_dir).unwrap();
}


#[test]
fn missing_persisted_root_restores_to_no_workspace() {
    let root = temp_workspace();
    let config_dir = temp_workspace();
    let config = config_dir.join("workspace.json");

    let mut first = WorkspaceStore::default();
    first.bind(&root).unwrap();
    first.persist(&config).unwrap();
    fs::remove_dir_all(&root).unwrap();

    let mut restored = WorkspaceStore::default();
    assert!(restored.restore(&config).unwrap().is_none());
    assert_eq!(restored.root().unwrap_err().code, "closed");

    fs::remove_dir_all(config_dir).unwrap();
}

#[test]
fn skips_hidden_build_directories_and_symlinks() {
    let root = temp_workspace();
    fs::write(root.join("visible.md"), "# visible").unwrap();
    for name in [".hidden", "dist", "target"] {
        let directory = root.join(name);
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("ignored.md"), "# ignored").unwrap();
    }

    let outside = temp_workspace();
    fs::write(outside.join("outside.md"), "# outside").unwrap();
    let link = root.join("outside-link.md");
    match std::os::windows::fs::symlink_file(outside.join("outside.md"), &link) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied || error.raw_os_error() == Some(1314) => {
            eprintln!("symlink creation unavailable on this Windows host; scan still covers ignored directories");
        }
        Err(error) => panic!("failed to create symlink: {error}"),
    }

    let mut store = WorkspaceStore::default();
    let snapshot = store.bind(&root).unwrap();
    assert_eq!(snapshot.entries.len(), 1);
    assert_eq!(snapshot.entries[0].relative_path, "visible.md");
    if link.exists() {
        assert_eq!(store.resolve_existing("outside-link.md").unwrap_err().code, "invalidPath");
    }

    fs::remove_dir_all(root).unwrap();
    fs::remove_dir_all(outside).unwrap();
}

#[test]
fn search_uses_note_metadata_title_and_ignores_private_block_assets() {
    let root = temp_workspace();
    let note = root.join("visual.note");
    fs::create_dir_all(note.join("blocks").join("private")).unwrap();
    fs::write(note.join("content.md"), "# Body Heading\n\nordinary body").unwrap();
    fs::write(note.join("note.json"), r#"{"formatVersion":1,"type":"mixed","title":"Metadata Needle"}"#).unwrap();
    fs::write(note.join("blocks").join("private").join("source.html"), "private-only-needle").unwrap();

    let mut store = WorkspaceStore::default();
    store.bind(&root).unwrap();
    let title = store.search("metadata needle").unwrap();
    assert_eq!(title.len(), 1);
    assert_eq!(title[0].relative_path, "visual.note");
    assert_eq!(title[0].title, "Metadata Needle");
    assert!(store.search("private-only-needle").unwrap().is_empty());

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn search_skips_oversized_files_and_caps_results() {
    let root = temp_workspace();
    fs::write(root.join("huge.md"), vec![b'x'; 2 * 1024 * 1024 + 1]).unwrap();
    for index in 0..110 {
        fs::write(root.join(format!("n{index:03}.md")), "# Common Needle\ncommon needle").unwrap();
    }

    let mut store = WorkspaceStore::default();
    store.bind(&root).unwrap();
    assert!(store.search("xxxxx").unwrap().is_empty());
    let results = store.search("common needle").unwrap();
    assert_eq!(results.len(), 100);

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rename_preserves_extensions_and_folder_moves_stay_inside_workspace() {
    let root = temp_workspace();
    fs::write(root.join("alpha.md"), "# alpha").unwrap();
    let note = root.join("visual.note");
    fs::create_dir_all(&note).unwrap();
    fs::write(note.join("content.md"), "# Visual").unwrap();
    fs::write(note.join("note.json"), r#"{"formatVersion":1,"type":"mixed","title":"Visual"}"#).unwrap();
    fs::create_dir_all(root.join("Folder")).unwrap();

    let mut store = WorkspaceStore::default();
    store.bind(&root).unwrap();
    assert_eq!(store.rename("alpha.md", "beta").unwrap().relative_path, "beta.md");
    assert_eq!(store.rename("visual.note", "renamed").unwrap().relative_path, "renamed.note");
    assert_eq!(store.rename("Folder", "Archive").unwrap().relative_path, "Archive");
    assert!(root.join("Archive").is_dir());

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn deletes_markdown_note_and_only_empty_folders() {
    let root = temp_workspace();
    fs::write(root.join("delete.md"), "# delete").unwrap();
    let note = root.join("delete.note");
    fs::create_dir_all(&note).unwrap();
    fs::write(note.join("content.md"), "# Visual").unwrap();
    fs::write(note.join("note.json"), r#"{"formatVersion":1,"type":"mixed","title":"Visual"}"#).unwrap();
    fs::create_dir_all(root.join("Empty")).unwrap();
    fs::create_dir_all(root.join("NonEmpty")).unwrap();
    fs::write(root.join("NonEmpty").join("keep.md"), "# keep").unwrap();

    let mut store = WorkspaceStore::default();
    store.bind(&root).unwrap();
    assert_eq!(store.delete("delete.md").unwrap().relative_path, "delete.md");
    assert_eq!(store.delete("delete.note").unwrap().relative_path, "delete.note");
    assert_eq!(store.delete("Empty").unwrap().relative_path, "Empty");
    assert!(!root.join("delete.md").exists());
    assert!(!root.join("delete.note").exists());
    assert!(!root.join("Empty").exists());
    assert!(store.delete("NonEmpty").is_err());
    assert!(root.join("NonEmpty").join("keep.md").exists());

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn markdown_and_note_resolvers_reject_the_wrong_entry_kind() {
    let root = temp_workspace();
    fs::write(root.join("plain.md"), "# Plain").unwrap();
    let note = root.join("mixed.note");
    fs::create_dir_all(&note).unwrap();
    fs::write(note.join("content.md"), "# Mixed").unwrap();
    fs::write(note.join("note.json"), r#"{"formatVersion":1,"type":"mixed","title":"Mixed"}"#).unwrap();

    let mut store = WorkspaceStore::default();
    store.bind(&root).unwrap();
    assert_eq!(store.resolve_markdown("mixed.note").unwrap_err().code, "invalidFormat");
    assert_eq!(store.resolve_note("plain.md").unwrap_err().code, "invalidFormat");

    fs::remove_dir_all(root).unwrap();
}
