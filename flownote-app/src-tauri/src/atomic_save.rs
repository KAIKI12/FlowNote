use crate::file_error::FileResult;
use std::path::Path;

pub struct AtomicSave<'a> {
    pub path: &'a Path,
    pub content: &'a str,
    pub expected: Option<&'a str>,
}

pub struct SaveReceipt {
    pub read_only: bool,
    pub notice: Option<String>,
}

#[cfg(windows)]
pub fn save(request: AtomicSave<'_>) -> FileResult<SaveReceipt> {
    crate::windows_save::save(request)
}

#[cfg(not(windows))]
pub fn save(_request: AtomicSave<'_>) -> FileResult<SaveReceipt> {
    Err(crate::file_error::FileError::new("unsupported", "此版本的受保护原位保存仅支持 Windows 桌面版"))
}
