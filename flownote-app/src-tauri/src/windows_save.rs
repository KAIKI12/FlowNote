use crate::atomic_save::{AtomicSave, SaveReceipt};
use crate::file_data::{current_revision, revision, validate_content};
use crate::file_error::{FileError, FileResult};
use crate::windows_file::{lock_parent, LockedFile};
use crate::windows_metadata::FileMetadata;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum SaveStage { Staged, BackedUp, Committed }

fn recovery_name(target: &Path, kind: &str) -> FileResult<PathBuf> {
    let name = target.file_name().ok_or_else(|| FileError::new("invalidPath", "缺少文件名"))?;
    Ok(target.with_file_name(format!(".{}.flownote-{kind}-{}.tmp", name.to_string_lossy(), Uuid::new_v4())))
}

fn verify_original(original: &mut LockedFile, expected: &str) -> FileResult<()> {
    if original.content_revision()? != expected {
        return Err(FileError::new("conflict", "磁盘内容已在外部修改，当前内容未覆盖磁盘"));
    }
    Ok(())
}

fn unchanged(request: &AtomicSave<'_>) -> FileResult<SaveReceipt> {
    let mut original = LockedFile::open(request.path)?;
    verify_original(&mut original, request.expected.unwrap_or_default())?;
    Ok(SaveReceipt { read_only: original.permissions()?.readonly(), notice: None })
}

fn restore(original: &mut LockedFile, target: &Path, mut error: FileError) -> FileError {
    if let Err(restore_error) = original.rename_to(target) {
        error.message.push_str(&format!("；原路径未恢复：{}", restore_error.message));
    }
    error.with_original_recovery(original.path())
}

fn replace_existing<F>(prepared: &mut (LockedFile, FileMetadata), staged: &mut LockedFile, observer: &mut F) -> FileResult<SaveReceipt>
where F: FnMut(SaveStage, &Path) {
    let (original, metadata) = prepared;
    let target = original.path().to_path_buf();
    let backup = recovery_name(&target, "original")?;
    original.rename_to(&backup)?;
    observer(SaveStage::BackedUp, &target);
    // Stream creation and hard links are not covered by the data sharing lock.
    // Recheck the original object after removing its public name, before publishing.
    if let Err(error) = original.verify_metadata(metadata) {
        return Err(restore(original, &target, error));
    }
    if let Err(error) = staged.rename_to(&target) {
        return Err(restore(original, &target, error));
    }
    observer(SaveStage::Committed, &target);
    staged.sync().map_err(|error| error.with_original_recovery(original.path()))?;
    let cleanup = original.verify_metadata(metadata).and_then(|()| original.delete_on_close());
    let notice = cleanup.err().map(|error|
        format!("内容已保存；原文副本未清理，请保留 {}。复核信息：{}", original.path().display(), error.message));
    Ok(SaveReceipt { read_only: false, notice })
}

fn prepare_original(request: &AtomicSave<'_>) -> FileResult<Option<(LockedFile, FileMetadata)>> {
    let Some(expected) = request.expected else { return Ok(None); };
    let mut original = LockedFile::open(request.path)?;
    verify_original(&mut original, expected)?;
    let metadata = original.metadata()?;
    Ok(Some((original, metadata)))
}

pub(super) fn execute<F>(request: AtomicSave<'_>, mut observer: F) -> FileResult<SaveReceipt>
where F: FnMut(SaveStage, &Path) {
    validate_content(request.content)?;
    let _directory = lock_parent(request.path)?;
    if request.expected == Some(revision(request.content.as_bytes()).as_str()) { return unchanged(&request); }
    if current_revision(request.path)?.as_deref() != request.expected {
        return Err(FileError::new("conflict", "磁盘文件已被修改或删除，当前内容未覆盖磁盘"));
    }
    let mut original = prepare_original(&request)?;
    let temporary = recovery_name(request.path, "current")?;
    let mut staged = LockedFile::create(&temporary, original.as_mut().map(|(_, metadata)| metadata))?;
    let result = (|| {
        staged.write_sync(request.content)?;
        if let Some((_, metadata)) = &original { staged.preserve_attributes(metadata)?; }
        observer(SaveStage::Staged, request.path);
        if let Some(original) = &mut original { return replace_existing(original, &mut staged, &mut observer); }
        staged.rename_to(request.path)?;
        observer(SaveStage::Committed, request.path);
        staged.sync()?;
        Ok(SaveReceipt { read_only: false, notice: None })
    })();
    result.map_err(|error| error.with_recovery(staged.path()))
}

pub fn save(request: AtomicSave<'_>) -> FileResult<SaveReceipt> {
    execute(request, |_, _| {})
}

#[cfg(test)]
#[path = "windows_save_tests.rs"]
mod tests;
