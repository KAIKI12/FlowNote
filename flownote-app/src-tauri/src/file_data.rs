use crate::file_error::{FileError, FileResult};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

pub const MAX_MARKDOWN_BYTES: usize = 2 * 1024 * 1024;

pub fn validate_extension(path: &Path) -> FileResult<()> {
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("");
    if !path.is_absolute() || !["md", "markdown"].contains(&extension.to_ascii_lowercase().as_str()) {
        return Err(FileError::new("invalidPath", "请选择绝对路径的 .md 或 .markdown 文件"));
    }
    Ok(())
}

pub fn canonical_file(path: &Path) -> FileResult<PathBuf> {
    validate_extension(path)?;
    let resolved = path.canonicalize().map_err(|error| FileError::io("无法定位文件", error))?;
    validate_extension(&resolved)?;
    Ok(resolved)
}

pub fn save_location(path: &Path) -> FileResult<PathBuf> {
    validate_extension(path)?;
    match fs::symlink_metadata(path) {
        Ok(_) => canonical_file(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let parent = path.parent().ok_or_else(|| FileError::new("invalidPath", "缺少保存目录"))?;
            let parent = parent.canonicalize().map_err(|error| FileError::io("无法定位保存目录", error))?;
            let name = path.file_name().ok_or_else(|| FileError::new("invalidPath", "缺少文件名"))?;
            Ok(parent.join(name))
        }
        Err(error) => Err(FileError::io("无法检查保存位置", error)),
    }
}

pub fn validate_content(content: &str) -> FileResult<()> {
    if content.len() > MAX_MARKDOWN_BYTES {
        return Err(FileError::new("tooLarge", "Markdown 文件不能超过 2 MiB"));
    }
    if content.contains('\0') {
        return Err(FileError::new("encoding", "Markdown 包含 NUL 字节，不能作为文本文件打开或保存"));
    }
    Ok(())
}

pub fn read_bytes(path: &Path) -> FileResult<Vec<u8>> {
    let file = File::open(path).map_err(|error| FileError::io("读取文件失败", error))?;
    let before = file.metadata().map_err(|error| FileError::io("读取文件属性失败", error))?;
    if !before.is_file() {
        return Err(FileError::new("invalidPath", "请选择普通 Markdown 文件"));
    }
    let mut bytes = Vec::new();
    let mut limited = file.take((MAX_MARKDOWN_BYTES + 1) as u64);
    limited.read_to_end(&mut bytes).map_err(|error| FileError::io("读取文件内容失败", error))?;
    if bytes.len() > MAX_MARKDOWN_BYTES {
        return Err(FileError::new("tooLarge", "Markdown 文件不能超过 2 MiB"));
    }
    let after = limited.get_ref().metadata().map_err(|error| FileError::io("复核文件属性失败", error))?;
    let before_modified = before.modified().map_err(|error| FileError::io("读取修改时间失败", error))?;
    let after_modified = after.modified().map_err(|error| FileError::io("复核修改时间失败", error))?;
    if before.len() != after.len() || before_modified != after_modified {
        return Err(FileError::new("conflict", "文件在读取期间发生变化，请重新打开"));
    }
    Ok(bytes)
}

pub fn read_text(path: &Path) -> FileResult<String> {
    let bytes = read_bytes(path)?;
    let content = String::from_utf8(bytes)
        .map_err(|error| FileError::new("encoding", format!("文件不是有效 UTF-8：{error}")))?;
    validate_content(&content)?;
    Ok(content)
}

pub fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn current_revision(path: &Path) -> FileResult<Option<String>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err(FileError::new("conflict", "文件路径已被替换为链接，请重新选择文件"))
        }
        Ok(_) => Ok(Some(revision(&read_bytes(path)?))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(FileError::io("检查文件版本失败", error)),
    }
}
