#![allow(dead_code)]

use flownote::note_files::{NoteSaveAsRequest, NoteSaveRequest, NoteSnapshot};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

pub const FIRST: &str = "0199a111-0000-7000-8000-000000000001";
pub const SECOND: &str = "0199a111-0000-7000-8000-000000000002";

pub fn folder() -> PathBuf {
    let parent = std::env::temp_dir().join(format!("flownote-note-test-{}", Uuid::new_v4()));
    fs::create_dir(&parent).unwrap();
    parent
}

pub fn anchor(id: &str) -> String {
    format!("```flownote-html\n{{\"id\":\"{id}\"}}\n```\n")
}

pub fn draft() -> NoteSaveAsRequest {
    serde_json::from_value(json!({ "name": "中文.note", "content": format!("Markdown A\n\n{}\nMarkdown B\n", anchor(FIRST)),
        "mixed": { "metadata": { "formatVersion": 1, "type": "mixed", "title": "中文",
            "createdAt": "2026-09-14T23:00:00+08:00", "updatedAt": "2026-09-14T23:00:00+08:00",
            "futureCompatible": { "accent": "blue" } },
            "blocks": [{ "id": FIRST, "html": "<div>首次输入</div>", "originalHtml": "<div>首次输入</div>",
                "config": { "kind": "html", "inputKind": "fragment", "scriptPolicy": "off",
                    "viewport": { "heightPx": 480, "futureFit": true }, "futureCompatible": "retained" } }] } })).unwrap()
}

pub fn edit(file: &NoteSnapshot) -> NoteSaveRequest {
    NoteSaveRequest { id: file.id.clone(), revision: file.revision.clone(),
        content: file.content.clone(), mixed: file.mixed.clone() }
}

pub fn copy(file: &NoteSnapshot) -> NoteSaveAsRequest {
    NoteSaveAsRequest { name: "copy.note".into(), content: file.content.clone(),
        mixed: file.mixed.clone(), source_id: Some(file.id.clone()) }
}
