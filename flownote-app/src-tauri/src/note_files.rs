use crate::file_error::{FileError, FileResult};
use crate::note_format::{validate_mixed, NoteDocument};
use crate::note_path::{selected_path, validate_name};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub use crate::note_format::{HtmlBlockData, MixedNoteData};

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
    pub mixed: MixedNoteData,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NoteSaveRequest {
    pub id: String,
    pub revision: String,
    pub content: String,
    pub mixed: MixedNoteData,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteSaveAsRequest {
    pub name: String,
    pub content: String,
    pub mixed: MixedNoteData,
    pub source_id: Option<String>,
}

#[derive(Clone)]
struct Binding { path: PathBuf, revision: String }

#[derive(Default)]
pub struct NoteStore { bindings: HashMap<String, Binding> }

fn snapshot(id: &str, path: &Path, data: (NoteDocument, String, Option<String>)) -> FileResult<NoteSnapshot> {
    let (document, revision, notice) = data;
    let name = path.file_name().and_then(|value| value.to_str()).ok_or_else(|| FileError::new("invalidPath", "Note 缺少有效名称"))?;
    Ok(NoteSnapshot { id: id.into(), path: path.to_string_lossy().into_owned(), name: name.into(),
        content: document.content, mixed: document.mixed, revision, read_only: document.read_only,
        notice: notice.or(document.notice) })
}

pub fn validate_save_as(request: &NoteSaveAsRequest) -> FileResult<()> {
    validate_name(&request.name)?;
    validate_mixed(&request.content, &request.mixed)?;
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

    pub fn save(&mut self, request: NoteSaveRequest) -> FileResult<NoteSnapshot> {
        let binding = self.binding(&request.id)?;
        let receipt = crate::windows_note_save::save(crate::windows_note_save::NoteWrite {
            target: &binding.path, source: Some(&binding.path), expected: Some(&request.revision),
            content: request.content, mixed: request.mixed,
        })?;
        let file = snapshot(&request.id, &binding.path, (receipt.document, receipt.revision, receipt.notice))?;
        Ok(self.remember(file))
    }

    pub fn save_as_selected(&mut self, path: &Path, request: NoteSaveAsRequest) -> FileResult<NoteSnapshot> {
        validate_save_as(&request)?;
        let _parents = crate::windows_note_io::lock_ancestors(path)?;
        let path = selected_path(path, true)?;
        let source = request.source_id.as_deref().map(|id| self.binding(id)).transpose()?;
        let receipt = crate::windows_note_save::save(crate::windows_note_save::NoteWrite {
            target: &path, source: source.as_ref().map(|source| source.path.as_path()),
            expected: source.as_ref().map(|source| source.revision.as_str()), content: request.content, mixed: request.mixed,
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
    pub fn save(&mut self, _: NoteSaveRequest) -> FileResult<NoteSnapshot> { unsupported() }
    pub fn save_as_selected(&mut self, _: &Path, _: NoteSaveAsRequest) -> FileResult<NoteSnapshot> { unsupported() }
}

#[cfg(not(windows))]
fn unsupported<T>() -> FileResult<T> { Err(FileError::new("unsupportedPlatform", "此版本的 Note 安全文件服务仅支持 Windows")) }
