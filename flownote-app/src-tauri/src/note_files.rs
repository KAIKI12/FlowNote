use crate::file_error::{FileError, FileResult};
use crate::note_format::{validate_mixed, NoteDiagnostic, NoteDocument};
use crate::note_path::{selected_path, validate_name};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub use crate::note_format::{HtmlBlockData, MixedNoteData};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockAsset {
    pub path: String,
    pub mime: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockAssetInfo {
    pub path: String,
    pub mime: String,
    pub size: usize,
    pub editable: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BlockAssetEdit {
    pub block_id: String,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteProbe {
    pub revision: String,
    pub changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSnapshot {
    pub id: String,
    pub path: String,
    pub name: String,
    pub content: String,
    pub revision: String,
    pub read_only: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<NoteDiagnostic>,
    pub mixed: MixedNoteData,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BlockCopyRequest {
    pub source_id: String,
    pub target_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NoteSaveRequest {
    pub id: String,
    pub revision: String,
    pub content: String,
    pub mixed: MixedNoteData,
    #[serde(default, rename = "blockCopies")]
    pub block_copies: Vec<BlockCopyRequest>,
    #[serde(default, rename = "blockAssetEdits")]
    pub block_asset_edits: Vec<BlockAssetEdit>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NoteAssetData {
    pub path: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteSaveAsRequest {
    pub name: String,
    pub content: String,
    pub mixed: MixedNoteData,
    pub source_id: Option<String>,
    #[serde(default)]
    pub assets: Vec<NoteAssetData>,
}

#[derive(Clone)]
struct Binding { path: PathBuf, revision: String }

#[derive(Default)]
pub struct NoteStore { bindings: HashMap<String, Binding> }

fn asset_mime(path: &str) -> &'static str {
    match Path::new(path).extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()) {
        Some(ext) if ext == "css" => "text/css",
        Some(ext) if ext == "js" || ext == "mjs" => "text/javascript",
        Some(ext) if ext == "json" => "application/json",
        Some(ext) if ext == "txt" => "text/plain",
        Some(ext) if ext == "png" => "image/png",
        Some(ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg",
        Some(ext) if ext == "gif" => "image/gif",
        Some(ext) if ext == "webp" => "image/webp",
        Some(ext) if ext == "svg" => "image/svg+xml",
        Some(ext) if ext == "woff" => "font/woff",
        Some(ext) if ext == "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

pub(crate) fn validate_asset_path(path: &str) -> FileResult<()> {
    if path.is_empty() || path.contains('\\') || path.contains(':') || path.contains('\0') || Path::new(path).is_absolute() {
        return Err(FileError::new("invalidPath", "Block 资源必须使用 assets/ 下的安全相对路径"));
    }
    let parts: Vec<_> = path.split('/').collect();
    if parts.first() != Some(&"assets") || parts.len() < 2
        || parts.iter().any(|part| part.is_empty() || *part == "." || *part == "..") {
        return Err(FileError::new("invalidPath", "Block 资源只能位于 assets/ 目录内"));
    }
    Ok(())
}

pub(crate) fn editable_asset_path(path: &str) -> FileResult<()> {
    validate_asset_path(path)?;
    let extension = Path::new(path).extension().and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase()).unwrap_or_default();
    if !["css", "js", "mjs", "json", "txt"].contains(&extension.as_str()) {
        return Err(FileError::new("unsupported", "Full HTML Editor 只允许编辑 CSS / JS / MJS / JSON / TXT 文本资源"));
    }
    Ok(())
}

fn validate_note_image_path(path: &str) -> FileResult<()> {
    if path.is_empty() || path.contains('\\') || Path::new(path).is_absolute() {
        return Err(FileError::new("invalidPath", "Note 图片必须使用 assets/images/ 下的相对路径"));
    }
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() < 3 || parts[0] != "assets" || parts[1] != "images"
        || parts.iter().any(|part| part.is_empty() || *part == "." || *part == "..") {
        return Err(FileError::new("invalidPath", "Note 图片只能位于 assets/images/"));
    }
    Ok(())
}

fn snapshot(id: &str, path: &Path, data: (NoteDocument, String, Option<String>)) -> FileResult<NoteSnapshot> {
    let (document, revision, notice) = data;
    let name = path.file_name().and_then(|value| value.to_str()).ok_or_else(|| FileError::new("invalidPath", "Note 缺少有效名称"))?;
    Ok(NoteSnapshot { id: id.into(), path: path.to_string_lossy().into_owned(), name: name.into(),
        content: document.content, mixed: document.mixed, revision, read_only: document.read_only,
        diagnostics: document.diagnostics, notice: notice.or(document.notice) })
}

fn validate_note_asset(asset: &NoteAssetData) -> FileResult<()> {
    if asset.path.is_empty() || asset.path.contains('\\') || Path::new(&asset.path).is_absolute() {
        return Err(FileError::new("invalidPath", "Note 迁移资源必须使用 assets/images/ 下的相对路径"));
    }
    let parts: Vec<_> = asset.path.split('/').collect();
    if parts.len() < 3 || parts[0] != "assets" || parts[1] != "images"
        || parts.iter().any(|part| part.is_empty() || *part == "." || *part == "..") {
        return Err(FileError::new("invalidPath", "Note 迁移资源只能位于 assets/images/"));
    }
    Ok(())
}

pub fn validate_save_as(request: &NoteSaveAsRequest) -> FileResult<()> {
    validate_name(&request.name)?;
    validate_mixed(&request.content, &request.mixed)?;
    if request.source_id.is_some() && !request.assets.is_empty() {
        return Err(FileError::new("invalidFormat", "已有 Mixed Note 另存时不能注入迁移资源"));
    }
    for asset in &request.assets { validate_note_asset(asset)?; }
    Ok(())
}

impl NoteStore {
    fn binding(&self, id: &str) -> FileResult<Binding> {
        self.bindings.get(id).cloned().ok_or_else(|| FileError::new("closed", "Note 尚未选择或已经关闭"))
    }

    fn remember(&mut self, file: NoteSnapshot) -> NoteSnapshot {
        self.bindings.insert(file.id.clone(), Binding { path: PathBuf::from(&file.path), revision: file.revision.clone() });
        file
    }

    pub fn close(&mut self, id: &str) -> FileResult<()> {
        self.bindings.remove(id);
        Ok(())
    }
}

#[cfg(windows)]
impl NoteStore {
    pub fn open_selected(&mut self, path: &Path) -> FileResult<NoteSnapshot> {
        let _parents = crate::windows_note_io::lock_ancestors(path)?;
        let path = selected_path(path, false)?;
        let id = format!("note:{}", Uuid::new_v4());
        let file = self.read_snapshot(&id, &path)?;
        Ok(self.remember(file))
    }

    fn read_snapshot(&self, id: &str, path: &Path) -> FileResult<NoteSnapshot> {
        let directory = crate::windows_note_io::Directory::open(path, false)?;
        let tree = crate::windows_note_tree::NoteTree::read(&directory)?;
        snapshot(id, path, (tree.document()?, tree.revision.clone(), None))
    }

    pub fn reload(&mut self, id: &str) -> FileResult<NoteSnapshot> {
        let binding = self.binding(id)?;
        let _parents = crate::windows_note_io::lock_ancestors(&binding.path)?;
        let file = self.read_snapshot(id, &selected_path(&binding.path, false)?)?;
        Ok(self.remember(file))
    }

    pub fn probe(&self, id: &str) -> FileResult<NoteProbe> {
        let binding = self.binding(id)?;
        let _parents = crate::windows_note_io::lock_ancestors(&binding.path)?;
        let path = selected_path(&binding.path, false)?;
        let directory = crate::windows_note_io::Directory::open(&path, false)?;
        let tree = crate::windows_note_tree::NoteTree::read_shared(&directory)?;
        Ok(NoteProbe { changed: tree.revision != binding.revision, revision: tree.revision })
    }

    pub fn read_asset(&self, id: &str, block_id: &str, relative: &str) -> FileResult<BlockAsset> {
        crate::note_format::validate_id(block_id)?;
        validate_asset_path(relative)?;
        let binding = self.binding(id)?;
        let _parents = crate::windows_note_io::lock_ancestors(&binding.path)?;
        let path = selected_path(&binding.path, false)?;
        let directory = crate::windows_note_io::Directory::open(&path, false)?;
        let tree = crate::windows_note_tree::NoteTree::read_shared(&directory)?;
        tree.unchanged(&binding.revision)?;
        let document = tree.document()?;
        if !document.mixed.blocks.iter().any(|block| block.id == block_id) {
            return Err(FileError::new("notFound", "HTML Block 不存在或未被正文引用"));
        }
        let asset_path = format!("blocks/{block_id}/{relative}");
        let files = tree.files();
        let bytes = files.get(&asset_path).ok_or_else(|| FileError::new("notFound", "Block 资源不存在"))?;
        Ok(BlockAsset { path: relative.into(), mime: asset_mime(relative).into(), bytes: bytes.to_vec() })
    }

    pub fn list_assets(&self, id: &str, block_id: &str) -> FileResult<Vec<BlockAssetInfo>> {
        crate::note_format::validate_id(block_id)?;
        let binding = self.binding(id)?;
        let _parents = crate::windows_note_io::lock_ancestors(&binding.path)?;
        let path = selected_path(&binding.path, false)?;
        let directory = crate::windows_note_io::Directory::open(&path, false)?;
        let tree = crate::windows_note_tree::NoteTree::read_shared(&directory)?;
        tree.unchanged(&binding.revision)?;
        let document = tree.document()?;
        if !document.mixed.blocks.iter().any(|block| block.id == block_id) {
            return Err(FileError::new("notFound", "HTML Block 不存在或未被正文引用"));
        }
        let prefix = format!("blocks/{block_id}/assets/");
        let mut result = Vec::new();
        for (path, bytes) in tree.files().iter() {
            let Some(suffix) = path.strip_prefix(&prefix) else { continue; };
            if suffix.is_empty() { continue; }
            let relative = format!("assets/{suffix}");
            result.push(BlockAssetInfo {
                path: relative.clone(),
                mime: asset_mime(&relative).into(),
                size: bytes.len(),
                editable: editable_asset_path(&relative).is_ok(),
            });
        }
        result.sort_by(|left, right| left.path.cmp(&right.path));
        Ok(result)
    }

    pub fn read_note_asset(&self, id: &str, relative: &str) -> FileResult<BlockAsset> {
        validate_note_image_path(relative)?;
        let binding = self.binding(id)?;
        let _parents = crate::windows_note_io::lock_ancestors(&binding.path)?;
        let path = selected_path(&binding.path, false)?;
        let directory = crate::windows_note_io::Directory::open(&path, false)?;
        let tree = crate::windows_note_tree::NoteTree::read_shared(&directory)?;
        tree.unchanged(&binding.revision)?;
        let files = tree.files();
        let bytes = files.get(relative).ok_or_else(|| FileError::new("notFound", "Note 图片不存在"))?;
        Ok(BlockAsset { path: relative.into(), mime: asset_mime(relative).into(), bytes: bytes.to_vec() })
    }

    fn repair_snapshot(&mut self, id: &str, expected: &str, block_id: &str, kind: &str, restore: bool) -> FileResult<NoteSnapshot> {
        crate::note_format::validate_id(block_id)?;
        let binding = self.binding(id)?;
        if binding.revision != expected { return Err(FileError::new("conflict", "修复请求基于过期 Note 版本")); }
        let _parents = crate::windows_note_io::lock_ancestors(&binding.path)?;
        let path = selected_path(&binding.path, false)?;
        let directory = crate::windows_note_io::Directory::open(&path, false)?;
        let tree = crate::windows_note_tree::NoteTree::read(&directory)?;
        tree.unchanged(expected)?;
        let document = tree.document()?;
        if !document.diagnostics.iter().any(|item| item.kind == kind && item.block_id.as_deref() == Some(block_id)) {
            return Err(FileError::new("invalidFormat", "当前 Note 不包含请求修复的诊断项"));
        }
        let content = if restore { crate::note_repair::append_anchor(&document.content, block_id)? }
            else { crate::note_repair::remove_anchor(&document.content, block_id)? };
        let files = tree.files();
        let mixed = crate::note_repair::mixed_for_content(&files, &content)?;
        drop(files);
        drop(tree);
        drop(directory);
        let receipt = crate::windows_note_save::save(crate::windows_note_save::NoteWrite {
            target: &binding.path, source: Some(&binding.path), expected: Some(expected), content, mixed,
            assets: Vec::new(), block_copies: Vec::new(), block_asset_edits: Vec::new(), repair_source: true,
        })?;
        let file = snapshot(id, &binding.path, (receipt.document, receipt.revision, receipt.notice))?;
        Ok(self.remember(file))
    }

    pub fn repair_remove_reference(&mut self, id: &str, expected: &str, block_id: &str) -> FileResult<NoteSnapshot> {
        self.repair_snapshot(id, expected, block_id, "missingBlock", false)
    }

    pub fn repair_restore_orphan(&mut self, id: &str, expected: &str, block_id: &str) -> FileResult<NoteSnapshot> {
        self.repair_snapshot(id, expected, block_id, "orphanBlock", true)
    }

    pub fn save(&mut self, request: NoteSaveRequest) -> FileResult<NoteSnapshot> {
        let binding = self.binding(&request.id)?;
        let receipt = crate::windows_note_save::save(crate::windows_note_save::NoteWrite {
            target: &binding.path, source: Some(&binding.path), expected: Some(&request.revision),
            content: request.content, mixed: request.mixed, assets: Vec::new(), block_copies: request.block_copies,
            block_asset_edits: request.block_asset_edits, repair_source: false,
        })?;
        let file = snapshot(&request.id, &binding.path, (receipt.document, receipt.revision, receipt.notice))?;
        Ok(self.remember(file))
    }

    pub fn export_browser_bundle_selected(
        &self,
        parent: &Path,
        request: crate::browser_bundle::BrowserBundleRequest,
    ) -> FileResult<crate::browser_bundle::BrowserBundleResult> {
        let binding = self.binding(&request.id)?;
        crate::browser_bundle::export(&binding.path, &binding.revision, parent, request)
    }

    pub fn export_markdown_selected(
        &self,
        parent: &Path,
        request: crate::browser_bundle::MarkdownExportRequest,
    ) -> FileResult<crate::browser_bundle::MarkdownExportResult> {
        let binding = self.binding(&request.id)?;
        crate::browser_bundle::export_markdown(&binding.path, &binding.revision, parent, request)
    }

    pub fn save_as_selected(&mut self, path: &Path, request: NoteSaveAsRequest) -> FileResult<NoteSnapshot> {
        validate_save_as(&request)?;
        let _parents = crate::windows_note_io::lock_ancestors(path)?;
        let path = selected_path(path, true)?;
        let source = request.source_id.as_deref().map(|id| self.binding(id)).transpose()?;
        let assets = request.assets.into_iter().map(|asset| (asset.path, asset.bytes)).collect();
        let receipt = crate::windows_note_save::save(crate::windows_note_save::NoteWrite {
            target: &path, source: source.as_ref().map(|source| source.path.as_path()),
            expected: source.as_ref().map(|source| source.revision.as_str()), content: request.content, mixed: request.mixed, assets,
            block_copies: Vec::new(), block_asset_edits: Vec::new(), repair_source: false,
        })?;
        let id = format!("note:{}", Uuid::new_v4());
        let file = snapshot(&id, &path, (receipt.document, receipt.revision, receipt.notice))?;
        Ok(self.remember(file))
    }
}

#[cfg(not(windows))]
impl NoteStore {
    pub fn open_selected(&mut self, _: &Path) -> FileResult<NoteSnapshot> { unsupported() }
    pub fn reload(&mut self, _: &str) -> FileResult<NoteSnapshot> { unsupported() }
    pub fn probe(&self, _: &str) -> FileResult<NoteProbe> { unsupported() }
    pub fn repair_remove_reference(&mut self, _: &str, _: &str, _: &str) -> FileResult<NoteSnapshot> { unsupported() }
    pub fn repair_restore_orphan(&mut self, _: &str, _: &str, _: &str) -> FileResult<NoteSnapshot> { unsupported() }
    pub fn read_asset(&self, _: &str, _: &str, _: &str) -> FileResult<BlockAsset> { unsupported() }
    pub fn list_assets(&self, _: &str, _: &str) -> FileResult<Vec<BlockAssetInfo>> { unsupported() }
    pub fn read_note_asset(&self, _: &str, _: &str) -> FileResult<BlockAsset> { unsupported() }
    pub fn export_browser_bundle_selected(&self, _: &Path, _: crate::browser_bundle::BrowserBundleRequest)
        -> FileResult<crate::browser_bundle::BrowserBundleResult> { unsupported() }
    pub fn export_markdown_selected(&self, _: &Path, _: crate::browser_bundle::MarkdownExportRequest)
        -> FileResult<crate::browser_bundle::MarkdownExportResult> { unsupported() }
    pub fn save(&mut self, _: NoteSaveRequest) -> FileResult<NoteSnapshot> { unsupported() }
    pub fn save_as_selected(&mut self, _: &Path, _: NoteSaveAsRequest) -> FileResult<NoteSnapshot> { unsupported() }
    pub fn close(&mut self, _: &str) -> FileResult<()> { unsupported() }
}

#[cfg(not(windows))]
fn unsupported<T>() -> FileResult<T> { Err(FileError::new("unsupportedPlatform", "此版本的 Note 安全文件服务仅支持 Windows")) }
