# FlowNote Seamless Markdown Focus Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the full-canvas focus frame from Markdown editing so clicking into the document only reveals the caret/selection, while preserving focus indicators on actual controls.

**Architecture:** Keep accessibility focus rings for buttons, inputs, dialogs, and other controls. Scope the global writing-app focus rule away from ProseMirror, and explicitly normalize the visual editor surface so focus does not add outline, border, background, or box-shadow. HTML Visual selected-state styling remains unchanged.

**Tech Stack:** React 18, Milkdown/ProseMirror, CSS, existing jsdom Stage One test harness.

---

### Task 1: Add regression coverage

**Files:**
- Modify: `flownote-app/tests/stage-one.spec.tsx`

**Steps:**
1. Add a test that mounts the real editor and focuses `.ProseMirror`.
2. Assert computed outline width is zero/none and box shadow is none.
3. Run the focused Stage One test and confirm RED against the current global `:focus-visible` rule.

### Task 2: Remove Markdown canvas focus chrome

**Files:**
- Modify: `flownote-app/src/styles/global.css`
- Modify: `flownote-app/src/styles/editor.css`

**Steps:**
1. Replace the broad `.writing-app :focus-visible` rule with control-scoped focus-visible rules.
2. Explicitly keep ProseMirror / Milkdown visual surfaces borderless and shadowless on focus/focus-visible.
3. Preserve existing focus-visible styling for buttons, inputs, select, textarea, summary, links, and dialog actions.
4. Do not change HTML Visual `.is-selected` styling.

### Task 3: Verify

**Steps:**
1. Run the focused regression test.
2. Run `npm run test:stage-one`.
3. Run `npm run build`.
4. Run `git diff --check`.
