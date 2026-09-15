use crate::file_error::{FileError, FileResult};
use crate::note_format::{self, NoteDocument};
use crate::note_path::{component_name, validate_entry, MAX_PATH_DEPTH};
use crate::windows_note_io::{read_file, Directory, NoteMetadata};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File};

pub(crate) const MAX_PACKAGE_BYTES: usize = 32 * 1024 * 1024;
pub(crate) const MAX_PACKAGE_FILES: usize = 512;
const MAX_PACKAGE_ENTRIES: usize = 1024;

pub(crate) struct TreeEntry {
    pub file: File,
    pub metadata: NoteMetadata,
    pub bytes: Option<Vec<u8>>,
}

pub(crate) struct NoteTree {
    pub root_metadata: NoteMetadata,
    pub entries: BTreeMap<String, TreeEntry>,
    pub revision: String,
}

fn names(root: &Directory, relative: &str) -> FileResult<Vec<String>> {
    let children = fs::read_dir(root.path.join(relative)).map_err(|error| FileError::io("无法列出 Note 目录", error))?;
    let mut names = Vec::new();
    for child in children {
        let child = child.map_err(|error| FileError::io("读取 Note 目录项目失败", error))?;
        let name = child.file_name().into_string().map_err(|_| FileError::new("invalidPath", "Note 路径不是有效 Unicode"))?;
        component_name(&name)?;
        names.push(name);
        if names.len() > MAX_PACKAGE_ENTRIES { return Err(FileError::new("tooLarge", "Note 目录项目数量超过上限")); }
    }
    names.sort();
    Ok(names)
}

fn read_entry(root: &Directory, relative: &str, budget: usize) -> FileResult<TreeEntry> {
    let path = root.path.join(relative);
    let metadata = fs::symlink_metadata(&path).map_err(|error| FileError::io("读取 Note 文件状态失败", error))?;
    validate_entry(&path, metadata.is_dir())?;
    if metadata.is_dir() {
        let directory = Directory::open(&path, false)?;
        return Ok(TreeEntry { metadata: NoteMetadata::read(&directory.file)?, file: directory.file, bytes: None });
    }
    let (file, bytes, metadata) = read_file(&path, budget)?;
    Ok(TreeEntry { file, bytes: Some(bytes), metadata })
}

fn validate_tree(tree: &NoteTree, root: &Directory, directories: &BTreeMap<String, Vec<String>>) -> FileResult<()> {
    for (relative, children) in directories {
        if &names(root, relative)? != children { return Err(FileError::new("conflict", "Note 的目录项目在读取期间发生变化")); }
    }
    if NoteMetadata::read(&root.file)?.stamp(true) != tree.root_metadata.stamp(true) {
        return Err(FileError::new("conflict", "Note 目录权限在读取期间发生变化"));
    }
    for entry in tree.entries.values() {
        if NoteMetadata::read(&entry.file)?.stamp(true) != entry.metadata.stamp(true) {
            return Err(FileError::new("conflict", "Note 存储属性在读取期间发生变化"));
        }
    }
    Ok(())
}

fn digest_piece(digest: &mut Sha256, bytes: &[u8]) {
    digest.update((bytes.len() as u64).to_le_bytes());
    digest.update(bytes);
}

impl NoteTree {
    pub fn read(root: &Directory) -> FileResult<Self> {
        let root_metadata = NoteMetadata::read(&root.file)?;
        let mut tree = Self { root_metadata, entries: BTreeMap::new(), revision: String::new() };
        let mut pending = vec![String::new()];
        let mut directories = BTreeMap::new();
        let (mut bytes, mut files) = (0, 0);
        while let Some(parent) = pending.pop() {
            let children = names(root, &parent)?;
            for name in &children {
                let relative = if parent.is_empty() { name.clone() } else { format!("{parent}/{name}") };
                if relative.split('/').count() > MAX_PATH_DEPTH || tree.entries.len() >= MAX_PACKAGE_ENTRIES {
                    return Err(FileError::new("tooLarge", "Note 目录层级或项目数量超过上限"));
                }
                let entry = read_entry(root, &relative, MAX_PACKAGE_BYTES - bytes)?;
                match &entry.bytes {
                    Some(data) => { bytes += data.len(); files += 1; },
                    None => pending.push(relative.clone()),
                }
                if files > MAX_PACKAGE_FILES { return Err(FileError::new("tooLarge", "Note 文件数量超过 512")); }
                tree.entries.insert(relative, entry);
            }
            directories.insert(parent, children);
        }
        validate_tree(&tree, root, &directories)?;
        tree.revision = tree.calculate_revision();
        Ok(tree)
    }

    fn calculate_revision(&self) -> String {
        let mut digest = Sha256::new();
        digest_piece(&mut digest, &self.root_metadata.stamp(true));
        for (path, entry) in &self.entries {
            digest_piece(&mut digest, path.as_bytes());
            digest_piece(&mut digest, &entry.metadata.stamp(true));
            digest_piece(&mut digest, entry.bytes.as_deref().unwrap_or_default());
        }
        format!("{:x}", digest.finalize())
    }

    pub fn files(&self) -> BTreeMap<String, &[u8]> {
        self.entries.iter().filter_map(|(name, entry)| entry.bytes.as_deref().map(|bytes| (name.clone(), bytes))).collect()
    }

    pub fn document(&self) -> FileResult<NoteDocument> {
        let read_only = self.root_metadata.read_only() || self.entries.iter().any(|(path, entry)|
            entry.metadata.read_only() && (path == "note.json" || path == "content.md" || path.starts_with("blocks/")));
        note_format::parse(&self.files(), read_only)
    }

    pub fn ensure_copyable(&self, root: &Directory) -> FileResult<()> {
        self.root_metadata.ensure_copyable(&root.file)?;
        for entry in self.entries.values() { entry.metadata.ensure_copyable(&entry.file)?; }
        Ok(())
    }

    pub fn unchanged(&self, expected: &str) -> FileResult<()> {
        if self.revision != expected { return Err(FileError::new("conflict", "Note 已被外部修改，当前内容未覆盖磁盘")); }
        Ok(())
    }
}
