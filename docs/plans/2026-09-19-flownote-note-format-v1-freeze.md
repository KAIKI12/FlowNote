# FlowNote Note Format v1 Freeze Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Freeze the current `formatVersion: 1` persistence semantics by turning the Note Format v1.2 Freeze Candidate checklist into a repeatable gate, filling only missing crash/failure evidence, and promoting the format document to Final only after all checks pass.

**Architecture:** Keep the current `.note` directory format unchanged. Reuse the existing Rust `NoteStore`, editor-to-disk integration tests, Markdown protection/qualification suites, and Windows atomic-save tests as the source of truth; add a small dedicated freeze test file for gaps that are format-level rather than UI-level. Do not add migrations, new resource semantics, SQLite, Trash, or any new disk fields.

**Tech Stack:** Rust NoteStore + Windows atomic directory save, React/Milkdown integration harness, Node test runners, Tauri 2.

---

### Task 1: Freeze coverage audit

**Files:**
- Reference: `FlowNote Note Format v1.2 — Freeze Candidate Draft.md`
- Reference: `flownote-app/src-tauri/tests/note_files.rs`
- Reference: `flownote-app/src-tauri/src/windows_note_save_tests.rs`
- Reference: `flownote-app/tests/file-disk.spec.tsx`
- Reference: `flownote-app/tests/protection.spec.tsx`

Map section 52 to concrete tests:

- Normal → real mixed-note disk conversion/reopen test.
- Move → move whole Note directory and reopen.
- Copy → same-note Deep Copy identity/assets.
- External Edit → clean reload + dirty conflict.
- IME → queued external update during composition.
- Invalid Anchor → invalid / duplicate / missing / orphan diagnostics.
- Unsupported Markdown → protection + qualification roundtrip.
- Crash / Failure → add dedicated partial-package/recovery-artifact tests and include Windows atomic-save race/recovery tests.
- Unknown Version → existing native read-only test plus frontend/native protocol coverage.

No production changes in this task.

---

### Task 2: Add a dedicated native Format Freeze suite

**Files:**
- Create: `flownote-app/src-tauri/tests/format_freeze.rs`
- Modify: `flownote-app/package.json`
- Create: `flownote-app/tests/run-format-freeze.mjs`

Add a `test:format-freeze` command that runs:
1. native `format_freeze` tests,
2. `note_files` native suite,
3. editor-to-disk suite,
4. protection suite.

The gate should stop on first failing child command and preserve its exit code.

---

### Task 3: RED — partial package must be recognized without data deletion

**Files:**
- Test: `flownote-app/src-tauri/tests/format_freeze.rs`
- Modify only if RED exposes a bug: `flownote-app/src-tauri/src/note_format.rs`

Create a valid Note, then simulate half-created Block states such as:
- anchor + block directory with only `block.json`,
- anchor + `block.json` + `index.html` but missing `original.html`.

Verify:
- open/reload succeeds in read-only safe mode,
- diagnostic is present,
- existing readable content remains available,
- the incomplete directory/files are not removed or rewritten,
- save is refused.

Run the focused test and require RED before any production change. If it already passes, record it as existing compliant behavior and do not change production code.

---

### Task 4: RED — recovery temp artifacts must not be auto-deleted

**Files:**
- Test: `flownote-app/src-tauri/tests/format_freeze.rs`
- Modify only if RED exposes a bug: Note open/scan code.

Create a valid Note and add sibling recovery artifacts matching FlowNote's real naming pattern:
`.<note>.flownote-current-<uuid>.tmp`
and/or a recovery directory.

Verify:
- opening the original Note still succeeds,
- the temp/recovery artifact remains byte-for-byte present,
- normal reopen never treats the artifact as authoritative without user action,
- no automatic cleanup occurs.

---

### Task 5: RED — failed atomic Note save keeps both original and recovery data

**Files:**
- Prefer test extension: `flownote-app/src-tauri/src/windows_note_save_tests.rs`
- Add a format-level assertion in `format_freeze.rs` only if public APIs can reproduce the condition.

Use the existing staged-conflict observer seam to force failure after staging. Verify:
- original Note remains unchanged and reopenable,
- error exposes a recovery path,
- recovery path contains the intended local `content.md` and required metadata,
- recovery data is not silently deleted.

No format migration or auto-repair.

---

### Task 6: Unknown future version freeze

**Files:**
- Test: `flownote-app/src-tauri/tests/format_freeze.rs`
- Existing: `flownote-app/src-tauri/tests/note_files.rs`

Verify a `formatVersion: 999` package:
- opens read-only,
- original `note.json` and `content.md` stay unchanged,
- save fails,
- save-as fails,
- no downgrade to 1,
- unknown fields remain on disk.

---

### Task 7: Run the Format Freeze gate

**Commands:**
- `npm run test:format-freeze`
- focused native tests for any newly added cases.

If all freeze categories are GREEN, proceed to document promotion. If a RED reveals a real format bug, implement the smallest fix and re-run the focused test before the full gate.

---

### Task 8: Full regression and release verification

**Commands:**
- `npm run test:workspace`
- `npm run test:stage-one`
- `npm run test:protection`
- `npm run test:qualification`
- `npm run test:files`
- `npm run test:files:disk`
- `npm run test:html`
- `npm run test:desktop`
- `cargo test --offline --manifest-path src-tauri/Cargo.toml -- --test-threads=1`
- `cargo clippy --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `npm run build`
- `npm run tauri:build`
- `git diff --check`

---

### Task 9: Promote the format document to Final

**Files:**
- Modify: `FlowNote Note Format v1.2 — Freeze Candidate Draft.md`
- Modify: `flownote-app/STATUS.md`
- Modify: `flownote-app/CHECKLIST.md`

Only after all fresh verification passes:
- change document status from `Draft / Freeze Candidate` to `Final`,
- keep disk `formatVersion: 1`,
- add a freeze verification note/date,
- mark Format Freeze checklist items completed,
- retain deferred features unchanged.

Do not rename or delete historical files automatically because the repository has extensive pre-existing uncommitted work.
