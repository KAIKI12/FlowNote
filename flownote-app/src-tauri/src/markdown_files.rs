use crate::atomic_save::{self, AtomicSave, SaveReceipt};
use crate::file_data::{canonical_file, current_revision, read_text, revision, save_location};
use crate::file_error::{FileError, FileResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub use crate::file_data::MAX_MARKDOWN_BYTES;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSnapshot {
    pub id: String,
    pub path: String,
    pub name: String,
    pub content: String,
    pub revision: String,
    pub read_only: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SaveRequest {
    pub id: String,
    pub revision: String,
    pub content: String,
}

#[derive(Default)]
pub struct FileStore {
    paths: HashMap<String, PathBuf>,
}

fn snapshot(id: &str, path: &Path) -> FileResult<FileSnapshot> {
    let content = read_text(path)?;
    let metadata = fs::metadata(path).map_err(|error| FileError::io("读取文件状态失败", error))?;
    let name = path.file_name().ok_or_else(|| FileError::new("invalidPath", "缺少文件名"))?;
    Ok(FileSnapshot { id: id.into(), path: path.to_string_lossy().into_owned(),
        name: name.to_string_lossy().into_owned(), revision: revision(content.as_bytes()), content,
        read_only: metadata.permissions().readonly(), notice: None })
}

fn committed_snapshot(id: &str, path: &Path, data: (&str, SaveReceipt)) -> FileResult<FileSnapshot> {
    let name = path.file_name().ok_or_else(|| FileError::new("invalidPath", "缺少文件名"))?;
    Ok(FileSnapshot { id: id.into(), path: path.to_string_lossy().into_owned(),
        name: name.to_string_lossy().into_owned(), content: data.0.into(), revision: revision(data.0.as_bytes()),
        read_only: data.1.read_only, notice: data.1.notice })
}

impl FileStore {
    pub fn open_selected(&mut self, path: &Path) -> FileResult<FileSnapshot> {
        let path = canonical_file(path)?;
        let id = Uuid::new_v4().to_string();
        let file = snapshot(&id, &path)?;
        self.paths.insert(id, path);
        Ok(file)
    }

    fn bound_path(&self, id: &str) -> FileResult<PathBuf> {
        let path = self.paths.get(id).ok_or_else(|| FileError::new("closed", "文件尚未选择或已经关闭"))?;
        match path.canonicalize() {
            Ok(current) if &current != path => Err(FileError::new("conflict", "文件路径已经变化，请重新选择文件")),
            Ok(_) => Ok(path.clone()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(path.clone()),
            Err(error) => Err(FileError::io("无法检查当前文件位置", error)),
        }
    }

    pub fn reload(&self, id: &str) -> FileResult<FileSnapshot> {
        snapshot(id, &self.bound_path(id)?)
    }

    pub fn save(&mut self, request: SaveRequest) -> FileResult<FileSnapshot> {
        let path = self.bound_path(&request.id)?;
        let receipt = atomic_save::save(AtomicSave { path: &path, content: &request.content, expected: Some(&request.revision) })?;
        // This receipt describes the committed version, not a later external edit.
        committed_snapshot(&request.id, &path, (&request.content, receipt))
    }

    pub fn save_as_selected(&mut self, path: &Path, content: &str) -> FileResult<FileSnapshot> {
        let path = save_location(path)?;
        let expected = current_revision(&path)?;
        let receipt = atomic_save::save(AtomicSave { path: &path, content, expected: expected.as_deref() })?;
        let id = Uuid::new_v4().to_string();
        let file = committed_snapshot(&id, &path, (content, receipt))?;
        self.paths.insert(id, path);
        Ok(file)
    }

    pub fn close(&mut self, id: &str) -> FileResult<()> {
        self.paths.remove(id);
        Ok(())
    }
}
