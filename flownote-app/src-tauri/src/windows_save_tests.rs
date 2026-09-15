use super::*;
use std::fs;

fn target() -> PathBuf {
    let directory = std::env::temp_dir().join(format!("flownote-locked-save-{}", Uuid::new_v4()));
    fs::create_dir(&directory).unwrap();
    directory.canonicalize().unwrap().join("笔记😀.md")
}

#[test]
fn external_replacement_after_staging_is_prevented_by_the_original_lock() {
    let path = target();
    fs::write(&path, "ORIGINAL").unwrap();
    let external = path.with_file_name("external.md");
    fs::write(&external, "EXTERNAL").unwrap();
    let expected = revision(b"ORIGINAL");
    let result = execute(AtomicSave { path: &path, content: "LOCAL", expected: Some(&expected) }, |stage, destination| {
        if stage == SaveStage::Staged { assert!(fs::rename(&external, destination).is_err()); }
    });
    result.unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "LOCAL");
    assert_eq!(fs::read_to_string(&external).unwrap(), "EXTERNAL");
}

#[test]
fn file_created_in_handoff_gap_and_both_recovery_versions_survive() {
    let path = target();
    fs::write(&path, "ORIGINAL").unwrap();
    let expected = revision(b"ORIGINAL");
    let error = execute(AtomicSave { path: &path, content: "LOCAL", expected: Some(&expected) }, |stage, destination| {
        if stage == SaveStage::BackedUp { fs::write(destination, "EXTERNAL").unwrap(); }
    }).err().unwrap();
    assert_eq!(error.code, "conflict");
    assert_eq!(fs::read_to_string(&path).unwrap(), "EXTERNAL");
    assert_eq!(fs::read_to_string(error.recovery_path.unwrap()).unwrap(), "LOCAL");
    assert_eq!(fs::read_to_string(error.original_recovery_path.unwrap()).unwrap(), "ORIGINAL");
}

#[test]
fn parent_and_committed_file_are_locked_through_acknowledgement() {
    let path = target();
    fs::write(&path, "ORIGINAL").unwrap();
    let expected = revision(b"ORIGINAL");
    let external = path.with_file_name("external.md");
    fs::write(&external, "EXTERNAL").unwrap();
    execute(AtomicSave { path: &path, content: "LOCAL", expected: Some(&expected) }, |stage, destination| {
        let parent = destination.parent().unwrap();
        assert!(fs::rename(parent, parent.with_extension("moved")).is_err());
        if stage == SaveStage::Committed { assert!(fs::rename(&external, destination).is_err()); }
    }).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "LOCAL");
    assert_eq!(fs::read_to_string(external).unwrap(), "EXTERNAL");
    assert!(!fs::read_dir(path.parent().unwrap()).unwrap().any(|entry| entry.unwrap().path().extension().and_then(|ext| ext.to_str()) == Some("tmp")));
}

#[test]
fn new_file_does_not_overwrite_an_external_creation() {
    let path = target();
    let error = execute(AtomicSave { path: &path, content: "LOCAL", expected: None }, |stage, destination| {
        if stage == SaveStage::Staged { fs::write(destination, "EXTERNAL").unwrap(); }
    }).err().unwrap();
    assert_eq!(error.code, "conflict");
    assert_eq!(fs::read_to_string(&path).unwrap(), "EXTERNAL");
    assert_eq!(fs::read_to_string(error.recovery_path.unwrap()).unwrap(), "LOCAL");
}

#[test]
fn streams_added_during_staging_are_kept_with_the_original() {
    let path = target();
    fs::write(&path, "ORIGINAL").unwrap();
    let expected = revision(b"ORIGINAL");
    let stream = PathBuf::from(format!("{}:external-metadata", path.display()));
    let result = execute(AtomicSave { path: &path, content: "LOCAL", expected: Some(&expected) }, |stage, _| {
        if stage == SaveStage::Staged { fs::write(&stream, "ADDED EXTERNALLY").unwrap(); }
    });
    let error = result.err().expect("A data sharing lock does not lock alternate streams");
    assert_eq!(error.code, "unsupportedMetadata");
    assert_eq!(fs::read_to_string(&path).unwrap(), "ORIGINAL");
    assert_eq!(fs::read_to_string(stream).unwrap(), "ADDED EXTERNALLY");
    assert_eq!(fs::read_to_string(error.recovery_path.unwrap()).unwrap(), "LOCAL");
}

#[test]
fn hard_links_added_during_staging_are_not_detached() {
    let path = target();
    fs::write(&path, "ORIGINAL").unwrap();
    let expected = revision(b"ORIGINAL");
    let alias = path.with_file_name("added-alias.md");
    let result = execute(AtomicSave { path: &path, content: "LOCAL", expected: Some(&expected) }, |stage, _| {
        if stage == SaveStage::Staged { fs::hard_link(&path, &alias).unwrap(); }
    });
    let error = result.err().expect("A data sharing lock does not prevent creation of hard links");
    assert_eq!(error.code, "unsupportedMetadata");
    assert_eq!(fs::read_to_string(&path).unwrap(), "ORIGINAL");
    assert_eq!(fs::read_to_string(alias).unwrap(), "ORIGINAL");
    assert_eq!(fs::read_to_string(error.recovery_path.unwrap()).unwrap(), "LOCAL");
}

#[test]
fn metadata_added_after_publication_keeps_the_original_with_a_notice() {
    let path = target();
    fs::write(&path, "ORIGINAL").unwrap();
    let expected = revision(b"ORIGINAL");
    let mut backup = None;
    let receipt = execute(AtomicSave { path: &path, content: "LOCAL", expected: Some(&expected) }, |stage, destination| {
        if stage != SaveStage::Committed { return; }
        let original = fs::read_dir(destination.parent().unwrap()).unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| path.file_name().unwrap().to_string_lossy().contains(".flownote-original-")).unwrap();
        fs::write(format!("{}:late", original.display()), "LATE METADATA").unwrap();
        backup = Some(original);
    }).unwrap();
    let backup = backup.unwrap();
    assert!(receipt.notice.as_ref().is_some_and(|notice| notice.contains(backup.to_string_lossy().as_ref())));
    assert_eq!(fs::read_to_string(&path).unwrap(), "LOCAL");
    assert_eq!(fs::read_to_string(&backup).unwrap(), "ORIGINAL");
    assert_eq!(fs::read_to_string(format!("{}:late", backup.display())).unwrap(), "LATE METADATA");
}
