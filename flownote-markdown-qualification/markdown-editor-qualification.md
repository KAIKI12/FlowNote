# FlowNote Markdown Editor Qualification v0.1

**Purpose:** Decide whether Milkdown is qualified to remain the Markdown editor core for FlowNote V1.

**Scope:** This gate validates Markdown editing behavior, round-trip reliability, IME safety, and preservation of unsupported syntax. It does **not** validate HTML Block, `.note`, sandbox, export, or presentation.

---

## 1. Decision Rule

Milkdown is accepted as the FlowNote V1 editor core only if all **P0 / Gate** cases pass.

### Severity

- **P0 / Gate**: Failure means Milkdown should not be bound deeper into FlowNote before the problem is solved or the editor is replaced.
- **P1**: Important product quality issue; may be fixable through plugins, schema, commands, styling, or adapters.
- **P2**: Visual or convenience issue; does not block V1.

### Failure Definition

A test fails when any of the following happens without an explicit safe fallback:

- Content disappears.
- List hierarchy changes semantically.
- Ordered and unordered list types are incorrectly converted.
- Editing one area unexpectedly modifies unrelated Markdown.
- Unsupported syntax is silently dropped.
- Chinese IME composition is interrupted or corrupted.
- Save/reopen changes document semantics.
- Cursor or selection becomes unusable in normal editing operations.

Pure formatting normalization is **not** necessarily a failure. FlowNote V1 guarantees semantic round-trip, not byte-for-byte source fidelity.

---

## 2. Mandatory Observation Layers

For every test, inspect all four layers:

1. **Input Markdown**
2. **Milkdown visual result**
3. **Editor / ProseMirror document structure**, where useful
4. **Serialized Markdown after save**

Do not judge only by appearance.

Recommended workflow:

```text
fixture.md
   ↓
Open in FlowNote
   ↓
Visual inspection
   ↓
Perform required edits
   ↓
Save
   ↓
Close
   ↓
Reopen
   ↓
Export / inspect Markdown
   ↓
git diff --no-index original.md saved.md
```

---

## 3. Pass Criteria Summary

| ID | Test | Priority | Pass requirement |
|---|---|---:|---|
| L01 | Basic unordered list | P0 | Structure and content preserved |
| L02 | 5-level unordered nesting | P0 | All levels preserved |
| L03 | 5-level ordered nesting | P0 | All levels preserved |
| L04 | Ordered → Bullet → Ordered | P0 | List types and levels preserved |
| L05 | Bullet → Ordered → Bullet | P0 | List types and levels preserved |
| L06 | Tab / Shift+Tab | P0 | Sink/lift behavior correct |
| L07 | Enter / Backspace | P0 | Normal list editing behavior |
| L08 | List inline formatting | P0 | Bold/link/code preserved |
| L09 | Multi-block list item | P0 | Paragraph/code/list remain inside item |
| L10 | Blockquote + list | P0 | Nesting preserved |
| L11 | Image inside list | P0 | Image remains associated with correct item |
| L12 | Task + normal list | P1 | Structure stable |
| R01 | Open-save-no-edit | P0 | No semantic change; diff reasonably small |
| R02 | Edit-one-item | P0 | No unrelated semantic changes |
| R03 | Unknown fenced block | P0 | Preserved verbatim or safe fallback |
| R04 | YAML frontmatter | P0 | Preserved or safe fallback |
| R05 | Raw HTML | P0 | Preserved; does not become executable FlowNote HTML Block |
| R06 | WikiLink / custom syntax | P0 | Preserved or safe fallback |
| R07 | Footnotes | P1 | Preserve if unsupported |
| R08 | Mermaid / LaTeX source | P0 | Not silently deleted even if V1 does not render it |
| I01 | Chinese IME paragraph edit | P0 | No lost/duplicated characters |
| I02 | Chinese IME list edit | P0 | No cursor jumps / broken composition |
| P01 | Rich text paste | P1 | Normal paste stays Markdown-oriented |
| P02 | Paste nested list | P0 | Hierarchy remains correct |
| P03 | Paste code into list | P1 | Code remains in expected list item |

---

# 4. Test Procedure

## Phase A — Read-only round-trip

For every fixture:

1. Copy fixture to a temporary working file.
2. Open it in FlowNote.
3. Do **not** edit.
4. Save.
5. Close the note.
6. Reopen.
7. Compare the saved Markdown with the original.

Record:

- Semantic changes
- Formatting-only changes
- Missing syntax
- Unexpected normalization

### Required result

P0 fixtures must not lose content or semantics.

---

## Phase B — Active editing

Use `01-lists-basic.md`, `02-lists-deep.md`, `03-lists-mixed.md`, and `04-list-block-content.md`.

Perform:

- `Tab`
- `Shift+Tab`
- `Enter`
- `Backspace`
- Split list item
- Merge list item
- Add inline bold
- Add inline code
- Paste text
- Add Chinese text with IME

Then save, close, reopen, and inspect the Markdown.

---

## Phase C — Unsupported syntax preservation

Use `05-unsupported-syntax.md`.

Do not require Milkdown to visually understand every syntax form.

The pass requirement is:

> Unsupported syntax must remain recoverable.

Acceptable behaviors:

1. Preserve as an opaque/raw node.
2. Open in source-only mode.
3. Mark the note read-only until the user switches to source mode.

Unacceptable behavior:

> Silently rewrite or delete content it cannot represent.

---

## Phase D — IME

Use Microsoft Pinyin or the user's normal Chinese IME.

Test strings:

```text
时钟树优化需要同时考虑 setup、hold 和 OCV。
地月空间链路调度需要考虑业务优先级和链路可见窗口。
```

During composition:

- Type quickly.
- Select candidates.
- Edit within a nested list.
- Press Enter to create a new list item.
- Use Backspace.
- If file watching is already implemented, trigger an external file update while composition is active.

Pass:

- No lost characters
- No duplicated characters
- No unexpected cursor jump
- No list hierarchy corruption

---

# 5. List Qualification

## L01 Basic unordered list

Expected:

```markdown
- A
- B
- C
```

Operations:

- Enter after B
- Add D
- Delete D

Pass: final structure remains A/B/C.

---

## L02 Deep unordered nesting

Use five levels.

Pass:

- All levels display distinctly enough to edit.
- Serialized Markdown maintains the same hierarchy.
- Exact bullet marker (`-`, `*`, `+`) may normalize.

---

## L03 Deep ordered nesting

Pass:

- Hierarchy survives.
- Ordered list remains ordered at each intended level.

Different visual numbering styles are **not** a Gate failure.

For example, displaying all levels as decimal is a styling issue if hierarchy is still correct.

---

## L04 / L05 Mixed list nesting

These are critical FlowNote tests.

The editor must correctly round-trip combinations such as:

```markdown
1. CPU
   - Frontend
     1. Fetch
     2. Decode
   - Backend
     - ALU
     - LSU
2. GPU
```

and the inverse bullet → ordered → bullet structure.

---

# 6. Complex List Item Qualification

A Markdown list item may contain more than one paragraph.

The editor must not assume:

```text
list_item = one line of text
```

It must safely handle:

```markdown
1. Step

   Second paragraph.

   ```tcl
   report_timing
   ```

   - Child A
   - Child B

2. Next
```

This is one of the strongest qualification cases.

---

# 7. Round-trip Policy

FlowNote V1 should explicitly guarantee:

> Semantic Markdown round-trip for supported syntax.

It should **not** promise:

> Byte-for-byte Markdown preservation.

Allowed normalization may include:

- `*` → `-`
- whitespace normalization
- ordered list numbering normalization
- equivalent fenced-code formatting

Not allowed:

- losing hierarchy
- converting ordered lists into unordered lists
- moving blocks outside their list item
- removing unsupported syntax
- silently executing raw Markdown HTML as a FlowNote HTML Block

---

# 8. Unsupported Syntax Policy

FlowNote must distinguish:

```text
Unsupported but preservable
```

from:

```text
Unsupported and destructive
```

If Milkdown cannot safely represent a syntax, the FlowNote adapter should prefer:

```text
Raw Node
Source Mode
Read-only protection
```

over destructive conversion.

---

# 9. Suggested Debug Checklist

When a list appears wrong, check in this order:

```text
1. Source Markdown
2. Parsed AST / ProseMirror structure
3. Rendered DOM
4. CSS marker / padding / margin
5. Editor command behavior
6. Serialized Markdown
```

A visual nesting problem may only be CSS.

A serialization problem is much more serious.

---

# 10. Scorecard

Recommended weighted score:

| Area | Weight |
|---|---:|
| Markdown round-trip / fidelity | 30% |
| Complex list behavior | 20% |
| Unsupported syntax preservation | 15% |
| Chinese IME | 10% |
| Custom FlowNote node extensibility | 10% |
| Paste behavior | 5% |
| Images | 5% |
| Maintenance / API stability | 5% |

### Decision

- **PASS**: all P0 cases pass and weighted score ≥ 85%.
- **PASS WITH PATCHES**: all data-safety P0 cases pass, but UX/CSS/commands require FlowNote-specific fixes.
- **FAIL**: any repeatable P0 case causes data loss, semantic corruption, or unusable IME behavior with no practical adapter-level fix.

---

# 11. Important Interpretation

Do **not** reject Milkdown merely because:

- nested ordered lists all use decimal markers;
- indentation looks visually weak;
- default CSS is unattractive;
- toolbar behavior needs customization;
- default Crepe interactions are not Typora-quality.

Those are fixable product-layer issues.

Consider replacing Milkdown when failures occur in:

```text
Markdown fidelity
AST capability
Serializer correctness
IME correctness
unsupported syntax preservation
```

These are architectural risks.

---

# 12. Gate Outcome Template

After testing, create:

```text
docs/markdown-editor-qualification-result.md
```

and record:

```markdown
# FlowNote Markdown Editor Qualification Result

Editor: Milkdown
Version:
Date:

## Result

PASS / PASS WITH PATCHES / FAIL

## P0 Failures

None / ...

## Required FlowNote patches

1.
2.
3.

## Known accepted limitations

1.
2.

## Decision

Milkdown is / is not approved as the FlowNote V1 Markdown editor core.
```
