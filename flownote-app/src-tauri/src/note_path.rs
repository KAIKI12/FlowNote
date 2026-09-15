use crate::file_error::{FileError, FileResult};
use std::fs;
use std::path::{Component, Path, PathBuf};

pub(crate) const MAX_PATH_DEPTH: usize = 32;

pub(crate) fn component_name(name: &str) -> FileResult<()> {
    if name.is_empty() || name.ends_with(['.', ' ']) || name.chars().any(|character| character.is_control())
        || name.contains(['/', '\\', ':', '<', '>', '"', '|', '?', '*']) {
        return Err(FileError::new("invalidPath", "Note 文件或目录名称无效"));
    }
    let stem = name.split('.').next().unwrap_or_default().to_ascii_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"];
    let port = ["COM", "LPT"].iter().any(|prefix| stem.strip_prefix(prefix)
        .is_some_and(|suffix| ["1", "2", "3", "4", "5", "6", "7", "8", "9", "¹", "²", "³"].contains(&suffix)));
    if reserved.contains(&stem.as_str()) || port { return Err(FileError::new("invalidPath", "Note 名称使用了系统保留名称")); }
    Ok(())
}

pub(crate) fn validate_name(name: &str) -> FileResult<()> {
    component_name(name)?;
    if !name.to_ascii_lowercase().ends_with(".note") {
        return Err(FileError::new("invalidPath", "请选择 .note 目录名称"));
    }
    Ok(())
}

pub(crate) fn validate_absolute(path: &Path) -> FileResult<()> {
    if !path.is_absolute() { return Err(FileError::new("invalidPath", "请选择绝对路径的 .note 目录")); }
    for component in path.components() {
        match component {
            Component::Normal(name) => component_name(name.to_str().ok_or_else(|| FileError::new("invalidPath", "目录名称不是有效 Unicode"))?)?,
            Component::RootDir => {},
            Component::Prefix(prefix) => validate_prefix(prefix.kind())?,
            _ => return Err(FileError::new("invalidPath", "Note 路径不能包含相对跳转")),
        }
    }
    Ok(())
}

fn validate_prefix(prefix: std::path::Prefix<'_>) -> FileResult<()> {
    if matches!(prefix, std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_)) { return Ok(()); }
    Err(FileError::new("invalidPath", "当前仅支持本机磁盘的 Note 目录"))
}

pub(crate) fn validate_entry(path: &Path, directory: bool) -> FileResult<()> {
    let metadata = fs::symlink_metadata(path).map_err(|error| FileError::io("无法检查 Note 路径", error))?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(FileError::new("invalidPath", "Note 不允许符号链接、Junction 或其他重解析点"));
        }
    }
    if metadata.file_type().is_symlink() || metadata.is_dir() != directory || (!directory && !metadata.is_file()) {
        return Err(FileError::new("invalidPath", "Note 目录结构包含非普通文件或目录"));
    }
    Ok(())
}

pub(crate) fn selected_path(path: &Path, new: bool) -> FileResult<PathBuf> {
    validate_absolute(path)?;
    validate_name(path.file_name().and_then(|name| name.to_str()).unwrap_or_default())?;
    let parent = path.parent().ok_or_else(|| FileError::new("invalidPath", "Note 缺少父目录"))?;
    for ancestor in parent.ancestors() { validate_entry(ancestor, true)?; }
    let parent = parent.canonicalize().map_err(|error| FileError::io("无法定位 Note 父目录", error))?;
    let resolved = parent.join(path.file_name().ok_or_else(|| FileError::new("invalidPath", "Note 缺少名称"))?);
    if new {
        match fs::symlink_metadata(&resolved) {
            Ok(_) => return Err(FileError::new("conflict", "目标已经存在；请选择新的 .note 目录名称")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
            Err(error) => return Err(FileError::io("无法检查 Note 保存位置", error)),
        }
    } else { validate_entry(&resolved, true)?; }
    Ok(resolved)
}
