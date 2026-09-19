# FlowNote Slice 3 Reliability Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: use the TDD workflow for every behavior change; execute in the current approved workspace without checkout/stash/worktree and without automatic commits.

**Goal:** Implement external `.note` change handling, recoverable Missing/Orphan diagnostics and repair, and same-note HTML Block Deep Copy with independent private resources.

**Architecture:** Keep all disk authority behind existing Note capability IDs. External change detection uses a non-mutating full-tree revision probe; clean state reloads, dirty state conflicts, and IME defers then rechecks. Recovery uses structured diagnostics plus explicit revision-checked repair commands. Deep Copy is a staged Note save with runtime-only `blockCopies` instructions that copy private assets inside the candidate transaction.

**Tech Stack:** Tauri 2 / Rust, React 18 + TypeScript, Milkdown/ProseMirror, Zustand, existing NoteStore/NoteTree staged directory save, Node/JSDOM test harness, real-disk Rust driver.

---

## Task 1: Baseline and capability-bound external revision probe

**Files:**
- Modify: `src-tauri/src/note_files.rs`
- Modify: `src-tauri/src/note_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tests/note_files.rs`
- Modify: `src-tauri/tests/note_commands.rs`
- Modify: `src-tauri/tests/file_driver.rs`
- Modify: `src/note/nativeNotePort.ts`

**RED tests:**

1. Bound Note unchanged -> `changed=false`, same revision.
2. External `content.md` edit -> `changed=true`.
3. External private asset edit -> `changed=true`.
4. Probe does not mutate the binding revision: a subsequent save with the old revision still conflicts.
5. Forged/closed capability fails.
6. Secondary/untrusted window cannot probe.

**GREEN:** add `NoteProbe { revision, changed }`, `NoteStore::probe(id)`, `note_probe` command and `NativeNotePort.probe(id)`.

The probe must read the full NoteTree and compare against the bound revision without calling `remember`.

## Task 2: Frontend external-change state machine

**Files:**
- Modify: `src/note/useMixedNoteFiles.ts`
- Modify: `src/app/App.tsx`
- Modify: `tests/appEditing.spec.tsx`
- Modify: `tests/file-disk.spec.tsx`

**RED tests:**

- clean Mixed Note + probe changed -> reload/apply exactly once and show subtle disk-update notice;
- dirty Mixed Note + probe changed -> do not reload, keep local source, expose conflict;
- composing + probe changed -> no reload/conflict until composition ends;
- composition end + unchanged local -> re-probe/reload;
- composition end + local dirty -> conflict;
- conflict `Reload Disk` explicitly discards local edits and applies disk snapshot;
- conflict `Save Local As...` calls Mixed Note Save As and never overwrites the externally changed original;
- closing/replacing Note stops the probe loop.

**GREEN:** add a coarse interval (about 1 second in production; injectable/short in tests) while a writable desktop Mixed Note is bound. Never probe while a Note operation is already busy.

Conflict state belongs to the Mixed Note file/session hook, not the editor parser.

## Task 3: Structured diagnostics for Missing / Orphan / malformed states

**Files:**
- Modify: `src-tauri/src/note_format.rs`
- Modify: `src-tauri/src/windows_note_tree.rs`
- Modify: `src-tauri/src/note_files.rs`
- Modify: `src/note/nativeNotePort.ts`
- Modify: `src/note/mixedTypes.ts` if shared frontend types are needed
- Test: `src-tauri/tests/note_files.rs`
- Test: `tests/appEditing.spec.tsx`

**RED tests:**

- invalid anchor keeps source and reports `invalidAnchor`;
- duplicate anchor keeps source and reports `duplicateAnchor` with ID when known;
- missing referenced Block reports `missingBlock` with ID;
- orphan Block directory reports `orphanBlock` without making the Note writable-dangerous or deleting it;
- unknown future format remains the existing read-only safe mode;
- diagnostics never duplicate body/order into metadata.

**GREEN:** add `NoteDiagnostic { kind, blockId?, message }` to the runtime snapshot only. It is not persisted in `note.json`.

The parser may continue to use read-only safe mode for invalid/missing source, but must preserve enough structured information for explicit repair.

## Task 4: Explicit repair commands

**Files:**
- Modify: `src-tauri/src/note_files.rs`
- Modify: `src-tauri/src/note_commands.rs`
- Modify: `src-tauri/src/windows_note_save.rs` / `windows_note_stage.rs` only if required by staged repair
- Modify: `src/note/nativeNotePort.ts`
- Modify: `src/note/useMixedNoteFiles.ts`
- Modify: `src/app/App.tsx`
- Test: `src-tauri/tests/note_files.rs`, `src-tauri/tests/note_commands.rs`, `tests/appEditing.spec.tsx`, `tests/file-disk.spec.tsx`

**Repair A — Remove Missing Reference**

- requires bound capability + expected revision + exact Block ID;
- backend re-reads current tree and proves that ID is currently reported missing;
- removes only that exact FlowNote anchor fence from `content.md`;
- validates remaining Note and stages/commits transactionally;
- never fabricates Block files.

**Repair B — Restore Orphan**

- requires bound capability + expected revision + exact orphan Block ID;
- backend proves the Block directory is a valid orphan;
- appends one canonical anchor to `content.md`;
- validates and commits while preserving Current/Original/assets;
- never modifies the orphan Block contents.

**RED:** stale revision, wrong diagnostic kind/ID and invalid Block directory all refuse without disk changes.

## Task 5: Backend Deep Copy transaction

**Files:**
- Modify: `src-tauri/src/note_files.rs`
- Modify: `src-tauri/src/windows_note_save.rs`
- Modify: `src-tauri/src/windows_note_stage.rs`
- Modify: `src-tauri/tests/note_files.rs`
- Modify: `src-tauri/src/windows_note_save_tests.rs`

Add runtime-only request data:

```text
blockCopies: [
  { sourceId, targetId }
]
```

**RED:**

- valid A->B copies every `blocks/A/assets/**` file and directory to B;
- target critical files come from candidate Mixed data, not byte-copy of A critical files;
- target ID already exists -> reject;
- source ID missing/not referenced -> reject;
- target not present in candidate Mixed -> reject;
- traversal/invalid IDs -> reject;
- copy failure leaves original Note unchanged and recovery candidate visible through existing error mechanism.

**GREEN:** extend Draft preparation after source-tree copy and before final `validate_mixed`/stage verification. Only private `assets/**` paths are copied.

## Task 6: Frontend Deep Copy UX

**Files:**
- Modify: `src/editor/editorTypes.ts`
- Modify: `src/editor/editorRuntime.ts`
- Modify: `src/editor/plugins/htmlBlock/htmlBlockContext.ts`
- Modify: `src/editor/plugins/htmlBlock/HtmlBlockView.tsx`
- Modify: `src/editor/FlowNoteEditor.tsx`
- Modify: `src/note/useMixedNoteFiles.ts`
- Modify: `src/app/App.tsx`
- Test: `tests/html.spec.tsx`, `tests/appEditing.spec.tsx`

**RED:**

- `previewDuplicateHtmlBlock(sourceId, targetId)` inserts B immediately after A without mutating live editor;
- toolbar `复制 HTML Block` duplicates the selected Block even if another selection state exists;
- clone has new ID but same Current/Original/config values;
- save request includes one A->B `blockCopies` instruction;
- live Note only changes after save success;
- failed save leaves one original Block/anchor and preserves Dirty state;
- after success, editing B Current does not change A Current or either Original.

## Task 7: Real-disk Slice 3 E2E

**Files:**
- Modify: `tests/file-disk.spec.tsx`
- Modify: `tests/fileDriver.ts`
- Modify Rust test driver only as required.

**E2E scenario:**

1. Open a real Mixed Note.
2. Modify `index.html` or `content.md` externally while clean -> automatic reload.
3. Make local edit, modify disk externally -> conflict; verify neither side overwritten.
4. Save Local As -> local copy persists independently.
5. Create Missing Block state -> explicit Remove Reference repair -> close/reopen valid.
6. Create Orphan Block state -> explicit Restore Orphan -> close/reopen valid.
7. Deep Copy a Block with CSS/JS/image private assets -> close/reopen -> both blocks render.
8. Change copied asset bytes directly -> source Block asset bytes remain unchanged.

## Task 8: Full verification and evidence update

Run:

```text
npm run test:html
npm run test:stage-one
npm run test:protection
npm run test:qualification
npm run test:files
npm run test:files:disk
npm run test:desktop
cargo test --offline --test note_commands --test note_files
cargo clippy --offline --all-targets -- -D warnings
npm run build
npm run tauri:build
git diff --check
```

Update only from verified evidence:

- `REQUIREMENTS-MATRIX.md`
- `flownote-app/STATUS.md`
- `flownote-app/CHECKLIST.md`
- Slice 3 plan/status docs

Do not mark OS-event watching, shared localized resources, cross-note shared dependency transfer, auto merge, or Trash cleanup as implemented unless separately proven.
