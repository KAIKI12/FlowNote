# FlowNote HTML Block Slice 2 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: use the TDD workflow for every behavior change; execute in the current approved workspace without checkout/stash/worktree and without automatic commits.

**Goal:** Implement the approved Slice 2 coverage for HTML Block private resources, a second HTML Block, move-safe `.note` persistence, and managed Markdown image migration while preserving the complete resource architecture for future shared/CDN/runtime capabilities.

**Architecture:** Persist source paths and files exactly as defined by Note Format v1.2. Runtime resource access goes through capability-bound generic readers; current static HTML materialization may use data URLs, but host paths never enter the iframe or persisted source. `.md → .note` migration builds a candidate, copies only classified managed images, validates, commits, then switches the active document.

**Tech Stack:** Tauri 2 / Rust, React 18 + TypeScript, Milkdown/ProseMirror, Zustand, Node test runners, real-disk temporary-directory tests.

---

## Task 1: Baseline and existing partial Slice 2 work

**Files to inspect:**
- `src/html/htmlResources.ts`
- `src/note/markdownAssetMigration.ts`
- `src/editor/plugins/managedImageView.ts`
- `src/utils/dataUrl.ts`
- `src-tauri/src/note_files.rs`
- `src/note/nativeNotePort.ts`
- `tests/html.spec.tsx`
- `tests/appEditing.spec.tsx`
- `tests/file-disk.spec.tsx`

**Step 1:** Run targeted HTML/App/disk/Rust Note tests and record current failures.

**Step 2:** Treat existing failing Slice 2 tests as RED only if the failure is caused by the missing intended behavior; repair test setup errors before implementation.

**Step 3:** Do not rewrite or discard existing uncommitted work. Continue from the current workspace.

## Task 2: Capability-bound private resource reader

**Files:**
- Modify: `src-tauri/src/note_files.rs`
- Modify: `src-tauri/src/note_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify/Create tests: `src-tauri/tests/note_files.rs`, `src-tauri/tests/note_commands.rs`
- Modify: `src/note/nativeNotePort.ts`
- Test: `tests/html.spec.tsx`

**Behavior:**

```text
(note capability, block id, assets/... path)
    -> validate capability
    -> validate UUID/block membership
    -> validate managed relative path
    -> enforce directory/symlink boundary
    -> read bytes + MIME
    -> return bytes only; never return host path
```

**RED tests must cover:** valid CSS/image/JS read, `..`, absolute path, backslash path, cross-block ID, forged capability, missing asset, symlink escape (where platform supports it), stale/revision-changed Note.

**GREEN:** implement the minimal general resource-read API; no tag-specific backend logic.

## Task 3: Runtime HTML private-resource resolution

**Files:**
- Modify: `src/html/htmlResources.ts`
- Modify: `src/utils/dataUrl.ts`
- Modify: `src/editor/plugins/htmlBlock/htmlBlockContext.ts`
- Modify: `src/editor/plugins/htmlBlock/HtmlBlockView.tsx`
- Modify: `src/editor/FlowNoteEditor.tsx`
- Test: `tests/html.spec.tsx`

**RED tests:** static `<link rel=stylesheet>`, `<script src>`, `<img src>`, inline/style CSS `url()`, missing managed resource diagnostic, source HTML unchanged, unmanaged/remote URLs left for network policy, default network-off CSP preserved.

**GREEN:** resolve through the generic asset reader and materialize runtime-only data URLs. Keep the resolver API independent of the chosen data-URL technique so later CSS `@import`, fetch/module/Worker/WASM can extend it without format changes.

## Task 4: Transactional second HTML Block

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/note/useMixedNoteFiles.ts`
- Modify if needed: `src/note/mixedTypes.ts`, `src/note/htmlBlockData.ts`
- Test: `tests/appEditing.spec.tsx`

**RED:** opening an existing Mixed Note, importing a second HTML Block must call Note save with two unique Blocks and two anchors; a rejected save must leave editor Markdown, existing Blocks and Dirty state unchanged.

**GREEN flow:**

```text
create block candidate
+ preview anchor candidate
+ clone mixed candidate
-> note save
-> only after success apply returned snapshot/editor content
```

Original of both Blocks remains independent.

## Task 5: Real-disk save/reopen/move E2E

**Files:**
- Modify: `tests/file-disk.spec.tsx`
- Modify if needed: `tests/fileDriver.ts`
- Modify backend only if RED reveals a real persistence bug.

**RED/E2E:** create/convert Note with two Blocks and private assets, save/close/reopen; move the entire `.note` directory to another parent path; reopen at new path; verify `content.md`, Current/Original, CSS/JS/image bytes and runtime loading still work. Source HTML must still contain relative persisted paths, not runtime data/blob/custom URLs.

## Task 6: Markdown managed-image migration

**Files:**
- Modify: `src/note/markdownAssetMigration.ts`
- Modify: `src/files/fileTypes.ts`, `src/files/nativeFilePort.ts` only as needed for capability asset reads
- Modify: `src/note/nativeNotePort.ts`, `src/note/useMixedNoteFiles.ts`
- Modify backend save staging files only as needed to commit managed assets atomically
- Test: `tests/appEditing.spec.tsx`, `tests/file-disk.spec.tsx`, relevant Rust tests

**RED:** `Timing.md` referencing `Timing.assets/plot.png` converts to `assets/images/plot.png`; fenced code/prose containing the same text is not rewritten; `../`, absolute, remote, query/hash and malformed refs are not classified managed; source `.md` and `Timing.assets` remain after conversion; failed save leaves original document/session intact.

**GREEN:** parse/classify actual Markdown image references rather than global string replacement, read source asset via the bound Markdown capability, pass candidate asset bytes to Note save-as, and commit only after validation.

## Task 7: Managed image runtime rendering

**Files:**
- Modify: `src/editor/plugins/managedImageView.ts`
- Modify: `src/editor/editorRuntime.ts`
- Modify: `src/editor/FlowNoteEditor.tsx`
- Test: `tests/appEditing.spec.tsx`

**RED:** ordinary `.md` image is loaded through Markdown file capability; Mixed Note image under `assets/images/**` is loaded through Note capability; runtime `data:` URL never replaces Markdown source.

**GREEN:** NodeView materializes bytes at runtime only and surfaces missing-resource state without rewriting source.

## Task 8: Full verification and status update

Run the project-defined suites for HTML, Stage One, Protection, Qualification, Files, real-disk Files, desktop UI/IPC, Note Rust tests, Clippy, frontend build and Tauri build. Run `git diff --check`.

Then update only from evidence:
- `REQUIREMENTS-MATRIX.md`
- `flownote-app/STATUS.md`
- `flownote-app/CHECKLIST.md`
- `plan/2026-09-15-html-slice-two.md`

Do not mark a future requirement such as shared localized resources/CDN localization/dynamic fetch/module/Worker/WASM as implemented merely because the static Slice 2 path passes.
