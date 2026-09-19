use crate::file_error::{FileError, FileResult};
use crate::note_files::{editable_asset_path, BlockAssetEdit, BlockCopyRequest};
use crate::note_format::{merge_compatible, validate_mixed, MixedNoteData};
use crate::windows_note_io::{create_file, Directory, NoteMetadata};
use crate::windows_note_tree::{NoteTree, MAX_PACKAGE_BYTES, MAX_PACKAGE_FILES};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

pub(crate) struct Draft {
    files: BTreeMap<String, Vec<u8>>,
    directories: BTreeSet<String>,
}

pub(crate) struct StagedNote {
    pub directory: Directory,
    pub tree: NoteTree,
}

fn format_error(message: impl Into<String>) -> FileError { FileError::new("invalidFormat", message) }

fn text(bytes: &[u8]) -> FileResult<&str> {
    std::str::from_utf8(bytes).map_err(|error| FileError::new("encoding", format!("Note 文件不是有效 UTF-8：{error}")))
}

fn existing_block(source: &NoteTree, block: &mut crate::note_format::HtmlBlockData) -> FileResult<()> {
    let prefix = format!("blocks/{}", block.id);
    if !source.entries.contains_key(&prefix) { return Ok(()); }
    let original = source.entries.get(&format!("{prefix}/original.html")).and_then(|entry| entry.bytes.as_deref())
        .ok_or_else(|| format_error("现有 Block 缺少 Original，必须先修复；当前内容未写入"))?;
    if text(original)? != block.original_html {
        return Err(FileError::new("originalChanged", "普通编辑不能更改已有 Block 的 Original"));
    }
    let config = source.entries.get(&format!("{prefix}/block.json")).and_then(|entry| entry.bytes.as_deref())
        .ok_or_else(|| format_error("现有 Block 缺少配置，必须先修复"))?;
    let config: Value = serde_json::from_str(text(config)?.trim_start_matches('\u{feff}'))
        .map_err(|error| format_error(format!("现有 Block 配置无效：{error}")))?;
    merge_compatible(&config, &mut block.config);
    Ok(())
}

fn json_bytes(value: &Value) -> FileResult<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|error| format_error(format!("无法序列化 Note 配置：{error}")))?;
    bytes.push(b'\n');
    if bytes.len() > crate::file_data::MAX_MARKDOWN_BYTES { return Err(FileError::new("tooLarge", "Note 配置不能超过 2 MiB")); }
    Ok(bytes)
}

fn put_json(files: &mut BTreeMap<String, Vec<u8>>, path: String, value: &Value) -> FileResult<()> {
    if let Some(previous) = files.get(&path) {
        let parsed: Value = serde_json::from_str(text(previous)?.trim_start_matches('\u{feff}'))
            .map_err(|error| format_error(format!("既有 JSON 配置无效：{error}")))?;
        if &parsed == value { return Ok(()); }
    }
    files.insert(path, json_bytes(value)?);
    Ok(())
}

fn add_asset(files: &mut BTreeMap<String, Vec<u8>>, directories: &mut BTreeSet<String>, path: String, bytes: Vec<u8>) -> FileResult<()> {
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() < 3 || parts[0] != "assets" || parts[1] != "images"
        || parts.iter().any(|part| part.is_empty() || *part == "." || *part == "..") {
        return Err(FileError::new("invalidPath", "迁移图片只能写入 assets/images/"));
    }
    for end in 1..parts.len() { directories.insert(parts[..end].join("/")); }
    if files.insert(path, bytes).is_some() { return Err(format_error("迁移图片路径重复")); }
    Ok(())
}

fn copy_private_assets(source: &NoteTree, files: &mut BTreeMap<String, Vec<u8>>, directories: &mut BTreeSet<String>,
    mixed: &MixedNoteData, copies: &[BlockCopyRequest]) -> FileResult<()> {
    let previous = source.document()?;
    let mut targets = BTreeSet::new();
    for copy in copies {
        crate::note_format::validate_id(&copy.source_id)?;
        crate::note_format::validate_id(&copy.target_id)?;
        if copy.source_id == copy.target_id || !targets.insert(copy.target_id.clone()) {
            return Err(format_error("Deep Copy 必须使用新的唯一 Block ID"));
        }
        if !previous.mixed.blocks.iter().any(|block| block.id == copy.source_id) {
            return Err(format_error("Deep Copy 源 Block 不是当前 Note 中已引用的 Block"));
        }
        let source_block = mixed.blocks.iter().find(|block| block.id == copy.source_id)
            .ok_or_else(|| format_error("Deep Copy 候选缺少源 Block"))?;
        let target_block = mixed.blocks.iter().find(|block| block.id == copy.target_id)
            .ok_or_else(|| format_error("Deep Copy 候选缺少目标 Block"))?;
        if source_block.html != target_block.html || source_block.original_html != target_block.original_html
            || source_block.config != target_block.config {
            return Err(format_error("Deep Copy 目标必须复制源 Block 的 Current / Original / config"));
        }
        let target_prefix = format!("blocks/{}", copy.target_id);
        if source.entries.keys().any(|path| path == &target_prefix || path.starts_with(&format!("{target_prefix}/"))) {
            return Err(format_error("Deep Copy 目标 Block ID 已存在于源 Note"));
        }
        let source_assets = format!("blocks/{}/assets", copy.source_id);
        let entries: Vec<_> = source.entries.iter().filter_map(|(path, entry)| {
            if path != &source_assets && !path.starts_with(&format!("{source_assets}/")) { return None; }
            let suffix = &path[source_assets.len()..];
            Some((format!("blocks/{}/assets{suffix}", copy.target_id), entry.bytes.clone()))
        }).collect();
        for (path, bytes) in entries {
            match bytes {
                Some(bytes) => { files.insert(path, bytes); }
                None => { directories.insert(path); }
            }
        }
    }
    Ok(())
}

fn apply_block_asset_edits(source: &NoteTree, files: &mut BTreeMap<String, Vec<u8>>, directories: &mut BTreeSet<String>,
    mixed: &MixedNoteData, edits: Vec<BlockAssetEdit>) -> FileResult<()> {
    if edits.is_empty() { return Ok(()); }
    let previous = source.document()?;
    let mut targets = BTreeSet::new();
    for edit in edits {
        crate::note_format::validate_id(&edit.block_id)?;
        editable_asset_path(&edit.path)?;
        if edit.content.len() > crate::file_data::MAX_MARKDOWN_BYTES {
            return Err(FileError::new("tooLarge", "Full HTML Editor 文本资源不能超过 2 MiB"));
        }
        if !previous.mixed.blocks.iter().any(|block| block.id == edit.block_id)
            || !mixed.blocks.iter().any(|block| block.id == edit.block_id) {
            return Err(FileError::new("notFound", "HTML Block 不存在或未被正文引用"));
        }
        let full = format!("blocks/{}/{}", edit.block_id, edit.path);
        if !targets.insert(full.clone()) {
            return Err(format_error("同一次保存不能重复编辑同一 Block 资源"));
        }
        let parts: Vec<_> = full.split('/').collect();
        for end in 1..parts.len() { directories.insert(parts[..end].join("/")); }
        files.insert(full, edit.content.into_bytes());
    }
    Ok(())
}


impl Draft {
    pub fn prepare(content: String, mut mixed: MixedNoteData, assets: Vec<(String, Vec<u8>)>, block_copies: Vec<BlockCopyRequest>,
        block_asset_edits: Vec<BlockAssetEdit>, source: Option<&NoteTree>, repair_source: bool) -> FileResult<Self> {
        let mut files = BTreeMap::new();
        let mut directories = BTreeSet::from(["blocks".to_string()]);
        if let Some(source) = source {
            if !assets.is_empty() { return Err(format_error("已有 Note 保存不能注入迁移图片")); }
            let previous = source.document()?;
            if previous.read_only && !repair_source {
                return Err(FileError::new("readOnly", previous.notice.unwrap_or_else(|| "Note 当前为只读".into())));
            }
            merge_compatible(&previous.mixed.metadata, &mut mixed.metadata);
            for block in &mut mixed.blocks { existing_block(source, block)?; }
            for (path, entry) in &source.entries {
                match &entry.bytes {
                    Some(bytes) => { files.insert(path.clone(), bytes.clone()); },
                    None => { directories.insert(path.clone()); },
                }
            }
            copy_private_assets(source, &mut files, &mut directories, &mixed, &block_copies)?;
            apply_block_asset_edits(source, &mut files, &mut directories, &mixed, block_asset_edits)?;
        } else if !block_copies.is_empty() || !block_asset_edits.is_empty() {
            return Err(format_error("Deep Copy / Block asset edit 需要已绑定的源 Note"));
        }
        for (path, bytes) in assets { add_asset(&mut files, &mut directories, path, bytes)?; }
        validate_mixed(&content, &mixed)?;
        for block in &mixed.blocks {
            let prefix = format!("blocks/{}", block.id);
            directories.insert(prefix.clone());
            files.insert(format!("{prefix}/index.html"), block.html.as_bytes().to_vec());
            files.insert(format!("{prefix}/original.html"), block.original_html.as_bytes().to_vec());
            put_json(&mut files, format!("{prefix}/block.json"), &block.config)?;
        }
        files.insert("content.md".into(), content.as_bytes().to_vec());
        put_json(&mut files, "note.json".into(), &mixed.metadata)?;
        if files.len() > MAX_PACKAGE_FILES || files.values().map(Vec::len).sum::<usize>() > MAX_PACKAGE_BYTES {
            return Err(FileError::new("tooLarge", "Note 超过 512 个文件或 32 MiB 总量上限"));
        }
        if directories.iter().any(|path| files.contains_key(path)) { return Err(format_error("Note 文件与目录发生名称冲突")); }
        Ok(Self { files, directories })
    }

    pub fn unchanged(&self, tree: &NoteTree) -> bool {
        tree.files().iter().all(|(path, bytes)| self.files.get(path).is_some_and(|value| value == bytes))
            && self.files.len() == tree.files().len()
            && tree.entries.values().filter(|entry| entry.bytes.is_none()).count() == self.directories.len()
    }

    fn file_metadata(&self, source: Option<&NoteTree>, path: &str) -> Option<NoteMetadata> {
        let entry = source?.entries.get(path)?;
        let mut metadata = entry.metadata.clone();
        if entry.bytes.as_ref() != self.files.get(path) { metadata.basic.LastWriteTime = 0; }
        Some(metadata)
    }

    fn write_files(&self, directory: &Directory, source: Option<&NoteTree>) -> FileResult<()> {
        for (path, bytes) in &self.files {
            if path == "content.md" || path == "note.json" { continue; }
            create_file(&directory.path.join(path), bytes, self.file_metadata(source, path).as_ref())?;
        }
        for path in ["note.json", "content.md"] {
            let bytes = self.files.get(path).ok_or_else(|| format_error("Note 缺少必要文件"))?;
            create_file(&directory.path.join(path), bytes, self.file_metadata(source, path).as_ref())?;
        }
        Ok(())
    }

    fn verify(&self, tree: &NoteTree, source: Option<&NoteTree>) -> FileResult<()> {
        let files = tree.files();
        if files.len() != self.files.len() || self.files.iter().any(|(path, bytes)| files.get(path) != Some(&bytes.as_slice())) {
            return Err(FileError::new("conflict", "候选 Note 内容在提交前发生变化"));
        }
        let directories: BTreeSet<_> = tree.entries.iter().filter(|(_, entry)| entry.bytes.is_none()).map(|(path, _)| path.clone()).collect();
        if directories != self.directories { return Err(FileError::new("conflict", "候选 Note 目录在提交前发生变化")); }
        let Some(source) = source else { return Ok(()); };
        if source.root_metadata.stamp(false) != tree.root_metadata.stamp(false) {
            return Err(FileError::new("unsupportedMetadata", "候选 Note 未完整保留根目录属性"));
        }
        for (path, entry) in &source.entries {
            let candidate = tree.entries.get(path).ok_or_else(|| format_error("候选 Note 遗漏原目录项目"))?;
            let unchanged = entry.bytes.as_ref() == self.files.get(path);
            if entry.metadata.stamp(unchanged) != candidate.metadata.stamp(unchanged) {
                return Err(FileError::new("unsupportedMetadata", format!("候选 Note 未完整保留存储属性：{path}")));
            }
        }
        Ok(())
    }

    pub fn stage(&self, path: &Path, source: Option<&NoteTree>) -> FileResult<StagedNote> {
        let directory = Directory::create(path, source.map(|tree| &tree.root_metadata))?;
        let result = self.write_stage(directory, source);
        result.map_err(|error| error.with_recovery(path))
    }

    fn write_stage(&self, directory: Directory, source: Option<&NoteTree>) -> FileResult<StagedNote> {
        let mut guards = Vec::new();
        for relative in &self.directories {
            let metadata = source.and_then(|tree| tree.entries.get(relative)).map(|entry| &entry.metadata);
            guards.push((relative, Directory::create(&directory.path.join(relative), metadata)?));
        }
        self.write_files(&directory, source)?;
        if let Some(source) = source {
            for (relative, guard) in &guards {
                if let Some(entry) = source.entries.get(*relative) { entry.metadata.apply_basic(&guard.file, true)?; }
            }
            source.root_metadata.apply_basic(&directory.file, true)?;
        }
        drop(guards);
        let tree = NoteTree::read(&directory)?;
        tree.ensure_copyable(&directory)?;
        self.verify(&tree, source)?;
        let document = tree.document()?;
        if document.read_only { return Err(format_error("候选 Note 校验未通过，只读内容不能提交")); }
        Ok(StagedNote { directory, tree })
    }
}
