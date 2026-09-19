use crate::file_error::{FileError, FileResult};
use crate::note_format::{self, MixedNoteData};
use serde_json::Value;
use std::collections::BTreeMap;

fn line_text(segment: &str) -> &str {
    let line = segment.strip_suffix('\n').unwrap_or(segment);
    line.strip_suffix('\r').unwrap_or(line)
}

fn fence_start(line: &str) -> Option<(char, usize, &str)> {
    let trimmed = line.trim_start_matches(' ');
    if line.len() - trimmed.len() > 3 { return None; }
    let marker = trimmed.chars().next()?;
    if marker != '`' && marker != '~' { return None; }
    let width = trimmed.chars().take_while(|value| *value == marker).count();
    if width < 3 { return None; }
    Some((marker, width, trimmed[width..].trim()))
}

fn close_fence(marker: char, width: usize, line: &str) -> bool {
    fence_start(line).is_some_and(|(current, current_width, rest)| current == marker && current_width >= width && rest.is_empty())
}

fn anchor_id(body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;
    let object = value.as_object()?;
    if object.len() != 1 { return None; }
    let id = object.get("id")?.as_str()?.to_string();
    note_format::validate_id(&id).ok()?;
    Some(id)
}

pub(crate) fn remove_anchor(content: &str, target: &str) -> FileResult<String> {
    note_format::validate_id(target)?;
    let lines: Vec<_> = content.split_inclusive('\n').collect();
    let mut active: Option<(usize, char, usize, String)> = None;
    let mut remove: Option<(usize, usize)> = None;
    for (index, segment) in lines.iter().enumerate() {
        let line = line_text(segment);
        if let Some((start, marker, width, body)) = &mut active {
            if close_fence(*marker, *width, line) {
                if anchor_id(body).as_deref() == Some(target) {
                    if remove.is_some() { return Err(FileError::new("invalidFormat", "修复目标 Anchor 出现多次")); }
                    remove = Some((*start, index));
                }
                active = None;
            } else { body.push_str(line); body.push('\n'); }
            continue;
        }
        if let Some((marker, width, info)) = fence_start(line) {
            if info == "flownote-html" { active = Some((index, marker, width, String::new())); }
        }
    }
    let (start, end) = remove.ok_or_else(|| FileError::new("notFound", "未找到待修复的 FlowNote Anchor"))?;
    let output: String = lines.into_iter().enumerate().filter_map(|(index, line)|
        (!(start..=end).contains(&index)).then_some(line)).collect();
    note_format::anchor_ids(&output)?;
    Ok(output)
}

pub(crate) fn append_anchor(content: &str, target: &str) -> FileResult<String> {
    note_format::validate_id(target)?;
    if note_format::anchor_ids(content)?.iter().any(|id| id == target) {
        return Err(FileError::new("invalidFormat", "Orphan Block 已经被正文引用"));
    }
    let mut output = content.to_string();
    if !output.is_empty() && !output.ends_with('\n') { output.push('\n'); }
    if !output.is_empty() && !output.ends_with("\n\n") { output.push('\n'); }
    output.push_str(&format!("```flownote-html\n{{\"id\":\"{target}\"}}\n```\n"));
    Ok(output)
}

pub(crate) fn mixed_for_content(files: &BTreeMap<String, &[u8]>, content: &str) -> FileResult<MixedNoteData> {
    let metadata_bytes = files.get("note.json").ok_or_else(|| FileError::new("invalidFormat", "Note 缺少 note.json"))?;
    let metadata: Value = serde_json::from_slice(metadata_bytes)
        .map_err(|error| FileError::new("invalidFormat", format!("note.json 不是有效 JSON：{error}")))?;
    let ids = note_format::anchor_ids(content)?;
    let mut blocks = Vec::with_capacity(ids.len());
    for id in ids {
        let prefix = format!("blocks/{id}");
        let config: Value = serde_json::from_slice(files.get(&format!("{prefix}/block.json"))
            .ok_or_else(|| FileError::new("invalidFormat", format!("HTML Block Missing：{id}")))?)
            .map_err(|error| FileError::new("invalidFormat", format!("Block 配置无效：{error}")))?;
        let html = std::str::from_utf8(files.get(&format!("{prefix}/index.html"))
            .ok_or_else(|| FileError::new("invalidFormat", format!("HTML Block Missing：{id}")))?)
            .map_err(|error| FileError::new("encoding", format!("Current HTML 不是 UTF-8：{error}")))?.to_string();
        let original_html = std::str::from_utf8(files.get(&format!("{prefix}/original.html"))
            .ok_or_else(|| FileError::new("invalidFormat", format!("HTML Block Missing：{id}")))?)
            .map_err(|error| FileError::new("encoding", format!("Original HTML 不是 UTF-8：{error}")))?.to_string();
        blocks.push(note_format::HtmlBlockData { id, html, original_html, config });
    }
    let mixed = MixedNoteData { metadata, blocks };
    note_format::validate_mixed(content, &mixed)?;
    Ok(mixed)
}
