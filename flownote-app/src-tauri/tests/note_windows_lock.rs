#![cfg(windows)]

use std::fs::{self, File, OpenOptions};
use std::os::windows::{ffi::OsStrExt, fs::OpenOptionsExt, io::AsRawHandle};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use windows_sys::Win32::Storage::FileSystem::*;

fn note() -> PathBuf {
    let parent = std::env::temp_dir().join(format!("flownote-directory-lock-{}", Uuid::new_v4()));
    let path = parent.join("before.note");
    fs::create_dir_all(path.join("blocks")).unwrap();
    fs::write(path.join("content.md"), "original").unwrap();
    path
}

fn locked(path: &Path) -> File {
    OpenOptions::new().access_mode(FILE_GENERIC_READ | DELETE)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path).unwrap()
}

fn rename(file: &File, destination: &Path) -> bool {
    let wide: Vec<u16> = destination.as_os_str().encode_wide().collect();
    let bytes = std::mem::size_of::<FILE_RENAME_INFO>() + std::mem::size_of_val(wide.as_slice());
    let mut buffer = vec![0usize; bytes.div_ceil(std::mem::size_of::<usize>())];
    let info = buffer.as_mut_ptr().cast::<FILE_RENAME_INFO>();
    unsafe {
        std::ptr::write(info, FILE_RENAME_INFO::default());
        (*info).FileNameLength = std::mem::size_of_val(wide.as_slice()) as u32;
        std::ptr::copy_nonoverlapping(wide.as_ptr(), std::ptr::addr_of_mut!((*info).FileName).cast::<u16>(), wide.len());
        SetFileInformationByHandle(file.as_raw_handle(), FileRenameInfo, info.cast(), bytes as u32) != 0
    }
}

#[test]
fn directory_guard_blocks_rename_but_does_not_freeze_child_writes() {
    let path = note();
    let directory = locked(&path);
    assert!(fs::rename(&path, path.with_file_name("attacker.note")).is_err());
    fs::write(path.join("content.md"), "external").unwrap();
    assert_eq!(fs::read_to_string(path.join("content.md")).unwrap(), "external");
    assert!(rename(&directory, &path.with_file_name("renamed.note")));
}

#[test]
fn child_read_handles_must_close_before_renaming_the_root() {
    let path = note();
    let directory = locked(&path);
    let child = OpenOptions::new().read(true).share_mode(FILE_SHARE_READ | FILE_SHARE_DELETE)
        .open(path.join("content.md")).unwrap();
    assert!(fs::write(path.join("content.md"), "external").is_err());
    assert!(!rename(&directory, &path.with_file_name("renamed.note")));
    assert_eq!(child.metadata().unwrap().len(), "original".len() as u64);
    drop(child);
    assert!(rename(&directory, &path.with_file_name("renamed.note")));
}
