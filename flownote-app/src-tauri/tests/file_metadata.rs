#![cfg(windows)]

use flownote::markdown_files::{FileSnapshot, FileStore, SaveRequest};
use std::fs;
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

fn target() -> PathBuf {
    let directory = std::env::temp_dir().join(format!("flownote-metadata-{}", Uuid::new_v4()));
    fs::create_dir(&directory).unwrap();
    let path = directory.join("private.md");
    fs::write(&path, "ORIGINAL").unwrap();
    path
}

fn powershell(path: &Path, script: &str) -> String {
    let result = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("FLOWNOTE_METADATA_FILE", path).output().unwrap();
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
    String::from_utf8(result.stdout).unwrap().trim().into()
}

fn save(store: &mut FileStore, file: &FileSnapshot) -> Result<FileSnapshot, flownote::file_error::FileError> {
    store.save(SaveRequest { id: file.id.clone(), revision: file.revision.clone(), content: "LOCAL".into() })
}

const GET_SECURITY: &str = r#"
$ErrorActionPreference = 'Stop'
$acl = [System.IO.File]::GetAccessControl($env:FLOWNOTE_METADATA_FILE)
$acl.Owner
$acl.Group
$acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | ForEach-Object {
    '{0}|{1}|{2}|{3}|{4}|{5}' -f $_.IdentityReference, $_.FileSystemRights, $_.AccessControlType, $_.InheritanceFlags, $_.PropagationFlags, $_.IsInherited
}
$acl.AreAccessRulesProtected
"#;

#[test]
fn saved_file_keeps_its_private_acl_in_a_readable_parent() {
    let path = target();
    powershell(&path, r#"
$ErrorActionPreference = 'Stop'
$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$everyone = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0')
$parent = Split-Path -LiteralPath $env:FLOWNOTE_METADATA_FILE
$directory = [System.Security.AccessControl.DirectorySecurity]::new()
$directory.SetAccessRuleProtection($true, $false)
$directory.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($me, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))
$directory.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($everyone, 'ReadAndExecute', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))
[System.IO.Directory]::SetAccessControl($parent, $directory)
$private = [System.IO.File]::GetAccessControl($env:FLOWNOTE_METADATA_FILE)
$private.SetAccessRuleProtection($true, $false)
$private.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($me, 'FullControl', 'Allow'))
[System.IO.File]::SetAccessControl($env:FLOWNOTE_METADATA_FILE, $private)
"#);
    let before = powershell(&path, GET_SECURITY);
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    save(&mut store, &file).unwrap();
    assert_eq!(powershell(&path, GET_SECURITY), before, "Save must not grant parent readers access");
    assert_eq!(fs::read_to_string(&path).unwrap(), "LOCAL");
}

#[test]
fn saved_file_keeps_creation_time_and_basic_attributes() {
    let path = target();
    powershell(&path, r#"
$ErrorActionPreference = 'Stop'
[System.IO.File]::SetCreationTimeUtc($env:FLOWNOTE_METADATA_FILE, [datetime]'2000-01-01')
[System.IO.File]::SetLastWriteTimeUtc($env:FLOWNOTE_METADATA_FILE, [datetime]'2001-01-01')
[System.IO.File]::SetAttributes($env:FLOWNOTE_METADATA_FILE, 'Hidden, NotContentIndexed, Archive')
"#);
    let before = fs::metadata(&path).unwrap();
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    save(&mut store, &file).unwrap();
    let after = fs::metadata(&path).unwrap();
    assert_eq!(after.file_attributes(), before.file_attributes());
    assert_eq!(after.creation_time(), before.creation_time());
    assert_ne!(after.last_write_time(), before.last_write_time());
    assert_eq!(fs::read_to_string(&path).unwrap(), "LOCAL");
}

#[test]
fn attached_data_streams_cause_a_visible_refusal_before_writing() {
    let path = target();
    let stream = PathBuf::from(format!("{}:private", path.display()));
    fs::write(&stream, "ATTACHED DATA").unwrap();
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    let error = save(&mut store, &file).expect_err("Must not silently remove alternate streams");
    assert_eq!(error.code, "unsupportedMetadata");
    assert!(error.message.contains("另存为"));
    assert_eq!(fs::read_to_string(&path).unwrap(), "ORIGINAL");
    assert_eq!(fs::read_to_string(&stream).unwrap(), "ATTACHED DATA");
    assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
}

#[test]
fn multiple_hard_links_are_not_silently_detached() {
    let path = target();
    let alias = path.with_file_name("alias.md");
    fs::hard_link(&path, &alias).unwrap();
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    let error = save(&mut store, &file).expect_err("Must not silently detach a hard link");
    assert_eq!(error.code, "unsupportedMetadata");
    assert_eq!(fs::read_to_string(path).unwrap(), "ORIGINAL");
    assert_eq!(fs::read_to_string(alias).unwrap(), "ORIGINAL");
}

#[test]
fn an_inherited_acl_still_tracks_parent_rule_changes_after_saving() {
    let path = target();
    let untouched = path.with_file_name("untouched.md");
    fs::write(&untouched, "OTHER").unwrap();
    let before = powershell(&untouched, GET_SECURITY);
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    save(&mut store, &file).unwrap();
    assert_eq!(powershell(&path, GET_SECURITY), before);
    powershell(&path, r#"
$ErrorActionPreference = 'Stop'
$parent = Split-Path -LiteralPath $env:FLOWNOTE_METADATA_FILE
$acl = [System.IO.Directory]::GetAccessControl($parent)
$everyone = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0')
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($everyone, 'ReadAndExecute', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))
[System.IO.Directory]::SetAccessControl($parent, $acl)
"#);
    let inherited = powershell(&untouched, GET_SECURITY);
    assert_ne!(inherited, before, "Parent change must reach the unsaved control file");
    assert_eq!(powershell(&path, GET_SECURITY), inherited);
}

#[test]
fn a_compressed_original_is_not_replaced_by_uncompressed_content() {
    let path = target();
    let result = Command::new("compact.exe").args(["/C", "/I", "/Q"]).arg(&path).output().unwrap();
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
    const COMPRESSED: u32 = windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_COMPRESSED;
    assert_ne!(fs::metadata(&path).unwrap().file_attributes() & COMPRESSED, 0);
    let mut store = FileStore::default();
    let file = store.open_selected(&path).unwrap();
    let error = save(&mut store, &file).unwrap_err();
    assert_eq!(error.code, "unsupportedMetadata");
    assert_eq!(fs::read_to_string(&path).unwrap(), "ORIGINAL");
    assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
}
