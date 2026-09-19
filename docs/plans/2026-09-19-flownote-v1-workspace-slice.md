# FlowNote V1 Workspace Slice Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish and harden the existing Workspace foundation so FlowNote can manage a real local folder of Markdown and .note files with safe switching, Recent, create/rename, search, and restart restore.

**Architecture:** Keep Rust `WorkspaceStore` as the only Workspace-root capability and use relative paths across the frontend boundary. Workspace navigation must route Markdown through `DocumentSession` and Mixed Notes through `NativeNotePort/useMixedNoteFiles`; no Workspace code may directly replace document persistence. The implementation will retain existing partial Workspace code when it satisfies the approved spec and add tests before changing behavior.

**Tech Stack:** React 18 + TypeScript, Milkdown, Tauri 2, Rust std::fs, existing MarkdownFilePort/NativeNotePort, jsdom/esbuild test harness.

---

### Task 1: Make Workspace a first-class regression gate

**Files:**
- Modify: `flownote-app/tests/run-stage-one.mjs`
- Create or modify: `flownote-app/tests/workspace.spec.tsx`
- Modify: `flownote-app/package.json`
- Modify: `flownote-app/tests/run-desktop-tests.mjs` if needed for native Workspace coverage

**Step 1: Write the failing gate test**

Add `--workspace` suite resolution in the runner and a `test:workspace` npm script. Ensure the current Workspace frontend checks run independently.

**Step 2: Run to establish baseline**

Run:

`npm run test:workspace`

Expected initial outcome: either runner missing/RED before wiring, or concrete Workspace behavior failures after the runner is wired.

**Step 3: Wire Rust Workspace tests into a repeatable command**

Add a command/script path that runs:

`cargo test --offline --test workspace -- --test-threads=1`

Do not hide it behind unrelated desktop tests.

**Step 4: Record baseline gaps**

Keep any failing behavior tests as RED tests for subsequent tasks.

---

### Task 2: Harden the native Workspace contract

**Files:**
- Modify: `flownote-app/src-tauri/src/workspace.rs`
- Modify: `flownote-app/src-tauri/tests/workspace.rs`
- Modify only if required: `flownote-app/src-tauri/src/lib.rs`
- Modify only if required: `flownote-app/src-tauri/src/file_commands.rs`
- Modify only if required: `flownote-app/src-tauri/src/note_commands.rs`

**Step 1: Add missing RED tests**

Cover approved spec gaps that are not already tested:

- missing persisted root restores as no Workspace,
- hidden / dist / target and symlink entries are excluded,
- symlink traversal is rejected,
- Note package internals never appear in scan/search,
- search matches Note title from `note.json`,
- oversized text search is skipped safely,
- result count is bounded,
- rename preserves Markdown/.note suffix when omitted,
- folder rename remains inside the Workspace,
- `resolve_markdown` and `resolve_note` reject the wrong entry kind.

**Step 2: Run Rust Workspace tests and confirm RED where behavior is missing**

**Step 3: Implement minimum native fixes**

Preserve the existing capability model; do not add database state or absolute-path responses.

**Step 4: Re-run Rust Workspace tests until GREEN**

---

### Task 3: Harden the TypeScript WorkspacePort boundary

**Files:**
- Modify: `flownote-app/src/workspace/nativeWorkspacePort.ts`
- Modify: `flownote-app/src/workspace/workspaceTypes.ts`
- Modify: `flownote-app/tests/workspace.spec.tsx`

**Step 1: Add RED protocol tests**

Verify:

- nested entry validation,
- non-folder children rejected,
- absolute/backslash/parent/colon paths rejected,
- malformed search results rejected,
- exact request shapes for pick/restore/scan/search/create/rename.

**Step 2: Run `npm run test:workspace` and confirm RED**

**Step 3: Implement only missing validation/mapping**

**Step 4: Re-run Workspace suite until GREEN**

---

### Task 4: Make Workspace state semantics reliable

**Files:**
- Modify: `flownote-app/src/workspace/useWorkspace.ts`
- Modify: `flownote-app/src/workspace/workspaceRecent.ts`
- Modify: `flownote-app/tests/workspace.spec.tsx`

**Step 1: Add RED hook/app behavior tests**

Cover:

- restore on mount,
- missing/no Workspace state,
- folder click selects and expands,
- new note is created in selected folder,
- successful open alone updates active path and Recent,
- failed/cancelled open does not update active/Recent,
- stale debounced search result cannot overwrite a newer query,
- refresh removes missing Recent,
- rename updates Recent,
- folder rename migrates selected folder,
- folder rename migrates descendant Recent paths rather than leaving stale entries.

**Step 2: Run Workspace suite and confirm RED for missing semantics**

**Step 3: Implement minimal state fixes**

Avoid storing note content or absolute paths in Workspace state.

**Step 4: Re-run Workspace suite until GREEN**

---

### Task 5: Harden Markdown / Mixed Note switching from Workspace

**Files:**
- Modify: `flownote-app/src/app/App.tsx`
- Modify if required: `flownote-app/src/files/documentSession.ts`
- Modify if required: `flownote-app/src/note/useMixedNoteFiles.ts`
- Modify: `flownote-app/tests/workspace.spec.tsx`
- Modify if useful: `flownote-app/tests/appEditing.spec.tsx`

**Step 1: Add RED integration tests**

Test all important transitions:

- Markdown -> Markdown clean,
- Markdown -> Markdown dirty => existing save/discard/cancel prompt,
- Markdown -> Note clean,
- Markdown -> Note dirty => existing pending flow; cancel keeps old doc,
- Note -> Markdown clean releases Note capability after successful switch,
- Note -> Note clean,
- dirty/composing Note blocks or safely resolves switching,
- active tree highlight / Recent update only after final document apply,
- candidate capability released on cancelled/failed switch.

**Step 2: Run focused tests and confirm RED**

**Step 3: Fix router/session integration without creating a third switching model**

Where possible, centralize cross-type switching around the current `DocumentSession` pending semantics.

**Step 4: Re-run Workspace + existing file/HTML tests**

---

### Task 6: Finish the real Files Sidebar / Search UX

**Files:**
- Modify: `flownote-app/src/workspace/WorkspaceTree.tsx`
- Modify: `flownote-app/src/app/WorkspaceChrome.tsx`
- Modify: `flownote-app/src/styles/global.css`
- Modify: `flownote-app/tests/workspace.spec.tsx`

**Step 1: Add RED UI tests**

Verify:

- no static fake Research/PD/Cislunar rows remain,
- no Workspace shows Choose Workspace state,
- bound Workspace shows real name/tree,
- folders expand/collapse,
- current entry highlights after apply,
- Recent shows real entries and Missing state,
- search replaces tree with title/path/snippet results,
- New Note creates in selected folder,
- Rename is contextual and disabled while dirty/composing/busy/conflicted.

**Step 2: Run Workspace UI suite and confirm RED as needed**

**Step 3: Implement Quiet Technical UI**

Keep rows compact and document-first. Do not turn the sidebar into a VS Code clone. Avoid permanent row action bars.

**Step 4: Re-run Workspace suite and build**

---

### Task 7: Format-freeze compatibility checks

**Files:**
- Prefer tests only unless a regression is found.
- Modify: `flownote-app/tests/file-disk.spec.tsx`
- Modify: `flownote-app/tests/html.spec.tsx`
- Modify Rust Note tests only if required.

**Step 1: Verify Workspace operations do not mutate Note format semantics**

Specifically re-run:

- Missing / Orphan repair,
- Deep Copy,
- managed assets,
- external modification behavior,
- save failure recovery,
- Markdown local image behavior,
- `.note` open/save tests.

**Step 2: Fix only regressions introduced by Workspace integration**

No format migration in this slice.

---

### Task 8: Final verification and status update

**Files:**
- Modify: `flownote-app/STATUS.md`
- Modify: `flownote-app/CHECKLIST.md`
- Modify: `flownote-app/README.md` only if the launch/use workflow changed

**Step 1: Run fresh verification**

Frontend:

- `npm run test:workspace`
- `npm run test:stage-one`
- `npm run test:protection`
- `npm run test:qualification`
- `npm run test:files`
- `npm run test:files:disk`
- `npm run test:html`
- `npm run test:desktop`
- `npm run build`

Native:

- `cargo test --offline --test workspace -- --test-threads=1`
- existing Note/file native suites required by the project baseline.

Repository:

- `git diff --check`

**Step 2: Update status truthfully**

Mark only verified Workspace features complete. Keep Favorites, Trash/delete, watcher, multi-Workspace, SQLite/FTS, Full HTML Editor, and exports as deferred.

**Step 3: Do not auto-commit unrelated dirty work**

The repository currently contains extensive pre-existing uncommitted Slice work. Do not reset, clean, stage, or commit unrelated files.
