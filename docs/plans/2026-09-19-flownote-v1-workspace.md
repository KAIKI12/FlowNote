# FlowNote V1 Workspace Slice Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect FlowNote's Files Sidebar to a secure real local workspace with tree navigation, safe document switching, create/rename, Recent and basic search.

**Architecture:** Rust owns a single authorized canonical workspace root and exposes narrow relative-path commands. Existing Markdown FileStore and NoteStore remain the only way open documents obtain save/reload/resource capabilities. Frontend adds a small workspace port/hook/tree layer and reuses DocumentSession / Mixed Note lifecycle protection.

**Tech Stack:** Rust/Tauri 2, React 18, TypeScript, Zustand/current stores, Milkdown, existing custom Node/jsdom and Rust test harnesses.

---

### Task 1: Rust workspace root and tree

**Files:**
- Create: `flownote-app/src-tauri/src/workspace.rs`
- Modify: `flownote-app/src-tauri/src/lib.rs`
- Test: `flownote-app/src-tauri/tests/workspace.rs`

**TDD steps:**
1. Add failing tests for canonical binding, relative-path traversal rejection, symlink skip, .note package leaf behavior and sorted .md/.note tree.
2. Implement `WorkspaceStore`, path resolver, tree scan and persistence helpers.
3. Add picker/restore/scan commands restricted to main window.
4. Run `cargo test --offline --test workspace`.

### Task 2: Workspace open/create/rename/search commands

**Files:**
- Modify: `flownote-app/src-tauri/src/workspace.rs`
- Modify: `flownote-app/src-tauri/src/file_commands.rs`
- Modify: `flownote-app/src-tauri/src/note_commands.rs`
- Modify: `flownote-app/src-tauri/src/lib.rs`
- Test: `flownote-app/src-tauri/tests/workspace.rs`
- Test: `flownote-app/src-tauri/tests/desktop_commands.rs`

**TDD steps:**
1. Add failing tests for workspace Markdown open, .note open, create Markdown, rename collision/traversal, body search and secondary-window denial.
2. Implement relative-path open through existing stores.
3. Implement create/rename/search with root checks and symlink rejection.
4. Run focused Rust tests.

### Task 3: Frontend workspace port/contracts

**Files:**
- Create: `flownote-app/src/workspace/workspaceTypes.ts`
- Create: `flownote-app/src/workspace/nativeWorkspacePort.ts`
- Create: `flownote-app/src/workspace/workspaceRecent.ts`
- Test: `flownote-app/tests/workspace.spec.tsx`

**TDD steps:**
1. Add failing protocol-validation and Recent normalization tests.
2. Implement strict IPC decoders and max-10 relative Recent storage.
3. Run focused frontend test.

### Task 4: Safe path opening through existing sessions

**Files:**
- Modify: `flownote-app/src/files/fileTypes.ts`
- Modify: `flownote-app/src/files/nativeFilePort.ts`
- Modify: `flownote-app/src/files/documentSession.ts`
- Modify: `flownote-app/src/note/nativeNotePort.ts`
- Modify: `flownote-app/src/note/useMixedNoteFiles.ts`
- Test: `flownote-app/tests/documentSession.spec.ts`
- Test: `flownote-app/tests/appEditing.spec.tsx`

**TDD steps:**
1. Add failing tests proving workspace candidates still enter the current Dirty/IME switch gate.
2. Add optional workspace-open methods to ports.
3. Add `DocumentSession.openWorkspace(relativePath)`.
4. Add Mixed Note workspace open using the current apply/release logic.
5. Run focused tests.

### Task 5: Workspace state and real Sidebar tree

**Files:**
- Create: `flownote-app/src/workspace/useWorkspace.ts`
- Create: `flownote-app/src/workspace/WorkspaceTree.tsx`
- Modify: `flownote-app/src/app/WorkspaceChrome.tsx`
- Modify: `flownote-app/src/app/App.tsx`
- Modify: `flownote-app/src/styles/global.css`
- Test: `flownote-app/tests/workspace.spec.tsx`

**TDD steps:**
1. Add failing UI tests for empty workspace, real tree, expand/collapse, active highlight, choose/restore/refresh.
2. Implement hook and recursive tree.
3. Wire Markdown click to DocumentSession and .note click through the safe Note switch flow.
4. Keep static mock folders removed once real tree is available.
5. Run focused tests.

### Task 6: New Note, rename, Recent and search

**Files:**
- Modify: `flownote-app/src/workspace/useWorkspace.ts`
- Modify: `flownote-app/src/workspace/WorkspaceTree.tsx`
- Modify: `flownote-app/src/app/WorkspaceChrome.tsx`
- Modify: `flownote-app/src/app/App.tsx`
- Modify: `flownote-app/src/styles/global.css`
- Test: `flownote-app/tests/workspace.spec.tsx`
- Test: `flownote-app/tests/appEditing.spec.tsx`

**TDD steps:**
1. Add failing tests for New Note, rename, Recent update/missing entry and real search result click.
2. Implement commands through the workspace hook.
3. Keep rename contextual; no permanent button row.
4. Search query drives real Rust search, capped results.
5. Run focused tests.

### Task 7: Integration verification and docs

**Files:**
- Modify: `flownote-app/STATUS.md`
- Modify: `flownote-app/CHECKLIST.md`

**Verification:**
1. `cargo test --offline --test workspace`
2. `npm run test:stage-one`
3. `npm run test:protection`
4. `npm run test:qualification`
5. `npm run test:files`
6. `npm run test:files:disk`
7. `npm run test:html`
8. `npm run test:desktop`
9. `npm run build`
10. `git diff --check`
11. Update STATUS/CHECKLIST with implemented/deferred boundaries.
