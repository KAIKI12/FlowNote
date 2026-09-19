# FlowNote Browser Bundle Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Export a bound Mixed Note into a normal browser-openable directory while preserving current Markdown, Current HTML, managed resources, Block order/isolation, and source-note immutability.

**Architecture:** The frontend serializes the current editor document into a dedicated browser presentation HTML and sends that plus the latest Markdown/Current Block HTML to a native export command. The native layer revalidates the bound Note revision, materializes only Note-owned resources from a verified NoteTree snapshot into a sibling staging directory, then atomically renames the complete directory into place. Browser Bundle export never changes the Note binding/revision and never reuses Note save-as semantics.

**Tech Stack:** Rust/Tauri 2, Windows safe Note I/O, React 18, Milkdown/ProseMirror, TypeScript, existing custom Stage One / disk harnesses.

---

### Task 1: Native Browser Bundle request model and RED tests

**Files:**
- Create: `flownote-app/src-tauri/src/browser_bundle.rs`
- Create: `flownote-app/src-tauri/tests/browser_bundle.rs`
- Modify: `flownote-app/src-tauri/src/lib.rs`
- Reference: `flownote-app/src-tauri/src/note_files.rs`
- Reference: `flownote-app/src-tauri/src/windows_note_tree.rs`

**Step 1: Add request/result types in tests first**

Define test request shape:

```text
BrowserBundleRequest
- id
- revision
- folderName
- title
- content
- indexHtml
- blocks[]
  - id
  - html
```

Define result:

```text
BrowserBundleResult
- path
- name
```

**Step 2: Write RED tests**

Cover:
- current `content.md` and generated `index.html` written,
- Note `assets/**` copied,
- only referenced Block `assets/**` copied,
- Current block HTML written to `blocks/<id>/index.html`,
- `original.html`, `block.json`, orphan Blocks not copied,
- source Note bytes/revision unchanged.

Run:

`cargo test --offline --manifest-path src-tauri/Cargo.toml --test browser_bundle -- --test-threads=1`

Expected: compile/behavior RED because Browser Bundle API does not exist.

### Task 2: Native validation RED tests

**Files:**
- Test: `flownote-app/src-tauri/tests/browser_bundle.rs`
- Modify: `flownote-app/src-tauri/src/browser_bundle.rs`

Add RED cases for:
- closed/forged capability,
- stale revision,
- read-only/future-version Note,
- invalid/duplicate/missing Block IDs,
- invalid folder name including `/`, `\`, `:`, NUL, reserved names,
- existing final destination,
- symlink/reparse target/parent rejection,
- request size bounds,
- missing unsafe resource,
- failure leaves no final destination.

Implement minimal validation using existing:
- NoteStore binding/revision,
- `NoteTree::read_shared()`,
- `ensure_copyable()`,
- `note_path::component_name()`,
- `lock_ancestors()`.

Do not add new Note Format fields.

### Task 3: Atomic export materializer

**Files:**
- Modify: `flownote-app/src-tauri/src/browser_bundle.rs`
- Modify: `flownote-app/src-tauri/src/note_files.rs`

Implementation:
1. lock source ancestors,
2. resolve bound Note path and verify revision,
3. build one validated NoteTree snapshot,
4. validate requested Block IDs against current Note document,
5. create sibling `.<folder>.flownote-export-<uuid>.tmp`,
6. write generated `index.html`, current `content.md`,
7. copy Note-managed `assets/**` from NoteTree bytes,
8. for each referenced Block write requested Current HTML and copy only `blocks/<id>/assets/**`,
9. verify staged layout,
10. rename stage to final destination,
11. on any failure remove stage when safely possible and never mutate source Note.

The materializer must copy from the validated in-memory NoteTree bytes, not traverse source resource paths a second time.

### Task 4: Tauri command and NativeNotePort protocol

**Files:**
- Modify: `flownote-app/src-tauri/src/note_commands.rs`
- Modify: `flownote-app/src-tauri/src/lib.rs`
- Modify: `flownote-app/src-tauri/tests/note_commands.rs`
- Modify: `flownote-app/src/note/nativeNotePort.ts`
- Modify: `flownote-app/tests/html.spec.tsx`

Add:
- `note_export_browser_bundle` command,
- parent-directory picker,
- safe derived final folder name,
- `NativeNotePort.exportBrowserBundle(request)`.

Protocol tests must verify exact request/response shape and reject malformed result data.

### Task 5: Frontend Browser Bundle renderer RED tests

**Files:**
- Create: `flownote-app/src/export/browserBundle.ts`
- Modify: `flownote-app/tests/editorRegressions.spec.ts` or create `tests/browserBundle.spec.tsx`

RED cases:
- ordinary Markdown produces semantic HTML,
- no FlowNote editor toolbar/chrome is exported,
- HTML Blocks appear in exact document order,
- iframe src uses `./blocks/<id>/index.html`,
- width/height/script-policy are emitted,
- Current HTML, not Original, becomes per-Block export document,
- protected/source-only Markdown gets escaped source fallback,
- root document contains no remote UI dependency.

### Task 6: Add read-only export snapshot API to editor

**Files:**
- Modify: `flownote-app/src/editor/editorTypes.ts`
- Modify: `flownote-app/src/editor/editorRuntime.ts`
- Modify if needed: `flownote-app/src/editor/editorSession.ts`

Expose one read-only method such as:

`getBrowserBundleSnapshot(mixed: MixedNoteData): BrowserBundleDraft`

It must read:
- latest logical Markdown from session,
- current ProseMirror document when visual mode is safe,
- HTML Block node id/width/order,
- current block data from Mixed Note.

Do not expose mutable ProseMirror state to App code.

### Task 7: Renderer GREEN

**Files:**
- Implement: `flownote-app/src/export/browserBundle.ts`

Generate:
- root HTML shell with self-contained FlowNote export CSS,
- semantic Markdown body for supported visual-mode nodes,
- iframe wrappers for HTML Blocks,
- CSP-wrapped per-Block Current HTML documents,
- protected-source fallback when editor/session reports protected mode.

Network stays disabled by default.

### Task 8: App export action and state guards

**Files:**
- Modify: `flownote-app/src/note/useMixedNoteFiles.ts`
- Modify: `flownote-app/src/app/App.tsx`
- Modify: `flownote-app/tests/appEditing.spec.tsx`

Add `Export Browser Bundle` to File actions.

Guards:
- Mixed Note bound,
- editor ready,
- not composing,
- no Note operation busy,
- no external conflict,
- formatVersion 1/writeable source.

Dirty is allowed.

Export must:
- not call `mixed.save()`,
- not clear dirty state,
- not mutate current Note,
- show destination on success,
- keep dirty/error state unchanged on failure except visible export error/notice.

### Task 9: Real disk integration

**Files:**
- Modify: `flownote-app/tests/file-disk.spec.tsx`
- Modify test driver only if needed.

Scenario:
1. create/open Mixed Note,
2. add Note-managed image,
3. include two Blocks with private CSS/image resources,
4. make unsaved Markdown + Current HTML edit,
5. export Browser Bundle,
6. inspect bundle files and order,
7. verify source Note tree bytes/revision unchanged,
8. verify no `original.html`, `block.json`, orphan Block export.

### Task 10: file:// browser qualification

**Files:**
- Create test fixture under `flownote-app/tests/fixtures/browser-bundle/` only if needed.
- Add a browser qualification script/test that opens generated `index.html` via `file://`.

Verify:
- root page loads,
- iframe loads,
- relative CSS applies,
- classic JS executes only for `scriptPolicy=sandbox`,
- image loads,
- network remains blocked.

If target browser blocks ordinary supported local resources, adjust export materialization rather than weakening network isolation.

ES modules/fetch/Worker/WASM remain explicit non-goals.

### Task 11: Full verification

Run serially:

- `npm run test:stage-one`
- `npm run test:html`
- `npm run test:workspace`
- `npm run test:protection`
- `npm run test:qualification`
- `npm run test:files`
- `npm run test:files:disk`
- `npm run test:desktop`
- `npm run test:format-freeze`
- `cargo test --offline --manifest-path src-tauri/Cargo.toml -- --test-threads=1`
- `cargo clippy --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `npm run build`
- `npm run tauri:build`
- `git diff --check`

Do not run the heavy custom JS suites in parallel.

### Task 12: Docs, commit and publish

**Files:**
- Modify: `flownote-app/STATUS.md`
- Modify: `flownote-app/CHECKLIST.md`
- Modify: `flownote-app/README.md`

Record Browser Bundle as completed only after fresh verification.

Commit:
`git commit -m "feat: add browser bundle export"`

Push feature branch, then fast-forward/synchronize `master` and default `main` only after final review passes.
