# FlowNote Workspace Trash & Direct Actions — Design

**Date:** 2026-09-26
**Status:** Approved continuation of the V1.1 usability pass

## Goal

Make FlowNote's Files sidebar behave like a real local desktop note app: file removal must be recoverable, row actions must map to concrete capabilities, and adding an HTML Visual must not require understanding internal `.note` / Block terminology.

## Design choices

### 1. Workspace-local hidden Trash

Use a hidden directory at the bound Workspace root:

```text
.flownote-trash/
  <trash-id>/
    metadata.json
    payload
```

Each trash record stores a small versioned metadata object:

- `version: 1`
- opaque `id`
- `originalRelativePath`
- original `name`
- `kind` (`markdown`, `note`, `folder`)
- `deletedAtMs`

The original file/package/folder is moved atomically into the record's `payload` path. This keeps delete local-first, recoverable, and portable with the Workspace itself.

The existing Workspace scanner/search already ignores dot-prefixed paths, so `.flownote-trash` remains outside Files, Recent cleanup, and search.

### 2. Restore semantics

Restore always targets the original relative path.

- If the original parent directory still exists and the target path is free, move the payload back and remove the trash record.
- If the original parent no longer exists, return an explicit conflict/error instead of silently inventing a new location.
- If the original target path is occupied, return a conflict. Do not auto-rename.
- A restored item does not automatically become Recent or active.

This keeps restore predictable and avoids hidden path changes.

### 3. Permanent delete

Permanent delete exists only inside the Trash view.

- Markdown: remove file.
- FlowNote `.note`: recursively remove package.
- Folder: recursively remove the trashed folder, because recovery is no longer requested and the object is already isolated inside the Trash record.
- Remove the containing trash record afterward.

The UI requires an explicit second confirmation for permanent delete. There is no `Empty Trash` bulk action in this slice.

### 4. Native API

Replace the current destructive `workspace_delete` path in the active UI with explicit Trash APIs:

- `workspace_trash({ relativePath }) -> WorkspaceTrashItem`
- `workspace_trash_list() -> WorkspaceTrashItem[]`
- `workspace_trash_restore({ id }) -> WorkspaceMutation`
- `workspace_trash_delete({ id }) -> ()`

`WorkspaceTrashItem` contains only metadata required by UI; it never exposes host absolute paths.

The old direct-delete implementation can be removed once all frontend callers/tests migrate.

### 5. Files sidebar UX

Add a fourth Workspace tab: **Trash**.

Files tree row menu:
- Markdown / Note: Rename, Move to Trash.
- Folder: New Note Here, Rename, Move to Trash.

Right-click opens the exact same menu. No duplicated behavior.

Move to Trash keeps a lightweight confirmation, with recoverability stated in the copy. If the entry contains the active document, the existing DocumentSession close/dirty/IME flow must resolve first; cancel means nothing is trashed.

Trash view:
- compact list, not cards;
- show name, original relative path, deleted date/type;
- Restore action;
- Permanently Delete action with inline second confirmation;
- refreshes automatically after trash / restore / permanent delete.

Trash actions are disabled while another Workspace mutation is in flight.

### 6. Add Visual UX

Keep the current sandboxed HTML Visual storage pipeline and plain-text standalone HTML paste behavior. Change only the primary interaction language:

- Header button: **Add Visual** rather than “导入 HTML”.
- Form title/ARIA: **Add HTML Visual**.
- Textarea placeholder: “Paste HTML source here…”.
- Submit: **Add Visual** for an existing Mixed Note; **Create Visual Note** when the current Markdown must first convert to a `.note`.
- Add a short hint: “You can also paste complete HTML source directly into the document.”

Do not surface `Block ID`, `content.md`, or package internals in this primary path.

### 7. Safety and compatibility

- `.flownote-trash` is inside the Workspace but hidden from normal scanner/search using existing dot-directory rules.
- All Trash IDs are opaque and validated; callers never provide Trash filesystem paths.
- Restore/permanent delete resolve only through metadata records under the current bound Workspace Trash directory.
- Symlink/traversal protections remain in force for the source entry before it is moved to Trash.
- Note Format v1 is unchanged; Trash metadata is Workspace-management state, not Note metadata.
- Visual Library's separate app-owned Trash remains unchanged; Workspace Trash manages real Workspace entries only.

## Testing

### Native
- Markdown / `.note` / non-empty folder can move to Trash.
- Trash list returns metadata and normal scan/search excludes trashed data.
- Restore returns to the exact original path.
- Restore rejects path collision and missing original parent without losing the trash payload.
- Permanent delete removes payload and record.
- Traversal / unknown Trash ID is rejected.

### Frontend
- Native port request/response validation for list/trash/restore/permanent delete.
- Row context menu exposes New Note Here where appropriate and Move to Trash.
- Dirty/IME active document still gates a containing trash operation.
- Trash tab lists items, restores, and confirms permanent delete.
- Direct Add Visual copy/labels remain backed by the existing HTML import pipeline.

## Out of scope

- Empty Trash bulk operation.
- Restore-to-custom-location.
- Scheduled Trash cleanup / retention policy.
- Drag-and-drop move/rename.
- OS Recycle Bin integration.
- Multi-select bulk file operations.
