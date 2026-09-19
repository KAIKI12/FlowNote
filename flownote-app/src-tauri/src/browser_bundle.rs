use crate::file_error::{FileError, FileResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const MAX_MARKDOWN_BYTES: usize = 2 * 1024 * 1024;
const MAX_HTML_BYTES: usize = 4 * 1024 * 1024;
const MAX_BLOCK_HTML_BYTES: usize = 2 * 1024 * 1024;
const MAX_EXPORT_BLOCKS: usize = 256;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrowserBundleBlock {
    pub id: String,
    pub html: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrowserBundleRequest {
    pub id: String,
    pub revision: String,
    pub folder_name: String,
    pub title: String,
    pub content: String,
    pub index_html: String,
    pub blocks: Vec<BrowserBundleBlock>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserBundleResult {
    pub path: String,
    pub name: String,
}

fn bounded(name: &str, value: &str, limit: usize) -> FileResult<()> {
    if value.len() > limit {
        return Err(FileError::new("tooLarge", format!("{name} 超过 Browser Bundle V1 大小上限")));
    }
    Ok(())
}

fn validate_request(request: &BrowserBundleRequest) -> FileResult<()> {
    crate::note_path::component_name(&request.folder_name)?;
    if request.folder_name.starts_with('.') {
        return Err(FileError::new("invalidPath", "Browser Bundle 目录名称不能以点开头"));
    }
    bounded("Markdown", &request.content, MAX_MARKDOWN_BYTES)?;
    bounded("Browser index.html", &request.index_html, MAX_HTML_BYTES)?;
    bounded("标题", &request.title, 4096)?;
    if request.blocks.len() > MAX_EXPORT_BLOCKS {
        return Err(FileError::new("tooLarge", "Browser Bundle HTML Block 数量超过上限"));
    }
    let mut ids = std::collections::BTreeSet::new();
    for block in &request.blocks {
        crate::note_format::validate_id(&block.id)?;
        bounded("HTML Block", &block.html, MAX_BLOCK_HTML_BYTES)?;
        if !ids.insert(block.id.as_str()) {
            return Err(FileError::new("invalidFormat", "Browser Bundle 包含重复 HTML Block ID"));
        }
    }
    Ok(())
}

#[cfg(windows)]
struct ExportDestination {
    _ancestors: Vec<crate::windows_note_io::Directory>,
    _parent: crate::windows_note_io::Directory,
    root: PathBuf,
    target: PathBuf,
    display_target: PathBuf,
}

#[cfg(windows)]
fn destination(parent: &Path, folder_name: &str) -> FileResult<ExportDestination> {
    crate::note_path::validate_absolute(parent)?;
    let ancestors = crate::windows_note_io::lock_ancestors(parent)?;
    let parent_guard = crate::windows_note_io::Directory::open(parent, false)?;
    let root = parent.canonicalize().map_err(|error| FileError::io("无法定位 Browser Bundle 导出父目录", error))?;
    let target = root.join(folder_name);
    let display_target = parent.join(folder_name);
    match std::fs::symlink_metadata(&target) {
        Ok(_) => return Err(FileError::new("conflict", "Browser Bundle 目标目录已经存在")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
        Err(error) => return Err(FileError::io("无法检查 Browser Bundle 目标目录", error)),
    }
    Ok(ExportDestination { _ancestors: ancestors, _parent: parent_guard, root, target, display_target })
}

#[cfg(windows)]
fn validate_relative(relative: &str) -> FileResult<()> {
    if relative.is_empty() || relative.contains(['\\', ':', '\0']) || Path::new(relative).is_absolute() {
        return Err(FileError::new("invalidPath", "Browser Bundle 资源路径无效"));
    }
    let parts: Vec<_> = relative.split('/').collect();
    if parts.iter().any(|part| part.is_empty() || *part == "." || *part == "..") {
        return Err(FileError::new("invalidPath", "Browser Bundle 资源路径不能包含相对跳转"));
    }
    for part in parts { crate::note_path::component_name(part)?; }
    Ok(())
}

#[cfg(windows)]
fn ensure_directory(root: &Path, relative: &str) -> FileResult<()> {
    if relative.is_empty() { return Ok(()); }
    validate_relative(relative)?;
    let mut current = root.to_path_buf();
    for part in relative.split('/') {
        current.push(part);
        match std::fs::symlink_metadata(&current) {
            Ok(_) => { let _ = crate::windows_note_io::Directory::open(&current, false)?; }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let _ = crate::windows_note_io::Directory::create(&current, None)?;
            },
            Err(error) => return Err(FileError::io("无法检查 Browser Bundle 目录", error)),
        }
    }
    Ok(())
}

#[cfg(windows)]
fn write_file(root: &Path, relative: &str, bytes: &[u8]) -> FileResult<()> {
    validate_relative(relative)?;
    let path = Path::new(relative);
    if let Some(parent) = path.parent().and_then(|value| value.to_str()) {
        ensure_directory(root, &parent.replace('\\', "/"))?;
    }
    crate::windows_note_io::create_file(&root.join(path), bytes, None)
}

#[cfg(windows)]
fn cleanup(path: &Path) {
    let _ = std::fs::remove_dir_all(path);
}

#[cfg(windows)]
pub(crate) fn export(
    source_path: &Path,
    binding_revision: &str,
    parent: &Path,
    request: BrowserBundleRequest,
) -> FileResult<BrowserBundleResult> {
    validate_request(&request)?;
    if binding_revision != request.revision {
        return Err(FileError::new("conflict", "Browser Bundle 请求基于过期 Note 版本"));
    }
    let _source_parents = crate::windows_note_io::lock_ancestors(source_path)?;
    let source = crate::note_path::selected_path(source_path, false)?;
    let directory = crate::windows_note_io::Directory::open(&source, false)?;
    let source_root = source.canonicalize().map_err(|error| FileError::io("无法定位源 Note 目录", error))?;
    let destination = destination(parent, &request.folder_name)?;
    if destination.target.starts_with(&source_root) {
        return Err(FileError::new("invalidPath", "Browser Bundle 不能导出到源 .note 目录内部"));
    }
    let tree = crate::windows_note_tree::NoteTree::read_shared(&directory)?;
    tree.unchanged(&request.revision)?;
    tree.ensure_copyable(&directory)?;
    let document = tree.document()?;
    if document.read_only {
        return Err(FileError::new("readonly", "只读或未知版本 Note 不能导出 Browser Bundle"));
    }

    let known: std::collections::BTreeSet<_> = document.mixed.blocks.iter().map(|block| block.id.as_str()).collect();
    for block in &request.blocks {
        if !known.contains(block.id.as_str()) {
            return Err(FileError::new("notFound", "Browser Bundle 引用了当前 Note 中不存在的 HTML Block"));
        }
    }

    let candidate = destination.root.join(format!(".{}.flownote-export-{}.tmp", request.folder_name, uuid::Uuid::new_v4()));
    let mut staged = crate::windows_note_io::Directory::create(&candidate, None)?;
    let materialized = (|| -> FileResult<()> {
        write_file(&candidate, "index.html", request.index_html.as_bytes())?;
        write_file(&candidate, "content.md", request.content.as_bytes())?;

        let files = tree.files();
        for (relative, bytes) in &files {
            if relative.starts_with("assets/") {
                write_file(&candidate, relative, bytes)?;
            }
        }
        for block in &request.blocks {
            write_file(&candidate, &format!("blocks/{}/index.html", block.id), block.html.as_bytes())?;
            let prefix = format!("blocks/{}/assets/", block.id);
            for (relative, bytes) in &files {
                if relative.starts_with(&prefix) {
                    write_file(&candidate, relative, bytes)?;
                }
            }
        }
        tree.unchanged(&request.revision)?;
        Ok(())
    })();

    if let Err(error) = materialized {
        drop(staged);
        cleanup(&candidate);
        return Err(error);
    }
    if let Err(error) = staged.rename_to(&destination.target) {
        drop(staged);
        cleanup(&candidate);
        return Err(error);
    }
    Ok(BrowserBundleResult { path: destination.display_target.to_string_lossy().into_owned(), name: request.folder_name })
}

#[cfg(not(windows))]
pub(crate) fn export(
    _: &Path,
    _: &str,
    _: &Path,
    _: BrowserBundleRequest,
) -> FileResult<BrowserBundleResult> {
    Err(FileError::new("unsupportedPlatform", "Browser Bundle 安全导出当前仅支持 Windows"))
}
