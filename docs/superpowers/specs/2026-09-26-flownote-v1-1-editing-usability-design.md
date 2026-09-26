# FlowNote V1.1 Editing Usability Fixes — Design

**Date:** 2026-09-26

## Goal

Remove the interaction dead ends currently visible in the desktop prototype without changing FlowNote's document-first/local-first architecture.

## Decisions

1. **Standard Markdown math becomes visual-editable.** Enable Milkdown's existing `@milkdown/plugin-math` dependency for `$...$` and `$$...$$`. These forms must no longer force whole-document source mode. Backslash-delimited `\\(...\\)` / `\\[...\\]` remain protected until FlowNote can preserve their exact delimiter form without silent normalization.
2. **Pasting standalone HTML creates an HTML Visual.** A paste whose plain-text payload is clearly standalone HTML source is routed to the existing Mixed Note HTML import pipeline instead of source-protection. Normal rich-text/browser paste continues through the Markdown clipboard parser, so pasted lists/formatting are not unexpectedly converted into Visuals.
3. **Blank editor canvas is a real editing target.** Clicking Milkdown padding/empty canvas focuses the editor and places the caret at the nearest document position (falling back to document end), while clicks on toolbar/content/HTML controls keep their normal behavior.
4. **Workspace file actions become explicit.** The per-row three-dot control opens a visible menu with Rename and Delete; right-click opens the same menu. Delete is end-to-end (React → port → Tauri) and requires a confirmation before destructive removal. Active clean documents are closed before deletion; dirty/composing states keep mutation actions disabled.
5. **Window close must always have a recoverable path.** A close request during IME composition opens the unsaved/close decision path instead of being rejected before UI appears. “Discard and close” is allowed to terminate even if composition state is stuck. The close implementation skips the editor read-lock when composition is active because the user explicitly chose to discard.
6. **No hidden feature-only UI.** Existing advanced file/import actions may remain in the sidebar overflow, but direct HTML paste and the row context menu make the primary interactions discoverable.

## Safety / compatibility

- Raw HTML pasted as source is still stored as a sandboxed FlowNote HTML Block; arbitrary HTML is never executed in the Markdown editor DOM.
- Workspace delete resolves and validates the existing path under the bound workspace before removal and refuses unsupported entries.
- Existing source-protection remains for WikiLinks, footnotes, directives, invalid/missing HTML Block references, Mermaid, and backslash-delimited math.
- Tests must demonstrate failures before implementation and cover visual math, standalone HTML paste, blank-canvas focus, context-menu delete, Rust path deletion, and IME window close.
