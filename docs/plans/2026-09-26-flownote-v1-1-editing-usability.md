# FlowNote V1.1 Editing Usability Fixes — Implementation Plan

**Date:** 2026-09-26

1. **Math / protection**
   - Update protection tests so dollar math is expected to stay visual while unsupported syntax remains protected.
   - Enable `@milkdown/plugin-math` in `src/editor/editorRuntime.ts`.
   - Remove dollar math from `markdownProtection.ts` and `protectedInput.ts` protection triggers; retain backslash-delimited protection.

2. **Blank-canvas caret**
   - Add an interaction regression to click Milkdown canvas outside ProseMirror content.
   - Add a visual-surface pointer handler in `FlowNoteEditor.tsx` using ProseMirror `posAtCoords` with document-end fallback.
   - Adjust editor CSS only if needed to keep the Milkdown canvas filling the scroll viewport.

3. **Standalone HTML paste**
   - Add an app/editor regression showing raw HTML text paste becomes an HTML Visual, while rich HTML paste remains Markdown.
   - Add a conservative standalone-HTML detector and callback through `FlowNoteEditor` / `createFlowEditor`.
   - Refactor App's existing HTML import logic into one reusable function used by both the import form and paste path.

4. **Workspace Delete / context menu**
   - Add Rust `WorkspaceStore::delete` test first.
   - Add TS/native-port and workspace UI failing tests for delete invocation and right-click/three-dot menu.
   - Implement `workspace_delete` command, port method, hook state, row menu/context menu, confirmation, and active-document close-before-delete.

5. **Window close during IME**
   - Add `DocumentSession` failing test: close request while composing becomes pending and discard closes the window.
   - Change the window-close path to bypass the ordinary composition gate while preserving save/cancel behavior.
   - Allow discard-close to bypass editor read-lock if composition is still active.

6. **Verification / checkpoint**
   - Run focused protection, HTML/editor, workspace, desktop/file-session and Rust workspace tests.
   - Run `npm run build`, relevant Rust tests, and inspect `git diff --check` / `git status`.
   - Update `flownote-app/STATUS.md` and `CHECKLIST.md` with evidence and remaining limitations.
