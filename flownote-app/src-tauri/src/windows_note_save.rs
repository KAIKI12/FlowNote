use crate::file_error::{FileError, FileResult};
use crate::note_format::{MixedNoteData, NoteDocument};
use crate::windows_note_io::{lock_ancestors, Directory};
use crate::windows_note_stage::Draft;
use crate::windows_note_tree::NoteTree;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub(crate) struct NoteWrite<'a> {
    pub target: &'a Path,
    pub source: Option<&'a Path>,
    pub expected: Option<&'a str>,
    pub content: String,
    pub mixed: MixedNoteData,
}

pub(crate) struct NoteReceipt {
    pub document: NoteDocument,
    pub revision: String,
    pub notice: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum SaveStage { Staged, SourceUnlocked, BackedUp, Committed }

struct Source { directory: Directory, tree: Option<NoteTree> }

struct Commit<'a> { target: &'a Path, expected: &'a str, replacing: bool }

fn recovery_name(target: &Path, kind: &str) -> FileResult<PathBuf> {
    let name = target.file_name().and_then(|name| name.to_str()).ok_or_else(|| FileError::new("invalidPath", "Note 缺少名称"))?;
    Ok(target.with_file_name(format!(".{name}.flownote-{kind}-{}.tmp", Uuid::new_v4())))
}

fn prepare_source(request: &NoteWrite<'_>) -> FileResult<Option<Source>> {
    let Some(path) = request.source else { return Ok(None); };
    let directory = Directory::open(path, path == request.target)?;
    let tree = NoteTree::read(&directory)?;
    tree.unchanged(request.expected.ok_or_else(|| FileError::new("conflict", "Note 缺少已读取的版本"))?)?;
    tree.ensure_copyable(&directory)?;
    Ok(Some(Source { directory, tree: Some(tree) }))
}

fn verify_source(source: &Source, expected: &str) -> FileResult<NoteTree> {
    let tree = NoteTree::read(&source.directory)?;
    tree.unchanged(expected)?;
    tree.ensure_copyable(&source.directory)?;
    Ok(tree)
}

fn restore(source: &mut Source, target: &Path, mut error: FileError) -> FileError {
    source.tree.take();
    if let Err(restore_error) = source.directory.rename_to(target) {
        error.message.push_str(&format!("；原目录未恢复到原路径：{}", restore_error.message));
    }
    error.with_original_recovery(&source.directory.path)
}

fn publish<F>(source: &mut Source, staged: &mut Directory, context: (&Commit<'_>, &mut F)) -> FileResult<String>
where F: FnMut(SaveStage, &Path) {
    let (commit, observer) = context;
    let target = commit.target;
    source.tree.take();
    observer(SaveStage::SourceUnlocked, target);
    source.directory.rename_to(&recovery_name(target, "original")?)?;
    observer(SaveStage::BackedUp, target);
    let verified = match verify_source(source, commit.expected) {
        Ok(tree) => tree,
        Err(error) => return Err(restore(source, target, error)),
    };
    if let Err(error) = staged.rename_to(target) {
        drop(verified);
        return Err(restore(source, target, error));
    }
    Ok(format!("已保留原 Note 恢复副本：{}", source.directory.path.display()))
}

fn acknowledge(staged: &Directory, expected: &str, notice: Option<String>) -> FileResult<NoteReceipt> {
    let tree = NoteTree::read(staged)?;
    tree.unchanged(expected)?;
    tree.ensure_copyable(staged)?;
    let document = tree.document()?;
    if document.read_only { return Err(FileError::new("conflict", "已提交 Note 的验证发生变化，请检查恢复副本")); }
    Ok(NoteReceipt { document, revision: tree.revision.clone(), notice })
}

pub(super) fn execute<F>(request: NoteWrite<'_>, mut observer: F) -> FileResult<NoteReceipt>
where F: FnMut(SaveStage, &Path) {
    let _target_parents = lock_ancestors(request.target)?;
    let _source_parents = request.source.map(lock_ancestors).transpose()?;
    let replacing = request.source == Some(request.target);
    if !replacing && request.source.is_some_and(|path| request.target.starts_with(path)) {
        return Err(FileError::new("invalidPath", "另存位置不能位于源 Note 目录内部"));
    }
    let mut source = prepare_source(&request)?;
    let commit = Commit { target: request.target, expected: request.expected.unwrap_or_default(), replacing };
    let source_tree = source.as_ref().and_then(|source| source.tree.as_ref());
    let draft = Draft::prepare(request.content, request.mixed, source_tree)?;
    if replacing && source_tree.is_some_and(|tree| draft.unchanged(tree)) {
        let tree = source_tree.ok_or_else(|| FileError::new("conflict", "Note 源状态缺失"))?;
        return Ok(NoteReceipt { document: tree.document()?, revision: tree.revision.clone(), notice: None });
    }
    let candidate = recovery_name(request.target, "current")?;
    let staged = draft.stage(&candidate, source_tree).map_err(|error| error.with_recovery(&candidate))?;
    let mut directory = staged.directory;
    let expected = staged.tree.revision.clone();
    observer(SaveStage::Staged, request.target);
    drop(staged.tree);
    let result = commit_candidate(&mut directory, &mut source, (&commit, &mut observer))
        .and_then(|notice| { observer(SaveStage::Committed, request.target); acknowledge(&directory, &expected, notice) });
    result.map_err(|mut error| {
        if let Some(source) = source.as_ref().filter(|source| source.directory.path != request.target) {
            error = error.with_original_recovery(&source.directory.path);
        }
        error.with_recovery(&directory.path)
    })
}

fn commit_candidate<F>(staged: &mut Directory, source: &mut Option<Source>, context: (&Commit<'_>, &mut F)) -> FileResult<Option<String>>
where F: FnMut(SaveStage, &Path) {
    let (commit, observer) = context;
    if let Some(source) = source {
        if commit.replacing { return publish(source, staged, (commit, observer)).map(Some); }
        let _verified = verify_source(source, commit.expected)?;
        staged.rename_to(commit.target)?;
        return Ok(None);
    }
    staged.rename_to(commit.target)?;
    Ok(None)
}

pub(crate) fn save(request: NoteWrite<'_>) -> FileResult<NoteReceipt> { execute(request, |_, _| {}) }

#[cfg(test)]
#[path = "windows_note_save_tests.rs"]
mod tests;
