use crate::file_error::{FileError, FileResult};
use crate::windows_security::FileSecurity;
use std::fs::File;
use std::os::windows::io::AsRawHandle;
use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_MORE_DATA};
use windows_sys::Win32::Storage::FileSystem::*;

const SUPPORTED_ATTRIBUTES: u32 = FILE_ATTRIBUTE_NORMAL | FILE_ATTRIBUTE_ARCHIVE | FILE_ATTRIBUTE_HIDDEN
    | FILE_ATTRIBUTE_SYSTEM | FILE_ATTRIBUTE_NOT_CONTENT_INDEXED | FILE_ATTRIBUTE_TEMPORARY;
const STREAM_INFORMATION_BYTES: usize = 1024;

pub struct FileMetadata {
    pub security: FileSecurity,
    basic: FILE_BASIC_INFO,
}

fn information<T: Default>(file: &File, kind: FILE_INFO_BY_HANDLE_CLASS) -> FileResult<T> {
    let mut info = T::default();
    let success = unsafe { GetFileInformationByHandleEx(file.as_raw_handle(), kind,
        (&mut info as *mut T).cast(), std::mem::size_of::<T>() as u32) };
    if success == 0 { return Err(FileError::io("读取文件属性失败", std::io::Error::last_os_error())); }
    Ok(info)
}

fn unsupported(message: &str) -> FileError {
    FileError::new("unsupportedMetadata", format!("{message}，当前无法保留，请使用另存为"))
}

fn check_streams(file: &File) -> FileResult<()> {
    let mut buffer = vec![0u64; STREAM_INFORMATION_BYTES / std::mem::size_of::<u64>()];
    let success = unsafe { GetFileInformationByHandleEx(file.as_raw_handle(), FileStreamInfo,
        buffer.as_mut_ptr().cast(), STREAM_INFORMATION_BYTES as u32) };
    if success == 0 {
        let error = std::io::Error::last_os_error();
        if matches!(error.raw_os_error(), Some(code) if code == ERROR_MORE_DATA as i32 || code == ERROR_INSUFFICIENT_BUFFER as i32) {
            return Err(unsupported("文件含附加数据流"));
        }
        return Err(FileError::io("无法核实文件附加数据流，尚未保存", error));
    }
    let info = unsafe { &*buffer.as_ptr().cast::<FILE_STREAM_INFO>() };
    let expected: Vec<u16> = "::$DATA".encode_utf16().collect();
    if info.NextEntryOffset != 0 || info.StreamNameLength as usize != expected.len() * std::mem::size_of::<u16>() {
        return Err(unsupported("文件含附加数据流"));
    }
    let name = unsafe { std::slice::from_raw_parts(info.StreamName.as_ptr(), expected.len()) };
    if name != expected { return Err(unsupported("文件含附加数据流")); }
    Ok(())
}

pub fn check_supported(file: &File) -> FileResult<FILE_BASIC_INFO> {
    let basic: FILE_BASIC_INFO = information(file, FileBasicInfo)?;
    if basic.FileAttributes & FILE_ATTRIBUTE_READONLY != 0 {
        return Err(FileError::new("readOnly", "文件为只读，请使用另存为"));
    }
    if basic.FileAttributes & !SUPPORTED_ATTRIBUTES != 0 {
        return Err(unsupported("文件含加密、压缩、稀疏或其他特殊存储属性"));
    }
    let standard: FILE_STANDARD_INFO = information(file, FileStandardInfo)?;
    if standard.NumberOfLinks != 1 { return Err(unsupported("文件存在多个硬链接")); }
    check_streams(file)?;
    Ok(basic)
}

impl FileMetadata {
    pub fn read(file: &File) -> FileResult<Self> {
        Ok(Self { basic: check_supported(file)?, security: FileSecurity::read(file)? })
    }

    pub fn verify(&mut self, file: &File) -> FileResult<()> {
        let current = check_supported(file)?;
        let same = current.CreationTime == self.basic.CreationTime
            && current.FileAttributes == self.basic.FileAttributes
            && self.security.matches_file(file)?;
        if !same { return Err(FileError::new("conflict", "保存期间文件属性或访问权限发生变化")); }
        Ok(())
    }

    pub fn apply_basic(&self, file: &File) -> FileResult<()> {
        let basic = FILE_BASIC_INFO { CreationTime: self.basic.CreationTime,
            LastAccessTime: self.basic.LastAccessTime, FileAttributes: self.basic.FileAttributes,
            ..FILE_BASIC_INFO::default() };
        let success = unsafe { SetFileInformationByHandle(file.as_raw_handle(), FileBasicInfo,
            (&basic as *const FILE_BASIC_INFO).cast(), std::mem::size_of::<FILE_BASIC_INFO>() as u32) };
        if success == 0 { return Err(FileError::io("保留文件属性失败", std::io::Error::last_os_error())); }
        Ok(())
    }
}
