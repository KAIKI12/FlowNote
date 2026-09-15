use crate::file_error::{FileError, FileResult};
use crate::note_path::{validate_absolute, validate_entry};
use crate::windows_file::rename_handle;
use crate::windows_security::FileSecurity;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::os::windows::{ffi::OsStrExt, fs::OpenOptionsExt, io::{AsRawHandle, FromRawHandle}};
use std::path::{Path, PathBuf};
use windows_sys::Win32::Foundation::{ERROR_HANDLE_EOF, ERROR_INSUFFICIENT_BUFFER, ERROR_MORE_DATA, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::*;

const SUPPORTED_ATTRIBUTES: u32 = FILE_ATTRIBUTE_NORMAL | FILE_ATTRIBUTE_ARCHIVE | FILE_ATTRIBUTE_HIDDEN
    | FILE_ATTRIBUTE_SYSTEM | FILE_ATTRIBUTE_NOT_CONTENT_INDEXED | FILE_ATTRIBUTE_TEMPORARY
    | FILE_ATTRIBUTE_READONLY | FILE_ATTRIBUTE_DIRECTORY;
const STREAM_BUFFER_BYTES: usize = 1024;

pub(crate) struct Directory { pub file: File, pub path: PathBuf }

#[derive(Clone)]
pub(crate) struct NoteMetadata {
    pub basic: FILE_BASIC_INFO,
    pub security: FileSecurity,
    pub security_stamp: Vec<u8>,
}

pub(crate) fn information<T: Default>(file: &File, kind: FILE_INFO_BY_HANDLE_CLASS) -> FileResult<T> {
    let mut value = T::default();
    let success = unsafe { GetFileInformationByHandleEx(file.as_raw_handle(), kind,
        (&mut value as *mut T).cast(), std::mem::size_of::<T>() as u32) };
    if success == 0 { return Err(FileError::io("读取 Note 存储属性失败", std::io::Error::last_os_error())); }
    Ok(value)
}

fn check_streams(file: &File, directory: bool) -> FileResult<()> {
    let mut buffer = vec![0u64; STREAM_BUFFER_BYTES / std::mem::size_of::<u64>()];
    let success = unsafe { GetFileInformationByHandleEx(file.as_raw_handle(), FileStreamInfo,
        buffer.as_mut_ptr().cast(), STREAM_BUFFER_BYTES as u32) };
    if success == 0 {
        let error = std::io::Error::last_os_error();
        if directory && error.raw_os_error() == Some(ERROR_HANDLE_EOF as i32) { return Ok(()); }
        if matches!(error.raw_os_error(), Some(code) if code == ERROR_MORE_DATA as i32 || code == ERROR_INSUFFICIENT_BUFFER as i32) {
            return Err(FileError::new("unsupportedMetadata", "Note 含附加数据流，当前保存不能完整保留"));
        }
        return Err(FileError::io("无法核实 Note 附加数据流", error));
    }
    let info = unsafe { &*buffer.as_ptr().cast::<FILE_STREAM_INFO>() };
    if directory && info.StreamNameLength == 0 && info.NextEntryOffset == 0 { return Ok(()); }
    let expected: Vec<u16> = "::$DATA".encode_utf16().collect();
    if info.NextEntryOffset != 0 || info.StreamNameLength as usize != expected.len() * std::mem::size_of::<u16>() {
        return Err(FileError::new("unsupportedMetadata", "Note 含附加数据流，当前保存不能完整保留"));
    }
    if unsafe { std::slice::from_raw_parts(info.StreamName.as_ptr(), expected.len()) } != expected {
        return Err(FileError::new("unsupportedMetadata", "Note 含附加数据流，当前保存不能完整保留"));
    }
    Ok(())
}

impl NoteMetadata {
    pub fn read(file: &File) -> FileResult<Self> {
        let basic: FILE_BASIC_INFO = information(file, FileBasicInfo)?;
        if basic.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(FileError::new("invalidPath", "Note 禁止跟随重解析点"));
        }
        let mut security = FileSecurity::read(file)?;
        let security_stamp = security.fingerprint()?;
        Ok(Self { basic, security, security_stamp })
    }

    pub fn directory(&self) -> bool { self.basic.FileAttributes & FILE_ATTRIBUTE_DIRECTORY != 0 }

    pub fn read_only(&self) -> bool { self.basic.FileAttributes & FILE_ATTRIBUTE_READONLY != 0 }

    pub fn ensure_copyable(&self, file: &File) -> FileResult<()> {
        if self.basic.FileAttributes & !SUPPORTED_ATTRIBUTES != 0 {
            return Err(FileError::new("unsupportedMetadata", "Note 含加密、压缩、稀疏或其他不能完整保留的存储属性"));
        }
        let standard: FILE_STANDARD_INFO = information(file, FileStandardInfo)?;
        if !self.directory() && standard.NumberOfLinks != 1 {
            return Err(FileError::new("unsupportedMetadata", "Note 文件含多个硬链接，不能静默拆分其存储关系"));
        }
        check_streams(file, self.directory())
    }

    pub fn stamp(&self, write_time: bool) -> Vec<u8> {
        let mut bytes = self.basic.CreationTime.to_le_bytes().to_vec();
        bytes.extend_from_slice(&self.basic.FileAttributes.to_le_bytes());
        bytes.extend_from_slice(&self.security_stamp);
        if write_time && !self.directory() { bytes.extend_from_slice(&self.basic.LastWriteTime.to_le_bytes()); }
        bytes
    }

    pub fn apply_basic(&self, file: &File, preserve_write: bool) -> FileResult<()> {
        let basic = FILE_BASIC_INFO { CreationTime: self.basic.CreationTime, LastAccessTime: self.basic.LastAccessTime,
            LastWriteTime: if preserve_write { self.basic.LastWriteTime } else { 0 },
            FileAttributes: self.basic.FileAttributes, ..FILE_BASIC_INFO::default() };
        let success = unsafe { SetFileInformationByHandle(file.as_raw_handle(), FileBasicInfo,
            (&basic as *const FILE_BASIC_INFO).cast(), std::mem::size_of::<FILE_BASIC_INFO>() as u32) };
        if success == 0 { return Err(FileError::io("保留 Note 基本属性失败", std::io::Error::last_os_error())); }
        Ok(())
    }
}

impl Directory {
    pub fn open(path: &Path, rename: bool) -> FileResult<Self> {
        validate_entry(path, true)?;
        let file = OpenOptions::new().access_mode(FILE_GENERIC_READ | if rename { DELETE } else { 0 })
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path).map_err(|error| FileError::io("无法锁定 Note 目录", error))?;
        let basic: FILE_BASIC_INFO = information(&file, FileBasicInfo)?;
        if basic.FileAttributes & FILE_ATTRIBUTE_DIRECTORY == 0 || basic.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(FileError::new("invalidPath", "Note 目标不再是普通目录"));
        }
        Ok(Self { file, path: path.into() })
    }

    pub fn create(path: &Path, metadata: Option<&NoteMetadata>) -> FileResult<Self> {
        let mut security = metadata.map(|value| value.security.clone());
        let attributes = security.as_mut().map(FileSecurity::creation_attributes).transpose()?;
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let success = unsafe { CreateDirectoryW(wide.as_ptr(), attributes.as_ref().map_or(std::ptr::null(), |value| value)) };
        if success == 0 { return Err(FileError::io("创建 Note 候选目录失败", std::io::Error::last_os_error())); }
        let file = OpenOptions::new().access_mode(FILE_GENERIC_READ | DELETE | FILE_WRITE_ATTRIBUTES | WRITE_DAC | WRITE_OWNER)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path).map_err(|error| FileError::io("无法锁定新 Note 目录", error))?;
        if let Some(metadata) = metadata { metadata.security.clone().apply_and_verify(&file)?; }
        NoteMetadata::read(&file)?.ensure_copyable(&file)?;
        Ok(Self { file, path: path.into() })
    }

    pub fn rename_to(&mut self, path: &Path) -> FileResult<()> {
        rename_handle(&self.file, path)?;
        self.path = path.into();
        Ok(())
    }
}

pub(crate) fn lock_ancestors(path: &Path) -> FileResult<Vec<Directory>> {
    validate_absolute(path)?;
    let mut ancestors: Vec<_> = path.ancestors().skip(1).collect();
    ancestors.reverse();
    ancestors.into_iter().map(|parent| Directory::open(parent, false)).collect()
}

pub(crate) fn read_file(path: &Path, budget: usize) -> FileResult<(File, Vec<u8>, NoteMetadata)> {
    let mut file = OpenOptions::new().read(true).share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT).open(path)
        .map_err(|error| FileError::io("无法锁定 Note 文件", error))?;
    let before = NoteMetadata::read(&file)?;
    if before.directory() { return Err(FileError::new("invalidPath", "Note 文件被替换为目录")); }
    let mut bytes = Vec::new();
    Read::by_ref(&mut file).take((budget + 1) as u64).read_to_end(&mut bytes)
        .map_err(|error| FileError::io("读取 Note 文件失败", error))?;
    if bytes.len() > budget { return Err(FileError::new("tooLarge", "Note 目录总量不能超过 32 MiB")); }
    if before.stamp(true) != NoteMetadata::read(&file)?.stamp(true) {
        return Err(FileError::new("conflict", "Note 文件在读取期间发生变化"));
    }
    Ok((file, bytes, before))
}

pub(crate) fn create_file(path: &Path, bytes: &[u8], metadata: Option<&NoteMetadata>) -> FileResult<()> {
    let mut security = metadata.map(|value| value.security.clone());
    let attributes = security.as_mut().map(FileSecurity::creation_attributes).transpose()?;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let access = FILE_GENERIC_READ | FILE_GENERIC_WRITE | WRITE_DAC | WRITE_OWNER;
    let handle = unsafe { CreateFileW(wide.as_ptr(), access, FILE_SHARE_READ,
        attributes.as_ref().map_or(std::ptr::null(), |value| value), CREATE_NEW, FILE_ATTRIBUTE_NORMAL, std::ptr::null_mut()) };
    if handle == INVALID_HANDLE_VALUE { return Err(FileError::io("创建 Note 文件失败", std::io::Error::last_os_error())); }
    let mut file = unsafe { File::from_raw_handle(handle) };
    if let Some(metadata) = metadata { metadata.security.clone().apply_and_verify(&file)?; }
    NoteMetadata::read(&file)?.ensure_copyable(&file)?;
    file.write_all(bytes).map_err(|error| FileError::io("写入 Note 文件失败", error))?;
    if let Some(metadata) = metadata { metadata.apply_basic(&file, true)?; }
    file.sync_all().map_err(|error| FileError::io("同步 Note 文件失败", error))
}
