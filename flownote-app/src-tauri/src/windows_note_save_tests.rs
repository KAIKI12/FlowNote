use super::*;
use crate::note_files::{NoteSaveAsRequest, NoteStore};
use serde_json::json;
use std::fs;

fn draft() -> NoteSaveAsRequest {
    serde_json::from_value(json!({ "name": "race.note", "content": "ORIGINAL\n", "mixed": {
        "metadata": { "formatVersion": 1, "type": "mixed", "title": "Race", "createdAt": "2026-09-14", "updatedAt": "2026-09-14" },
        "blocks": [] } })).unwrap()
}

fn target() -> (PathBuf, crate::note_files::NoteSnapshot) {
    let parent = std::env::temp_dir().join(format!("flownote-note-race-{}", Uuid::new_v4()));
    fs::create_dir(&parent).unwrap();
    let path = parent.join("race.note");
    let note = NoteStore::default().save_as_selected(&path, draft()).unwrap();
    (path, note)
}

fn request<'a>(path: &'a Path, note: &'a crate::note_files::NoteSnapshot) -> NoteWrite<'a> {
    NoteWrite { target: path, source: Some(path), expected: Some(&note.revision), content: "LOCAL\n".into(), mixed: note.mixed.clone(), assets: Vec::new(), block_copies: Vec::new(), repair_source: false }
}

#[test]
fn a_new_directory_in_the_handoff_gap_is_not_overwritten_and_both_versions_remain() {
    let (path, note) = target();
    let error = execute(request(&path, &note), |stage, target| {
        if stage == SaveStage::BackedUp {
            fs::create_dir(target).unwrap();
            fs::write(target.join("external.txt"), "EXTERNAL").unwrap();
        }
    }).err().unwrap();
    assert_eq!(error.code, "conflict");
    assert_eq!(fs::read_to_string(path.join("external.txt")).unwrap(), "EXTERNAL");
    let current = PathBuf::from(error.recovery_path.unwrap());
    let original = PathBuf::from(error.original_recovery_path.unwrap());
    assert_eq!(fs::read_to_string(current.join("content.md")).unwrap(), "LOCAL\n");
    assert_eq!(fs::read_to_string(original.join("content.md")).unwrap(), "ORIGINAL\n");
}

#[test]
fn a_child_write_after_unlock_is_detected_after_renaming_the_source_and_restored() {
    let (path, note) = target();
    let error = execute(request(&path, &note), |stage, target| {
        if stage == SaveStage::SourceUnlocked { fs::write(target.join("content.md"), "EXTERNAL\n").unwrap(); }
    }).err().unwrap();
    assert_eq!(error.code, "conflict");
    assert_eq!(fs::read_to_string(path.join("content.md")).unwrap(), "EXTERNAL\n");
    let current = PathBuf::from(error.recovery_path.unwrap());
    assert_eq!(fs::read_to_string(current.join("content.md")).unwrap(), "LOCAL\n");
    assert_eq!(PathBuf::from(error.original_recovery_path.unwrap()).canonicalize().unwrap(), path.canonicalize().unwrap());
}

#[test]
fn late_metadata_streams_are_never_removed_with_the_original_note() {
    let (path, note) = target();
    let stream = PathBuf::from(format!("{}:private", path.join("content.md").display()));
    let error = execute(request(&path, &note), |stage, _| {
        if stage == SaveStage::Staged { fs::write(&stream, "ADDED EXTERNALLY").unwrap(); }
    }).err().unwrap();
    assert!(["conflict", "unsupportedMetadata"].contains(&error.code.as_str()));
    assert_eq!(fs::read_to_string(stream).unwrap(), "ADDED EXTERNALLY");
    assert_eq!(fs::read_to_string(path.join("content.md")).unwrap(), "ORIGINAL\n");
    assert!(PathBuf::from(error.recovery_path.unwrap()).is_dir());
}

#[test]
fn first_save_refuses_a_directory_created_after_staging() {
    let parent = std::env::temp_dir().join(format!("flownote-note-new-race-{}", Uuid::new_v4()));
    fs::create_dir(&parent).unwrap();
    let path = parent.join("new.note");
    let draft = draft();
    let write = NoteWrite { target: &path, source: None, expected: None, content: draft.content, mixed: draft.mixed, assets: Vec::new(), block_copies: Vec::new(), repair_source: false };
    let error = execute(write, |stage, target| {
        if stage == SaveStage::Staged { fs::create_dir(target).unwrap(); }
    }).err().unwrap();
    assert_eq!(error.code, "conflict");
    assert_eq!(fs::read_dir(path).unwrap().count(), 0);
    assert!(PathBuf::from(error.recovery_path.unwrap()).join("content.md").is_file());
}


#[test]
fn failed_save_keeps_parseable_current_and_original_recovery_packages() {
    let (path, note) = target();
    let error = execute(request(&path, &note), |stage, target| {
        if stage == SaveStage::BackedUp {
            fs::create_dir(target).unwrap();
            fs::write(target.join("external.txt"), "EXTERNAL").unwrap();
        }
    }).err().unwrap();
    assert_eq!(error.code, "conflict");

    let current = PathBuf::from(error.recovery_path.unwrap());
    let original = PathBuf::from(error.original_recovery_path.unwrap());

    let current_directory = Directory::open(&current, false).unwrap();
    let current_tree = NoteTree::read(&current_directory).unwrap();
    let current_document = current_tree.document().unwrap();
    assert_eq!(current_document.content, "LOCAL\n");
    assert!(!current_document.read_only);

    let original_directory = Directory::open(&original, false).unwrap();
    let original_tree = NoteTree::read(&original_directory).unwrap();
    let original_document = original_tree.document().unwrap();
    assert_eq!(original_document.content, "ORIGINAL\n");
    assert!(!original_document.read_only);

    assert!(current.join("note.json").is_file());
    assert!(original.join("note.json").is_file());
    assert_eq!(fs::read_to_string(path.join("external.txt")).unwrap(), "EXTERNAL");
}
