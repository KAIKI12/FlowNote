# FlowNote Full HTML Editor V1 Slice

**Date:** 2026-09-19
**Scope:** Full HTML Editor without changing Note Format v1.

## Product boundary

Full Editor is not a second HTML representation. It edits the existing Block Current HTML (`index.html`) plus Block-private textual files under `blocks/<id>/assets/**`.

- Current HTML: editable.
- Original HTML: visible but read-only.
- Text assets: CSS / JS / MJS / JSON / TXT are editable.
- Binary assets: listed, readable by preview, but not text-editable in V1.
- Asset delete/rename is deferred; V1 supports edit and create for textual assets.
- Full Editor Save is atomic: Current HTML + all changed textual assets commit in one Note save.
- Full Editor drafts stay local until Save. A failed save must not mutate the live Note or disk.
- Existing Quick Edit behavior remains the fast path.
- No new disk fields or directories; `formatVersion` remains 1.

## Native protocol

Add `note_list_assets` for the selected Block and extend normal `note_save` with optional `blockAssetEdits`.

Each edit contains:
- `blockId`
- `path` relative to the Block, beginning with `assets/`
- UTF-8 `content`

Validation:
- active referenced Block only,
- no absolute paths, backslashes, empty / dot / parent segments,
- editable extensions only: css/js/mjs/json/txt,
- max 2 MiB per edited text asset,
- duplicate edit targets rejected,
- stale revision / external modification rejected by existing Note atomic-save path,
- Original remains protected by existing `originalChanged` invariant.

## UI

Full-screen editor dialog:
- Header: HTML Full Editor, Block status, Cancel / Save.
- Left rail: Current HTML, Original HTML, Assets list, New text asset.
- Center: source editor for selected text file.
- Right: live sandbox preview using unsaved Current HTML and unsaved text-asset drafts.
- Original and binary assets are read-only.
- Open Full Editor from Quick Edit; no disabled placeholder.

## Acceptance

- Existing HTML Quick Edit remains unchanged for normal use.
- Current + CSS/JS can be edited and saved atomically.
- New text asset can be created under assets/.
- Cancel and failed save preserve the previously live Note.
- Reopen reads saved Current / assets; Original unchanged.
- Path escape / binary-edit attempts fail.
