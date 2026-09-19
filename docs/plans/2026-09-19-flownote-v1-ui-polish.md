# FlowNote V1 UI Polish

## Goal

Finish the V1 desktop shell without changing the document-first Markdown interaction model.

## Completed scope

- Auto / Light / Dark theme preference with live system-theme following and persistent explicit overrides.
- Light/dark design tokens aligned to the approved `E:\flownote-desktop-ui-design` reference.
- Markdown remains a continuous directly editable surface; no click-to-edit paragraph blocks or editor focus frame.
- `Ctrl/Cmd+K` now focuses the real Workspace search field.
- Removed non-functional Tags / Trash placeholders from the V1 sidebar while keeping those requirements in the roadmap.
- Improved no-workspace, empty-workspace, empty-search, success and error states.
- Verified real Light/Dark pages with 1440x960 headless Chrome screenshots; QA artifacts were removed after inspection.
- Release executable startup smoke passes; MSI and NSIS bundles build successfully.

## Verification baseline

- Stage One: 64 / 64
- HTML: 15 / 15
- Workspace Frontend: 8 / 8
- Protection: 38 / 38
- Qualification: 36 / 36
- Files: 18 / 18
- Real disk: 18 / 18
- Browser Bundle file://: PASS
- Markdown Export file://: PASS
- Desktop UI: 12 / 12
- Desktop IPC: 12 / 12
- Rust: 93 passed / 1 expected ignored
- Clippy: PASS
- Production build: PASS
- Tauri MSI / NSIS: PASS
- Release exe startup smoke: PASS

## Remaining V1 release work

Real installer lifecycle verification remains separate: MSI / NSIS install, uninstall, upgrade behavior, and release-version packaging metadata.
