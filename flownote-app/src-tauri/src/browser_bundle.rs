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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarkdownExportRequest {
    pub id: String,
    pub revision: String,
    pub folder_name: String,
    pub markdown_name: String,
    pub content: String,
    pub blocks: Vec<BrowserBundleBlock>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownExportResult {
    pub path: String,
    pub name: String,
    pub markdown_path: String,
}

fn bounded(name: &str, value: &str, limit: usize) -> FileResult<()> {
    if value.len() > limit {
        return Err(FileError::new("tooLarge", format!("{name} 超过导出大小上限")));
    }
    Ok(())
}

fn validate_folder_name(value: &str) -> FileResult<()> {
    crate::note_path::component_name(value)?;
    if value.starts_with('.') {
        return Err(FileError::new("invalidPath", "导出目录名称不能以点开头"));
    }
    Ok(())
}

fn validate_blocks(blocks: &[BrowserBundleBlock]) -> FileResult<()> {
    if blocks.len() > MAX_EXPORT_BLOCKS {
        return Err(FileError::new("tooLarge", "导出 HTML Block 数量超过上限"));
    }
    let mut ids = std::collections::BTreeSet::new();
    for block in blocks {
        crate::note_format::validate_id(&block.id)?;
        bounded("HTML Block", &block.html, MAX_BLOCK_HTML_BYTES)?;
        if !ids.insert(block.id.as_str()) {
            return Err(FileError::new("invalidFormat", "导出包含重复 HTML Block ID"));
        }
    }
    Ok(())
}

fn validate_browser_request(request: &BrowserBundleRequest) -> FileResult<()> {
    validate_folder_name(&request.folder_name)?;
    bounded("Markdown", &request.content, MAX_MARKDOWN_BYTES)?;
    bounded("Browser index.html", &request.index_html, MAX_HTML_BYTES)?;
    bounded("标题", &request.title, 4096)?;
    validate_blocks(&request.blocks)
}

fn validate_markdown_request(request: &MarkdownExportRequest) -> FileResult<()> {
    validate_folder_name(&request.folder_name)?;
    crate::note_path::component_name(&request.markdown_name)?;
    let lower = request.markdown_name.to_ascii_lowercase();
    if !lower.ends_with(".md") && !lower.ends_with(".markdown") {
        return Err(FileError::new("invalidPath", "Markdown 导出文件必须使用 .md 或 .markdown 后缀"));
    }
    bounded("Markdown", &request.content, MAX_MARKDOWN_BYTES)?;
    validate_blocks(&request.blocks)
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
    let root = parent.canonicalize().map_err(|error| FileError::io("无法定位导出父目录", error))?;
    let target = root.join(folder_name);
    let display_target = parent.join(folder_name);
    match std::fs::symlink_metadata(&target) {
        Ok(_) => return Err(FileError::new("conflict", "导出目标目录已经存在")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
        Err(error) => return Err(FileError::io("无法检查导出目标目录", error)),
    }
    Ok(ExportDestination { _ancestors: ancestors, _parent: parent_guard, root, target, display_target })
}

#[cfg(windows)]
fn validate_relative(relative: &str) -> FileResult<()> {
    if relative.is_empty() || relative.contains(['\\', ':', '\0']) || Path::new(relative).is_absolute() {
        return Err(FileError::new("invalidPath", "导出资源路径无效"));
    }
    let parts: Vec<_> = relative.split('/').collect();
    if parts.iter().any(|part| part.is_empty() || *part == "." || *part == "..") {
        return Err(FileError::new("invalidPath", "导出资源路径不能包含相对跳转"));
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
            Err(error) => return Err(FileError::io("无法检查导出目录", error)),
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
struct MaterializedExport<'a> {
    folder_name: &'a str,
    revision: &'a str,
    markdown_name: &'a str,
    content: &'a str,
    index_html: Option<&'a str>,
    blocks: &'a [BrowserBundleBlock],
}

#[cfg(windows)]
fn materialize(
    source_path: &Path,
    binding_revision: &str,
    parent: &Path,
    export: MaterializedExport<'_>,
) -> FileResult<PathBuf> {
    if binding_revision != export.revision {
        return Err(FileError::new("conflict", "导出请求基于过期 Note 版本"));
    }

    let _source_parents = crate::windows_note_io::lock_ancestors(source_path)?;
    let source = crate::note_path::selected_path(source_path, false)?;
    let directory = crate::windows_note_io::Directory::open(&source, false)?;
    let source_root = source.canonicalize().map_err(|error| FileError::io("无法定位源 Note 目录", error))?;
    let destination = destination(parent, export.folder_name)?;
    if destination.target.starts_with(&source_root) {
        return Err(FileError::new("invalidPath", "不能导出到源 .note 目录内部"));
    }

    let tree = crate::windows_note_tree::NoteTree::read_shared(&directory)?;
    tree.unchanged(export.revision)?;
    tree.ensure_copyable(&directory)?;
    let document = tree.document()?;
    if document.read_only {
        return Err(FileError::new("readonly", "只读或未知版本 Note 不能导出"));
    }

    let known: std::collections::BTreeSet<_> = document.mixed.blocks.iter().map(|block| block.id.as_str()).collect();
    for block in export.blocks {
        if !known.contains(block.id.as_str()) {
            return Err(FileError::new("notFound", "导出引用了当前 Note 中不存在的 HTML Block"));
        }
    }

    let candidate = destination.root.join(format!(
        ".{}.flownote-export-{}.tmp",
        export.folder_name,
        uuid::Uuid::new_v4()
    ));
    let mut staged = crate::windows_note_io::Directory::create(&candidate, None)?;
    let materialized = (|| -> FileResult<()> {
        write_file(&candidate, export.markdown_name, export.content.as_bytes())?;
        if let Some(index_html) = export.index_html {
            write_file(&candidate, "index.html", index_html.as_bytes())?;
        }

        let files = tree.files();
        for (relative, bytes) in &files {
            if relative.starts_with("assets/") {
                write_file(&candidate, relative, bytes)?;
            }
        }
        for block in export.blocks {
            write_file(&candidate, &format!("blocks/{}/index.html", block.id), block.html.as_bytes())?;
            let prefix = format!("blocks/{}/assets/", block.id);
            for (relative, bytes) in &files {
                if relative.starts_with(&prefix) {
                    write_file(&candidate, relative, bytes)?;
                }
            }
        }
        tree.unchanged(export.revision)?;
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
    Ok(destination.display_target)
}

#[cfg(windows)]
pub(crate) fn export(
    source_path: &Path,
    binding_revision: &str,
    parent: &Path,
    request: BrowserBundleRequest,
) -> FileResult<BrowserBundleResult> {
    validate_browser_request(&request)?;
    let path = materialize(source_path, binding_revision, parent, MaterializedExport {
        folder_name: &request.folder_name,
        revision: &request.revision,
        markdown_name: "content.md",
        content: &request.content,
        index_html: Some(&request.index_html),
        blocks: &request.blocks,
    })?;
    Ok(BrowserBundleResult { path: path.to_string_lossy().into_owned(), name: request.folder_name })
}

#[cfg(windows)]
pub(crate) fn export_markdown(
    source_path: &Path,
    binding_revision: &str,
    parent: &Path,
    request: MarkdownExportRequest,
) -> FileResult<MarkdownExportResult> {
    validate_markdown_request(&request)?;
    let path = materialize(source_path, binding_revision, parent, MaterializedExport {
        folder_name: &request.folder_name,
        revision: &request.revision,
        markdown_name: &request.markdown_name,
        content: &request.content,
        index_html: None,
        blocks: &request.blocks,
    })?;
    let markdown_path = path.join(&request.markdown_name);
    Ok(MarkdownExportResult {
        path: path.to_string_lossy().into_owned(),
        name: request.folder_name,
        markdown_path: markdown_path.to_string_lossy().into_owned(),
    })
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

#[cfg(not(windows))]
pub(crate) fn export_markdown(
    _: &Path,
    _: &str,
    _: &Path,
    _: MarkdownExportRequest,
) -> FileResult<MarkdownExportResult> {
    Err(FileError::new("unsupportedPlatform", "Mixed Markdown 安全导出当前仅支持 Windows"))
}
