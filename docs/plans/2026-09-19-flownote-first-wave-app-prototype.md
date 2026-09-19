# FlowNote First-Wave App Prototype Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first usable FlowNote desktop UI prototype around the existing Markdown/.note implementation without changing format or storage semantics.

**Architecture:** Keep current document/session/note ports intact. Introduce a small UI shell layer in React that owns app view state (Edit/Read/Focus, sidebar, inspector, theme, selected HTML block), while FlowNoteEditor continues to own Markdown editing and the HTML node view continues to own per-visual rendering/editing. Extend the existing HTML host boundary only where needed to report selection to the shell.

**Tech Stack:** React 18, TypeScript, Milkdown 7.22.1, Zustand 5, existing CSS, Vite 6, existing esbuild/jsdom test harness.

---

### Task 1: Lock the shell behavior with tests

**Files:**
- Modify: flownote-app/tests/appEditing.spec.tsx
- Modify: flownote-app/tests/html.spec.tsx

**Steps:**
1. Add a failing App test asserting Edit / Read / Focus controls exist.
2. Assert Read switches the editor root to read mode.
3. Assert Focus adds the focus shell state while leaving the editor in edit mode.
4. Add a failing HTML test asserting Fullscreen opens an overlay and Esc closes it.
5. Run npm run test:html and the focused app suite to verify RED.

### Task 2: Build the App Shell

**Files:**
- Create: flownote-app/src/app/WorkspaceChrome.tsx
- Modify: flownote-app/src/app/App.tsx
- Modify: flownote-app/src/styles/global.css

**Steps:**
1. Add shell state: view mode, sidebar visibility, inspector visibility, inspector tab, theme.
2. Implement minimal Topbar with FlowNote brand, search affordance, Edit / Read / Focus segmented control, Inspector and theme toggles.
3. Implement collapsible Files Sidebar around existing FileToolbar capabilities.
4. Implement Inspector with Outline / Block / Info.
5. Pass read to FlowNoteEditor only in Read mode; Edit and Focus use edit mode.
6. Preserve existing file action aria-labels.
7. Run focused app tests until GREEN.

### Task 3: Restyle continuous Markdown canvas

**Files:**
- Modify: flownote-app/src/styles/editor.css
- Modify: flownote-app/src/styles/global.css

**Steps:**
1. Make the document canvas centered with a readable 760-900 px measure.
2. Reduce permanent editor chrome.
3. Keep Markdown directly editable; do not introduce section/block wrappers.
4. Hide editing controls in Read mode.
5. Hide Sidebar/Inspector and weaken Topbar in Focus mode.
6. Run Stage One / qualification regressions relevant to editor layout.

### Task 4: Add HTML Visual contextual states

**Files:**
- Modify: flownote-app/src/editor/plugins/htmlBlock/htmlBlockContext.ts
- Modify: flownote-app/src/editor/FlowNoteEditor.tsx
- Modify: flownote-app/src/editor/plugins/htmlBlock/HtmlBlockView.tsx
- Modify: flownote-app/src/styles/editor.css

**Steps:**
1. Extend the HTML host with optional selection callback/state.
2. Keep existing Edit and Duplicate aria-label contracts.
3. Change visual chrome to Normal / Hover / Selected progressive disclosure.
4. Preserve Normal / Wide / Full layout behavior.
5. Run npm run test:html and app HTML editing tests.

### Task 5: Build HTML Quick Edit

**Files:**
- Modify: flownote-app/src/editor/plugins/htmlBlock/HtmlBlockView.tsx
- Modify: flownote-app/src/styles/editor.css

**Steps:**
1. Replace inline textarea presentation with a large modal while keeping aria-label="HTML 源码".
2. Render live preview beside the source editor.
3. Add Cancel / Open Full Editor / Save controls.
4. Keep current-source update behavior compatible with existing save tests.
5. Run HTML/app editing tests.

### Task 6: Build HTML Fullscreen

**Files:**
- Modify: flownote-app/src/editor/plugins/htmlBlock/HtmlBlockView.tsx
- Modify: flownote-app/src/styles/editor.css

**Steps:**
1. Wire existing aria-label="全屏 HTML Block" control.
2. Render presentation overlay with the same resolved HTML content.
3. Add Esc close handling and a lightweight exit control.
4. Run fullscreen regression test and full HTML suite.

### Task 7: Integration verification

**Files:**
- No semantic production changes unless a failing regression requires them.

**Steps:**
1. Run npm run test:stage-one.
2. Run npm run test:protection.
3. Run npm run test:qualification.
4. Run npm run test:files.
5. Run npm run test:files:disk.
6. Run npm run test:html.
7. Run npm run test:desktop.
8. Run npm run build.
9. Inspect git diff --check.
10. Review the final UI diff against the approved design and report any intentionally deferred prototype gaps.
