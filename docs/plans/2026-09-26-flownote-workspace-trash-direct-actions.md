# FlowNote Workspace Trash & Direct Actions Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add recoverable Workspace Trash, practical row/context actions, and a direct Add Visual interaction without changing Note Format v1.

**Architecture:** Workspace removal moves entries into a hidden `.flownote-trash/<id>/` record containing `metadata.json` plus the original payload. The Rust WorkspaceStore owns trash safety and restore semantics; the TypeScript WorkspacePort validates only metadata and opaque IDs. React keeps Trash as a fourth sidebar view and reuses the existing DocumentSession dirty/IME gate before trashing an active entry.

**Tech Stack:** Tauri 2 / Rust std + serde, React 18, TypeScript, existing WorkspacePort/useWorkspace architecture, lucide-react, current node-based regression harness.

---

### Task 1: Native Trash model and move/list behavior

**Files:**
- Modify: `flownote-app/src-tauri/src/workspace.rs`
- Modify: `flownote-app/src-tauri/tests/workspace.rs`

**Step 1: Write failing tests**
- Replace the direct-delete test with tests that trash Markdown, a valid `.note`, and a non-empty folder.
- Assert `.flownote-trash` is not returned by `snapshot()` or `search()`.
- Assert `list_trash()` returns id, original path, name, kind and deletion time.

**Step 2: Run the native Workspace test**
Run: `npm run test:workspace:native`
Expected: FAIL because Trash APIs do not exist.

**Step 3: Implement minimal native model**
- Add `WorkspaceTrashItem` and versioned private metadata.
- Add `trash_root()`, opaque ID generation/validation, metadata read/write helpers.
- Replace destructive `delete()` with `trash()`.
- Add `list_trash()`.

**Step 4: Re-run native Workspace tests**
Expected: new trash/list tests PASS.

### Task 2: Native restore and permanent delete

**Files:**
- Modify: `flownote-app/src-tauri/src/workspace.rs`
- Modify: `flownote-app/src-tauri/tests/workspace.rs`

**Step 1: Write failing tests**
- Exact-path restore succeeds and removes the trash record.
- Restore collision leaves trash data intact.
- Missing original parent returns conflict/error and preserves payload.
- Permanent delete recursively removes trashed folder/note.
- Unknown/traversal-style Trash IDs are rejected.

**Step 2: Run native test and confirm RED.**

**Step 3: Implement**
- `restore_trash(id)`
- `delete_trash(id)`
- Strict record lookup under current Workspace `.flownote-trash`.

**Step 4: Re-run and confirm GREEN.**

### Task 3: Tauri commands and frontend protocol

**Files:**
- Modify: `flownote-app/src-tauri/src/lib.rs`
- Modify: `flownote-app/src-tauri/src/workspace.rs`
- Modify: `flownote-app/src/workspace/workspaceTypes.ts`
- Modify: `flownote-app/src/workspace/nativeWorkspacePort.ts`
- Modify: `flownote-app/tests/workspace.spec.tsx`
- Modify desktop IPC tests if command registration coverage requires it.

**Step 1: Add failing frontend request/response tests**
Expected calls:
- `workspace_trash`
- `workspace_trash_list`
- `workspace_trash_restore`
- `workspace_trash_delete`

Validate malformed IDs, kinds, timestamps and relative paths.

**Step 2: Run `npm run test:workspace` and confirm RED.**

**Step 3: Implement protocol and command registration.**

**Step 4: Run Workspace frontend + desktop IPC tests and confirm GREEN.**

### Task 4: Workspace hook state and New Note Here

**Files:**
- Modify: `flownote-app/src/workspace/useWorkspace.ts`
- Modify: `flownote-app/tests/workspace.spec.tsx`

**Step 1: Add failing tests**
- restore loads trash records;
- trash removes Recent/active/expanded references and refreshes trash list;
- restore removes item from Trash and refreshes Files;
- permanent delete removes item from Trash;
- folder action can create a note directly in that folder without first toggling selection.

**Step 2: Run Workspace tests and confirm RED.**

**Step 3: Implement**
- `trashItems` state;
- `refreshTrash()`, `trashEntry()`, `restoreTrash()`, `deleteTrash()`;
- `createNote(folderOverride?: string)`.

**Step 4: Re-run Workspace tests and confirm GREEN.**

### Task 5: Files/Trash UI and active document safety

**Files:**
- Modify: `flownote-app/src/app/WorkspaceChrome.tsx`
- Modify: `flownote-app/src/workspace/WorkspaceTree.tsx`
- Modify: `flownote-app/src/app/App.tsx`
- Modify: `flownote-app/src/styles/global.css`
- Modify: `flownote-app/tests/workspace.spec.tsx`

**Step 1: Add failing UI tests**
- fourth Trash tab exists and hides normal note search while active;
- right-click and three-dot menus expose the same actions;
- folder menu has New Note Here;
- Move to Trash confirmation copy says recovery is available;
- Trash rows show original path, Restore and Permanently Delete;
- permanent delete requires a second confirmation;
- active dirty document cancellation prevents trash.

**Step 2: Run `npm run test:workspace` and confirm RED.**

**Step 3: Implement compact Trash UI**
- Add `Trash2` tab.
- Extend `WorkspaceNavigation` with a trash view.
- Update row menus to Rename / New Note Here / Move to Trash.
- App keeps DocumentSession close gate before calling `trashEntry`.

**Step 4: Re-run Workspace/Files tests and confirm GREEN.**

### Task 6: Direct Add Visual interaction

**Files:**
- Modify: `flownote-app/src/app/App.tsx`
- Modify relevant Stage One/App tests.

**Step 1: Add failing test for UI copy**
- Button is “Add Visual”.
- Form is “Add HTML Visual”.
- textarea placeholder directly requests HTML source.
- submit copy is “Add Visual” / “Create Visual Note”.
- hint explains complete HTML can also be pasted directly.

**Step 2: Run Stage One and confirm RED.**

**Step 3: Change copy only; reuse `storeHtmlSource()`.**

**Step 4: Run Stage One + HTML + Protection tests and confirm GREEN.**

### Task 7: Documentation and full verification

**Files:**
- Modify: `flownote-app/STATUS.md`
- Modify: `flownote-app/CHECKLIST.md`
- Modify: `REQUIREMENTS-MATRIX.md` where Workspace delete/Trash and current LaTeX status are stale.

**Step 1: Update status/evidence and explicit remaining limitations.**

**Step 2: Run fresh verification**
- `npm run test:workspace`
- `npm run test:workspace:native`
- `npm run test:files`
- `npm run test:desktop`
- `npm run test:protection`
- `npm run test:html`
- `npm run test:stage-one`
- `npm run build`
- `git diff --check`

**Step 3: Inspect `git status` and diff.**

**Step 4: Commit a single implementation checkpoint after all evidence is green.**
