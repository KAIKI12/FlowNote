# FlowNote Requirements Matrix

**Purpose:** Preserve final product requirements across staged implementation.
**Rule:** A Slice may change `Current Status`; it must not silently delete or weaken `Final Requirement`.

Status values:

- `Implemented` — product path exists and has direct verification evidence
- `Partial` — architecture or part of the workflow exists, but requirement is not complete
- `Planned` — final requirement is accepted but not yet implemented
- `Deferred` — accepted requirement intentionally scheduled after the current release target
- `Non-goal` — explicitly excluded by product direction

The matrix is normative for scope tracking. PRD explains product intent; Note Format defines persistence; architecture documents define system boundaries; plans define current implementation sequencing.

## A. Product and document model

| ID | Final Requirement | Persistent/Architecture Reservation | Current Status | Target / Evidence |
|---|---|---|---|---|
| PROD-01 | FlowNote remains Document-first; Markdown is the primary writing axis | `content.md` is linear content source of truth | Implemented | PRD / Format v1 |
| PROD-02 | Pure Markdown remains ordinary `.md` | No FlowNote DB required | Implemented | Markdown file flow verified |
| PROD-03 | Mixed Markdown + HTML uses open `.note` directory package | Format v1 directory | Implemented | Slice 1 real-disk E2E |
| PROD-04 | No Notion-style every-paragraph block model | HTML Block is enhancement, not document base model | Implemented by architecture | Ongoing invariant |
| PROD-05 | Local-first, externally readable and Git-friendly | Text files + directories + relative paths | Partial | Core format implemented; broader asset/export paths remain |
| PROD-06 | No automatic `.note → .md` downgrade | Explicit conversion/export only | Planned/guarded by format | V2 UX |

## B. Markdown editor and fidelity

| ID | Final Requirement | Reservation | Current Status | Target / Evidence |
|---|---|---|---|---|
| MD-01 | WYSIWYG Markdown editing with semantic round-trip | Editor adapter hides Milkdown implementation | Implemented | Markdown Gate PASS WITH PATCHES |
| MD-02 | Complex ordered/unordered nested lists | ProseMirror/Milkdown schema + commands | Implemented | Qualification L01–L12 |
| MD-03 | Unsupported syntax must not silently disappear | Source/read-only protection path | Implemented | Protection suite |
| MD-04 | Frontmatter/WikiLink/footnote/raw HTML/Mermaid/LaTeX source preservation | Source fallback | Implemented | Protection suite |
| MD-05 | Chinese IME safety | Composition-aware editor/session | Implemented for verified current path | Gate + desktop evidence |
| MD-06 | Local Markdown image import/paste with managed persistence | `.md`: sibling `.assets`; `.note`: Note assets | Partial | URL/path insertion exists; managed migration/import remains Slice 2 |
| MD-07 | Mermaid rendering | Source already preserved | Planned | V1.5 |
| MD-08 | LaTeX rendering | Source already preserved | Planned | V1.5 |
| MD-09 | Advanced code highlighting incl. Tcl | Code nodes exist | Partial | Tcl Prism warning remains |

## C. Mixed Note persistence

| ID | Final Requirement | Reservation | Current Status | Target / Evidence |
|---|---|---|---|---|
| NOTE-01 | `content.md` is unique source of body + linear order | Format v1 | Implemented | Slice 1 tests |
| NOTE-02 | `note.json` contains note metadata, not body/order | Format v1 | Implemented | Rust NoteStore |
| NOTE-03 | Stable opaque Block IDs; anchors contain ID only | Format v1 fence | Implemented | HTML tests |
| NOTE-04 | `block.json` contains Block configuration only | Format v1 | Implemented/Extensible | Resource fields still to be added |
| NOTE-05 | Current is `index.html`; Original is `original.html` | Format v1 | Implemented | Slice 1 |
| NOTE-06 | Original means first imported HTML source, not full resource snapshot | Format invariant | Implemented | Save validation rejects Original overwrite |
| NOTE-07 | Duplicate/invalid/missing anchors do not cause silent data loss | Read-only/diagnostic rules | Implemented backend + protection | Rust + HTML tests |
| NOTE-08 | Orphan Block directories are not auto-deleted | Format invariant | Implemented backend | Rust tests |
| NOTE-09 | Unknown future `formatVersion` opens read-only without rewrite/downgrade | Format compatibility | Implemented backend | Rust tests |
| NOTE-10 | Same-Note saves serialize and preserve recoverability on failure | Save queue / recovery directories | Partial/Implemented core | More resource transaction cases later |

## D. HTML Block behavior

| ID | Final Requirement | Reservation | Current Status | Target / Evidence |
|---|---|---|---|---|
| HTML-01 | HTML is first-class content, independently editable/persisted | Block directory | Implemented | Slice 1 |
| HTML-02 | Explicit HTML import; normal paste stays Markdown-first | Explicit import workflow | Implemented | First Block conversion + add-to-existing Mixed Note + save-failure rollback verified in Slice 2 |
| HTML-03 | Fragment and full document both supported internally | `inputKind` | Partial | Metadata exists; broader runtime cases remain |
| HTML-04 | HTML Block renders as isolated iframe at document position | NodeView + sandbox | Implemented | HTML tests |
| HTML-05 | Current source editable without modifying Original | Current/Original split | Implemented | Slice 1 |
| HTML-06 | HTML Block supports Normal/Wide/Full visual widths | Presentation metadata reserved | Partial | UI/polish later |
| HTML-07 | Manual viewport resize + inner scroll + fullscreen | `viewport` config | Partial | Full UI later |
| HTML-08 | HTML visible-text search | Search architecture must not depend only on live DOM | Planned | V1.5 |
| HTML-09 | Runtime state (form/DOM/zoom/tab/etc.) does not persist in Format v1 | Explicit non-persistence rule | Implemented by format/runtime principle | Ongoing invariant |

## E. Resource architecture

| ID | Final Requirement | Persistent/Architecture Reservation | Current Status | Target |
|---|---|---|---|---|
| RES-01 | Markdown managed images live under Note-owned `assets/images/` | Format v1 | Implemented | `.md → .note` copy/rewrite + Note capability runtime rendering verified in Slice 2 |
| RES-02 | Markdown attachments live under Note-owned `assets/attachments/` | Format v1 | Planned | V2 |
| RES-03 | HTML private resources live under `blocks/<id>/assets/**` | Format v1 | Implemented | Native Note capability reader + real-disk reopen/move verified in Slice 2 |
| RES-04 | HTML private CSS/JS/image/SVG/JSON/font/WASM can be addressed by relative path | Resource resolver architecture | Partial | Slice 2 verifies CSS/JS/Image and CSS `url()`; broader resource/API coverage remains V1.5/V2 |
| RES-05 | FlowNote never intentionally creates cross-Block private local dependencies | Ownership invariant | Implemented for private managed resources | Block ID + `assets/**` scope enforced by backend |
| RES-06 | Runtime loader never exposes host absolute paths to iframe | Capability resolver | Implemented for current managed resource paths | Move E2E verifies runtime materialization without host path leakage |
| RES-07 | Runtime URLs (`blob:`, custom protocol, etc.) never persist as managed paths | Format invariant | Implemented for current data-URL materialization | Disk source remains relative after save/reopen/move |
| RES-08 | Note movement preserves all managed references | Relative-path model | Implemented | Whole `.note` moved to new parent and reopened with two Blocks/resources in Slice 2 |
| RES-09 | Note-shared immutable localized resources exist for shared/CDN dependencies | `assets/shared/<resource-id>/` + mapping | Planned | V1.5 |
| RES-10 | Shared localized resource dependencies are explicit in Block metadata | `block.json.resources.localized` | Planned | V1.5 |
| RES-11 | CDN localization can map remote source → local shared managed resource without blindly rewriting Current | Runtime resolver + mapping | Planned | V1.5 |
| RES-12 | Remote resources remain external unless localized | Runtime classification | Partial | Static resolver leaves remote URLs to network policy; localization remains V1.5 |
| RES-13 | Missing local resource produces diagnostic/placeholder, not source deletion | Error model | Implemented for current HTML/Markdown managed resource paths | Runtime error state preserves persisted source |
| RES-14 | Path traversal, symlink escape, cross-Block read and forged capability are rejected | Backend resolver boundary | Implemented for current Note/Markdown managed resource readers | Rust tests include `..`, absolute/backslash, forged capability, cross-Block, external revision and symlink escape |
| RES-15 | CSS nested `url()` and `@import` use same resolver semantics | Runtime resolver | Partial | CSS `url()` is covered; `@import` remains Planned for V1.5 |
| RES-16 | Dynamic relative `fetch()`, module import, Worker/WASM can eventually use resolver without format rewrite | Resolver architecture | Planned | V1.5/V2 |

## F. Network and security

| ID | Final Requirement | Reservation | Current Status | Target / Evidence |
|---|---|---|---|---|
| SEC-01 | Script policy is persisted separately from network permission | `scriptPolicy` vs runtime state | Implemented | Slice 1 |
| SEC-02 | Scripts support `off` and `sandbox`; no vague unsandboxed mode | Block config | Implemented core | Slice 1 |
| SEC-03 | Network is off by default at runtime, not just source scan | iframe CSP/runtime policy | Implemented current static path | HTML tests |
| SEC-04 | “Allow this preview session” is session-only, per current Block/preview | Runtime state only | Planned | V1.5 |
| SEC-05 | Network permission expires on close/restart/source change/preview recreation | Runtime policy | Planned | V1.5 |
| SEC-06 | Note file cannot grant itself trust/network authority | No trust fields with authority | Architecture invariant | Ongoing |
| SEC-07 | HTML cannot access FlowNote/Tauri APIs or arbitrary filesystem | sandbox + capabilities | Partial/Implemented core | Extend with resource resolver tests |

## G. Copy, delete and recovery

| ID | Final Requirement | Reservation | Current Status | Target |
|---|---|---|---|---|
| COPY-01 | Normal HTML Block copy is Deep Copy/value semantics with new ID | Format + product invariant | Implemented | Slice 3 same-note Deep Copy verified |
| COPY-02 | Block-private assets are copied independently | Ownership model | Implemented | Slice 3 same-note Deep Copy copies private assets |
| COPY-03 | Same-note copies may share immutable localized resources | Shared resource architecture | Planned | V2 |
| COPY-04 | Cross-note copy carries required managed shared dependencies | Shared resource manifest | Planned | V2 |
| COPY-05 | No hidden cross-note filesystem dependencies | Ownership invariant | Planned enforcement | V2 |
| DEL-01 | Delete moves content/resources to recoverable FlowNote Trash | Product requirement | Planned | V2 |
| DEL-02 | Delete Anchor first, persist, then resource cleanup/trash; prefer Orphan over dangling Anchor | Save/delete ordering | Partial backend principles | Slice 3 |

## H. External editing and conflict handling

| ID | Final Requirement | Reservation | Current Status | Target |
|---|---|---|---|---|
| EXT-01 | VS Code/Typora/Obsidian/external tools are legitimate access paths | Open files | Implemented for current `.md` / `.note` paths | Slice 3 current scope |
| EXT-02 | Clean external change reloads automatically/subtly | File watcher model | Implemented | Slice 3 Clean auto-reload verified |
| EXT-03 | Dirty + disk changed enters explicit conflict, no last-write-wins | revision/mtime checks | Implemented | Slice 3 Dirty conflict verified |
| EXT-04 | IME composition delays external update application then rechecks version | composition queue | Implemented | Slice 3 IME queue / recheck verified |
| EXT-05 | Shared localized immutable resource external mutation becomes conflict, not normal silent edit | Resource architecture | Planned | V1.5/V2 |

## I. Conversion and migration

| ID | Final Requirement | Reservation | Current Status | Target / Evidence |
|---|---|---|---|---|
| MIG-01 | `.md → .note` is explicit; original `.md` remains untouched | Candidate save-as flow | Implemented for content/HTML | Slice 1 |
| MIG-02 | Managed Markdown images use Copy → rewrite → validate → commit | Format v1 | Implemented | Real-disk conversion copies bytes, rewrites only managed image nodes, validates Note package before commit |
| MIG-03 | Old `.md` asset directory is not auto-deleted after conversion | Migration invariant | Implemented | Real-disk Slice 2 test verifies original `.md` and sibling `.assets` bytes remain |
| MIG-04 | Code/prose absolute paths are not globally rewritten | Managed-reference classifier | Implemented for current managed-image conversion | Prose/code path text remains byte-preserved; unsafe/remote/query/hash refs are not classified managed |
| MIG-05 | Future format migration is explicit and recoverable | `formatVersion` | Partial infrastructure | Future format changes |

## J. Search, reading and presentation

| ID | Final Requirement | Reservation | Current Status | Target |
|---|---|---|---|---|
| VIEW-01 | Edit / Read / Fullscreen are distinct product modes | View architecture | Partial | V2 UI |
| VIEW-02 | Read mode removes editor noise while keeping HTML interactive | Runtime reuse | Planned | V2 |
| VIEW-03 | HTML Block fullscreen supports presentation/defense usage | Runtime reuse | Planned/partial prototype | V2 |
| VIEW-04 | Focus mode hides sidebars for long writing | UI architecture | Planned | V2 |
| SEARCH-01 | Basic search includes title, `content.md`, tags | Search index | Planned | V2 |
| SEARCH-02 | HTML visible text search | Extracted/searchable representation | Planned | V1.5/V2 |
| PRES-01 | HTML-generated deck can fullscreen using own pagination | HTML runtime | Planned | V2 |
| PRES-02 | Note Presentation projects same note content into presentation view | Presentation metadata must not duplicate body | Planned | V2/V2.5 |
| PRES-03 | Speaker Notes / Presenter View build on Note Presentation | Projection architecture | Planned | V2.5 |
| PRES-04 | Future Columns remain presentation/layout metadata; `content.md` keeps semantic linear order | Source-of-truth invariant | Planned | V2.5 |
| VIEW-05 | Normal HTML responds to document/container width; Slide-style HTML can preserve a fixed presentation aspect ratio such as 16:9 | Runtime/view metadata | Planned | V2/V2.5 |
| PRES-05 | Presentation page boundaries are user-defined or source-defined by default; FlowNote must not silently repaginate an authored HTML deck | Presentation projection | Planned | V2 |
| PRES-06 | Note Presentation supports explicit slide ordering, adding/removing slides, per-slide layout and background without duplicating canonical body content | Presentation metadata/projection | Planned | V2.5 |
| PRES-07 | Presenter View includes current slide, speaker notes, next-slide preview and timer | Presenter runtime | Planned | V2.5 |

### Theme / HTML normalization

| ID | Final Requirement | Reservation | Current Status | Target |
|---|---|---|---|---|
| THEME-01 | HTML normalization can map fonts, accent colors, background, radius, shadow, spacing, border and responsive rules into FlowNote design tokens without silently rewriting Original | Runtime/candidate transformation | Planned | V2.5 |
| THEME-02 | External/common fonts can map to FlowNote-local font roles such as body/heading/code while Original source remains recoverable | Theme token layer | Planned | V2.5 |
| THEME-03 | Rule-based CSS parser + design-token mapping is the default normalization path; AI may assist only where semantic classification is needed | Theme adaptation architecture | Planned | V2.5 |

## K. Visual Library and reusable visuals

| ID | Final Requirement | Reservation | Current Status | Target |
|---|---|---|---|---|
| VLIB-01 | Existing HTML Block can be collected into a local reusable Visual Library without modifying the source Note | App-owned library store, source capability read | Completed | V1.1 Slice 1 |
| VLIB-02 | Library item preserves Current HTML, Original HTML, Block config and Block-private managed assets | Visual package ownership | Completed | V1.1 Slice 1 |
| VLIB-03 | Visual Library can be browsed with sandboxed preview, title and basic metadata | Library UI + resource resolver | Completed | V1.1 Slice 1 |
| VLIB-04 | Inserting a library item creates a new independent Block ID and copies owned assets into the target Note | Cross-owner import transaction | Completed | V1.1 Slice 1 |
| VLIB-05 | Library storage is outside Note Format v1 and does not become a second canonical source for note body/order | Storage boundary invariant | Implemented by architecture | Ongoing invariant |
| VLIB-06 | Rename/delete/favorites/tags/search for visuals operate on library metadata, not Note content; delete is recoverable through app-owned Trash | Library metadata layer + recoverable trash | Completed | V1.1 Slice 2 |

## L. Export

| ID | Final Requirement | Reservation | Current Status | Target |
|---|---|---|---|---|
| EXP-01 | Mixed Note Markdown export never silently loses HTML | Explicit export policy | Completed | V1 |
| EXP-02 | “External HTML links” export copies HTML + managed resources into export destination | Resource materializer | Completed | V1 |
| EXP-03 | HTML Browser Bundle works without FlowNote and preserves body/images/Block order/isolation | Export materializer | Completed | V1 |
| EXP-04 | Browser Bundle does not falsely promise single-file or fully-offline unresolved remote deps | Product contract | Completed | V1 |
| EXP-05 | Export uses same resource ownership/resolver semantics, not a separate ad-hoc model | Resource architecture | Completed | V1 |

## M. AI and future visual workflows

| ID | Final Requirement | Reservation | Current Status | Target |
|---|---|---|---|---|
| AI-01 | AI changes Current only through Candidate → Preview → Accept | Original/Current model | Planned | V2/V2.5 |
| AI-02 | AI HTML modifications can include resource delta transaction | Resource architecture | Planned | V2/V2.5 |
| AI-03 | Markdown → visual HTML | HTML Block model | Planned | V2/V2.5 |
| AI-04 | HTML → HTML redesign/fix/update | Candidate model | Planned | V2/V2.5 |
| AI-05 | Theme adaptation is runtime/candidate transformation, not silent Original rewrite | Source/runtime separation | Planned | V2.5 |
| AI-06 | Note → Presentation generation operates on same source content | Projection model | Planned | V2.5 |

## N. Reliability and performance

| ID | Final Requirement | Reservation | Current Status | Target |
|---|---|---|---|---|
| REL-01 | Save failure leaves document Dirty and visible | Session state | Implemented core | Existing tests |
| REL-02 | Same-note saves serialized | Session/NoteStore | Implemented core | Existing tests |
| REL-03 | Save new Block/resources before committing Anchor where applicable | Save ordering | Partial | New Block/resource transactions and same-note Deep Copy covered; delete ordering remains later work |
| REL-04 | Reopen detects missing/duplicate/orphan/temp/partial conversion conditions | Validator | Implemented for current repair scope | Slice 3 Missing/Orphan repair + recovery path verified; final Freeze suite still pending |
| REL-05 | Multiple complex HTML Blocks remain usable without severe degradation | Runtime lifecycle/perf budget | Planned | V2 perf qualification |
| REL-06 | Large JS bundle/code splitting does not become product blocker | Build architecture | Partial | Current main bundle ~819.62 kB warning |

## O. Explicit non-goals / boundaries

| ID | Final Requirement | Current Status |
|---|---|---|
| NG-01 | No unsafe/unsandboxed JavaScript mode | Non-goal |
| NG-02 | No infinite HTML canvas as core editor model | Non-goal |
| NG-03 | No opaque database as canonical note content store | Non-goal |
| NG-04 | No automatic trust inherited from a file | Non-goal |
| NG-05 | No requirement that third-party Markdown editors reproduce FlowNote visual effects | Non-goal |
| NG-06 | No silent auto-downgrade `.note → .md` | Non-goal |

## P. Governance rule for future development

Before starting any implementation Slice:

1. Link the Slice to requirement IDs in this matrix.
2. Mark exactly which IDs move from `Planned → Partial` or `Partial → Implemented`.
3. Do not remove unimplemented IDs merely because they are outside the current Slice.
4. If a product requirement is intentionally removed, update PRD + Matrix with an explicit decision and rationale.
5. If persistence semantics change, update Note Format before or together with implementation.
6. If runtime architecture changes without persistence change, update the architecture design and affected tests.

This matrix is the anti-regression record for product scope.
