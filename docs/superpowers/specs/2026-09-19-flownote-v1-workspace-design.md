# FlowNote V1 Workspace Slice Design

## Status

Approved direction: 2026-09-19. This spec converts the approved Workspace direction into the implementation contract for the next V1 slice.

## Goal

Upgrade FlowNote from “an editor that can open one document” to a local-first note application that can manage a real folder of Markdown and FlowNote notes without changing the existing Markdown or Note format semantics.

The V1 Workspace Slice must provide:

- choose and remember one local Workspace folder,
- scan and show real `.md`, `.markdown`, and valid `.note` packages,
- open notes from the tree with existing dirty / IME protection,
- create Markdown notes in the selected folder,
- rename supported entries,
- show Recent notes,
- search filename/title/body for Markdown and `.note/content.md`,
- restore the last Workspace after app restart.

It must not add a database index, a Notion-style internal document database, or a second persistence model for notes.

## Existing foundation

The current worktree already contains partial Workspace infrastructure:

- Rust `workspace.rs` with root binding, persistence, scanning, search, Markdown creation, rename, path validation, symlink rejection and Workspace-relative resolution.
- `markdown_open_workspace` and `note_open_workspace` commands that resolve entries through the bound Workspace.
- React `src/workspace/*` with `WorkspacePort`, native port validation, Recent storage, `useWorkspace`, and a first tree/search UI.
- `App.tsx` partial routing from Workspace entries into the existing Markdown and Mixed Note open flows.

This slice therefore completes and hardens the existing foundation rather than creating a parallel Workspace implementation.

## Architecture decision

### Recommended / selected: native Workspace capability + existing document ports

Flow:

```text
Local folder
   |
   v
Rust WorkspaceStore
  - canonical root
  - safe relative paths
  - scan/search/mutate
   |
   +---- markdown relative path ---> MarkdownFilePort / DocumentSession
   |
   +---- .note relative path ------> NativeNotePort / useMixedNoteFiles
   |
   v
React useWorkspace
   |
   v
Files Sidebar / Search / Recent
```

The Workspace layer knows **where notes are**. It does not become another document storage layer.

Markdown content remains owned by the current Markdown file/session path. Mixed Note content remains owned by the Note port and Note format implementation.

### Rejected: frontend-only filesystem ownership

Keeping folder handles and recursive scanning primarily in React/Tauri JS would duplicate native path validation, weaken Windows path behavior consistency, and make Markdown / Note capabilities harder to unify.

### Rejected for V1: SQLite / indexed metadata database

A persistent index can improve very large workspaces later, but V1 does not need it. Direct bounded search is simpler, easier to verify, and keeps local files as the source of truth.

## Workspace root and persistence

Only one Workspace is active at a time in V1.

When a folder is selected:

1. Rust canonicalizes the root.
2. The active root is stored only in the native Workspace service.
3. The root is persisted in the application config directory.
4. React receives a `WorkspaceSnapshot` containing:
   - stable Workspace ID,
   - display name,
   - supported entry tree.
5. On restart, `workspace_restore` reloads the last valid root.
6. If the persisted root no longer exists, FlowNote returns to the “Choose Workspace” state instead of silently binding elsewhere.

The browser/UI layer does not receive arbitrary absolute child paths for normal navigation. Entries are addressed by Workspace-relative paths.

## Entry model

Supported entry kinds:

- `folder`
- `markdown`
- `note`

Markdown:

- regular local file,
- extension `.md` or `.markdown`.

Note:

- directory whose name ends in `.note`,
- contains at least `content.md` and `note.json`,
- treated as one leaf note in the tree; its internal files are not displayed.

Ignored in V1:

- hidden entries,
- symlinks,
- unsupported files,
- `node_modules`,
- `target`,
- `dist`.

Folders sort before notes; entries then sort by case-insensitive name.

## Path security

All Workspace actions are rooted in the native canonical Workspace directory.

Required invariants:

- no absolute paths from the UI,
- no `..`,
- no backslash-based bypass,
- no NUL,
- no drive-prefix / colon components,
- no traversal through symlinks,
- resolved paths must remain inside the canonical Workspace root,
- Markdown open must resolve only Markdown files,
- Note open must resolve only valid Note packages.

Existing Markdown and Note capability checks remain authoritative after opening.

## Sidebar behavior

The left sidebar becomes real data, not representative mock rows.

### When no Workspace is bound

Show:

- Local Workspace
- short explanation
- Choose Workspace

New Note triggers Workspace selection first rather than creating a fake detached tree entry.

### When Workspace exists

Show:

1. New Note / Open
2. Workspace header
   - Workspace name
   - Refresh
   - Change
3. Recent
4. Files tree
5. weak/deferred Tags / Trash labels

Current note is highlighted only after the requested note has actually been applied.

Folders:

- click toggles expand/collapse,
- click also sets the destination folder for New Note,
- expanded state is UI state, not stored in note files.

Tree controls remain visually restrained. Rename appears contextually rather than turning each row into a permanent toolbar.

## New Note

V1 New Note creates Markdown only.

Behavior:

1. If no Workspace exists, prompt to choose one.
2. Create inside currently selected folder; root if no folder is selected.
3. Native layer chooses a collision-free name:
   - `Untitled.md`
   - `Untitled 2.md`
   - etc.
4. Re-scan Workspace.
5. Open the created note through `DocumentSession.openWorkspace`.
6. Highlight and record Recent only after the open has successfully applied.

Creating a new `.note` directly is not required. A Mixed Note continues to be created through the explicit Markdown -> Note conversion / HTML import flow.

## Opening and switching notes

### Markdown -> Markdown / Mixed Note

Use `DocumentSession.openWorkspace(relativePath)`.

The existing pending-switch flow remains authoritative:

- Clean: apply immediately.
- Dirty: show existing save / discard / cancel dialog.
- IME composition: do not switch until composition is resolved.
- Candidate file is released if switch is cancelled or becomes stale.

### Mixed Note -> Markdown

The DocumentSession alternate-close path must release the current Note capability before applying the Markdown candidate.

### Markdown -> Mixed Note

Mixed Note opening must not bypass Markdown dirty protection.

The Workspace router requests the existing DocumentSession switch flow when current state is dirty/composing, then opens the Note only after the pending action is resolved.

### Mixed Note -> Mixed Note

Use existing Mixed Note open candidate semantics:

- no switch while dirty/composing without explicit resolution,
- candidate capabilities are released on cancellation/failure,
- previous Note capability is released only after successful application.

No Workspace click may directly mutate `currentNote` outside these existing session/port paths.

## Rename

V1 supports rename for:

- folders,
- Markdown files,
- Note packages.

Rules:

- leaf name only,
- no path separators / NUL / colon,
- duplicate target rejected,
- Markdown keeps its Markdown extension if omitted,
- Note keeps `.note` if omitted.

Safety:

- rename is disabled while the current document is dirty, composing, saving, switching, or in a Mixed Note external-conflict state.
- after rename, rescan the tree.
- Recent path is updated.
- if the renamed entry is currently open, reopen it through the normal Workspace open path so capabilities and displayed path are consistent.

Folder rename updates the selected-folder path; descendant Recent migration can be added if needed by tests, but V1 must not leave clickable stale Recent entries.

Delete / Trash is not part of this slice.

## Recent

Recent is UI metadata only and must not copy note content.

Storage:

- per Workspace ID,
- up to 10 entries per Workspace,
- bounded global list,
- stores only relative path, kind, timestamp.

Behavior:

- opening a note records it only after successful apply,
- missing entries render disabled / Missing,
- refresh removes stale Recent records,
- rename updates the corresponding Recent path,
- Recent never becomes an alternate source of truth.

V1 does not require Favorites persistence.

## Search

V1 search is direct native scanning, not an indexed database.

Search scope:

### Markdown

Match:

- filename,
- first level-1 Markdown heading used as title,
- body text.

### Note

Match:

- `.note` package name,
- title from `note.json` when valid,
- `content.md` body.

Constraints:

- skip hidden/ignored directories and symlinks,
- skip oversized text files above the bounded search limit,
- cap result count,
- invalid UTF-8 / unsupported content does not crash the search,
- HTML Block private asset files are not searched in V1.

UI:

- top global search input drives Workspace search,
- debounce short typing bursts,
- query mode temporarily replaces Recent/Files list with results,
- each result shows title, relative path, short snippet,
- click routes through the same safe open path as the file tree,
- empty query returns to normal navigation.

## Refresh and external tree changes

V1 does not require a recursive filesystem watcher.

Refresh occurs:

- manually through Refresh,
- after create,
- after rename,
- on Workspace restore/select.

The already-existing per-document external modification protection remains responsible for currently open file contents.

A filesystem watcher may be introduced later if product use justifies it.

## UI boundaries

The Workspace Slice must preserve the already-approved FlowNote UI language:

- Markdown is still one continuous editable document, not blocks.
- The sidebar stays quiet and narrow.
- No VS Code-style dense icon tree.
- No permanent action buttons on every row.
- HTML Visual remains the only explicit visual block.
- Search is a productivity control, not a dashboard page.

Use proper SVG/icon components in final polish rather than relying on decorative emoji.

## Error handling

Errors stay local to the operation and must not destroy the active document.

Examples:

- invalid persisted Workspace -> clear binding, show Choose Workspace,
- scan/search failure -> show sidebar error while keeping current document,
- candidate open failure -> keep current document,
- rename conflict -> keep old tree and current document,
- stale/missing Recent -> disabled, removable on refresh,
- malformed Workspace response -> protocol error, never trust unchecked paths.

No Workspace error may silently discard local edits.

## V1 acceptance tests

### Native / Rust

- bind and scan nested Markdown / Note tree,
- Note package is one leaf, internal files hidden,
- ignored folders and symlinks excluded,
- path traversal / symlink escape rejected,
- persisted Workspace restores after restart,
- missing persisted root returns no Workspace,
- create Markdown collision naming,
- rename validation and collision handling,
- search Markdown filename/title/body,
- search Note title/content,
- search result cap / large file behavior,
- Workspace open resolves only correct entry type.

### Frontend port

- reject malformed snapshots, entry kinds, relative paths, search results,
- maps every native command with exact request shapes.

### React Workspace

- restore on mount,
- no-Workspace empty state,
- folder expand/select,
- new note scans then opens,
- successful open highlights and records Recent,
- cancelled/failed open does not highlight or record Recent,
- search debounce ignores stale results,
- search result opens through the same router,
- missing Recent disabled,
- rename refreshes tree and Recent.

### App integration

- Workspace Markdown click uses DocumentSession dirty prompt,
- Workspace Note click respects current dirty / IME state,
- switching Markdown <-> Note releases old capability exactly once,
- active highlight updates only after apply,
- workspace restore does not replace an unsaved current document unexpectedly.

## Deferred beyond this slice

- full Favorites model,
- real Trash/delete/recovery UX,
- drag-and-drop move,
- multi-select,
- multiple simultaneous Workspaces,
- filesystem watcher,
- SQLite/FTS index,
- tags database,
- backlinks/graph,
- Full HTML Editor,
- Browser Bundle export,
- cross-note managed dependency copy,
- Shared Localized Resource,
- CDN Localization.

These remain in the broader Requirements Matrix and are not removed.

## Implementation strategy

Because the worktree already contains partial Workspace code, implementation must first run its existing Workspace tests and review the current diff. Any existing behavior that already satisfies this spec should be retained and verified rather than rewritten.

The implementation slice should proceed in this order:

1. native Workspace contract/tests,
2. frontend port validation,
3. `useWorkspace` state semantics,
4. App open/switch integration,
5. Sidebar/search/Recent UI,
6. full regression and status-document update.

No format migration is allowed as part of this slice.
