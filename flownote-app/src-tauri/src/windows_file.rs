use crate::file_data::{revision, MAX_MARKDOWN_BYTES};
use crate::file_error::{FileError, FileResult};
use crate::windows_metadata::{check_supported, FileMetadata};
use std::fs::{File, OpenOptions, Permissions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::windows::{ffi::OsStrExt, fs::OpenOptionsExt, io::{AsRawHandle, FromRawHandle}};
use std::path::{Path, PathBuf};
use windows_sys::Win32::Storage::FileSystem::*;
use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;

pub struct LockedFile {
    file: File,
    path: PathBuf,
}

pub fn lock_parent(target: &Path) -> FileResult<File> {
    let parent = target.parent().ok_or_else(|| FileError::new("invalidPath", "缺少保存目录"))?;
    let guard = OpenOptions::new().access_mode(FILE_GENERIC_READ)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(parent).map_err(|error| FileError::io("无法锁定保存目录", error))?;
    let current = parent.canonicalize().map_err(|error| FileError::io("复核保存目录失败", error))?;
    if current != parent {
        return Err(FileError::new("conflict", "保存目录发生变化，请重新选择文件"));
    }
    Ok(guard)
}

impl LockedFile {
    pub fn open(path: &Path) -> FileResult<Self> {
        let file = OpenOptions::new().access_mode(FILE_GENERIC_READ | DELETE)
            .share_mode(FILE_SHARE_READ).custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path).map_err(|error| FileError::io("文件正被占用或无法锁定", error))?;
        let metadata = file.metadata().map_err(|error| FileError::io("读取锁定文件状态失败", error))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(FileError::new("conflict", "目标不再是原来的普通文件"));
        }
        Ok(Self { file, path: path.into() })
    }

    pub fn create(path: &Path, metadata: Option<&mut FileMetadata>) -> FileResult<Self> {
        let mut creation = metadata.as_ref().map(|value| value.security.clone());
        let attributes = creation.as_mut().map(|value| value.creation_attributes()).transpose()?;
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let access = FILE_GENERIC_READ | FILE_GENERIC_WRITE | DELETE | WRITE_DAC | WRITE_OWNER;
        let handle = unsafe { CreateFileW(wide.as_ptr(), access, FILE_SHARE_READ,
            attributes.as_ref().map_or(std::ptr::null(), |value| value), CREATE_NEW,
            FILE_ATTRIBUTE_NORMAL, std::ptr::null_mut()) };
        if handle == INVALID_HANDLE_VALUE {
            return Err(FileError::io("创建暂存文件失败", std::io::Error::last_os_error()));
        }
        let file = unsafe { File::from_raw_handle(handle) };
        if let Some(metadata) = metadata { metadata.security.apply_and_verify(&file)?; }
        check_supported(&file)?;
        Ok(Self { file, path: path.into() })
    }

    pub fn path(&self) -> &Path { &self.path }

    pub fn metadata(&self) -> FileResult<FileMetadata> { FileMetadata::read(&self.file) }

    pub fn preserve_attributes(&self, metadata: &FileMetadata) -> FileResult<()> {
        metadata.apply_basic(&self.file)
    }

    pub fn verify_metadata(&self, metadata: &mut FileMetadata) -> FileResult<()> {
        metadata.verify(&self.file)
    }

    pub fn permissions(&self) -> FileResult<Permissions> {
        self.file.metadata().map(|value| value.permissions())
            .map_err(|error| FileError::io("读取文件权限失败", error))
    }

    pub fn write_sync(&mut self, content: &str) -> FileResult<()> {
        self.file.write_all(content.as_bytes()).map_err(|error| FileError::io("写入暂存文件失败", error))?;
        self.sync()
    }

    pub fn sync(&self) -> FileResult<()> {
        self.file.sync_all().map_err(|error| FileError::io("同步文件失败", error))
    }

    pub fn content_revision(&mut self) -> FileResult<String> {
        self.file.seek(SeekFrom::Start(0)).map_err(|error| FileError::io("定位文件内容失败", error))?;
        let mut bytes = Vec::new();
        Read::by_ref(&mut self.file).take((MAX_MARKDOWN_BYTES + 1) as u64).read_to_end(&mut bytes)
            .map_err(|error| FileError::io("复核文件内容失败", error))?;
        if bytes.len() > MAX_MARKDOWN_BYTES {
            return Err(FileError::new("tooLarge", "Markdown 文件不能超过 2 MiB"));
        }
        Ok(revision(&bytes))
    }

    pub fn rename_to(&mut self, destination: &Path) -> FileResult<()> {
        rename_handle(&self.file, destination)?;
        self.path = destination.into();
        Ok(())
    }

    pub fn delete_on_close(&self) -> FileResult<()> {
        let disposition = FILE_DISPOSITION_INFO { DeleteFile: true };
        // Delete the owned object through its handle, not a path that could be replaced.
        let success = unsafe {
            SetFileInformationByHandle(self.file.as_raw_handle(), FileDispositionInfo,
                (&disposition as *const FILE_DISPOSITION_INFO).cast(), std::mem::size_of::<FILE_DISPOSITION_INFO>() as u32)
        };
        if success == 0 { return Err(FileError::io("清理恢复副本失败", std::io::Error::last_os_error())); }
        Ok(())
    }
}

pub(crate) fn rename_handle(file: &File, destination: &Path) -> FileResult<()> {
    let wide: Vec<u16> = destination.as_os_str().encode_wide().collect();
    let bytes = std::mem::size_of::<FILE_RENAME_INFO>() + wide.len() * std::mem::size_of::<u16>();
    let length = u32::try_from(bytes).map_err(|_| FileError::new("invalidPath", "文件路径过长"))?;
    let mut buffer = vec![0usize; bytes.div_ceil(std::mem::size_of::<usize>())];
    let info = buffer.as_mut_ptr().cast::<FILE_RENAME_INFO>();
    // Rename the held object without replacing any name that appeared during handoff.
    let success = unsafe {
        std::ptr::write(info, FILE_RENAME_INFO::default());
        (*info).Anonymous.ReplaceIfExists = false;
        (*info).FileNameLength = (wide.len() * std::mem::size_of::<u16>()) as u32;
        std::ptr::copy_nonoverlapping(wide.as_ptr(), std::ptr::addr_of_mut!((*info).FileName).cast::<u16>(), wide.len());
        SetFileInformationByHandle(file.as_raw_handle(), FileRenameInfo, info.cast(), length)
    };
    if success == 0 {
        let error = std::io::Error::last_os_error();
        let code = if matches!(error.raw_os_error(), Some(80 | 183)) { "conflict" } else { "io" };
        return Err(FileError::new(code, format!("无法提交文件，未覆盖已有目标：{error}")));
    }
    Ok(())
}
