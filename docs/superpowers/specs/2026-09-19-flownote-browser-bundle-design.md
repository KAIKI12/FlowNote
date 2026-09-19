# FlowNote V1 Browser Bundle Export Design

## Status

Direction selected in the current V1 finishing discussion: **native export materializer + frontend document renderer**.

This design covers only **Browser Bundle export**. Mixed Markdown export is intentionally kept as the next export sub-slice so both paths can reuse the same resource materialization rules instead of creating two independent export systems.

## Goal

Export a Mixed Note into a normal directory that can be opened without FlowNote while preserving:

- current Markdown body content,
- managed Markdown images/resources,
- HTML Block order,
- current HTML for each referenced Block,
- Block-private resources,
- HTML sandbox/script-policy behavior,
- a readable copy of the current Markdown source.

The export must not claim:

- single-file HTML,
- fully-offline behavior for unresolved remote/CDN dependencies,
- compatibility for every server-dependent script under `file://`,
- support for resource types FlowNote itself does not yet resolve.

The Browser Bundle must reuse the existing Note/resource ownership model. It must not invent an export-only resource database or hidden dependency system.

## Product contract

The V1 output is a directory, for example:

```text
Timing-export/
├─ index.html
├─ content.md
├─ assets/
│  └─ images/
│     └─ ...
└─ blocks/
   ├─ <block-id-A>/
   │  ├─ index.html
   │  └─ assets/
   │     └─ ...
   └─ <block-id-B>/
      ├─ index.html
      └─ assets/
         └─ ...
```

A user must be able to open `index.html` directly in a browser and read the note without FlowNote.

The bundle is not a FlowNote `.note` clone:

- no `note.json`,
- no `block.json`,
- no `original.html`,
- no repair metadata,
- no hidden FlowNote capability data.

It is a presentation/export projection of the current note, not another persistence source of truth.

## Existing invariants reused

The Browser Bundle must preserve the current architecture:

1. `content.md` is the linear Markdown/body source.
2. HTML Block IDs and order come from the document body.
3. Current HTML is exported; Original is provenance and is not exported as visible content.
4. Note-managed resources remain Note-owned.
5. Block-private resources remain owned by exactly one Block.
6. Runtime/network trust is never persisted as authority.
7. Host absolute paths are never written into export HTML.
8. A resource/capability conflict must fail visibly rather than silently mix versions.

## Architecture decision

### Selected: frontend renderer + native materializer

```text
Current editor / in-memory Mixed Note
        |
        | latest Markdown + Current HTML
        v
Frontend BrowserBundleRenderer
  - semantic document HTML
  - HTML Block iframe placeholders
  - export sandbox policy
        |
        | BrowserBundleRequest
        v
Native Note export materializer
  - verify bound Note + revision
  - validate current source / block identities
  - copy Note-managed resources
  - copy referenced Block-private resources
  - write current content.md
  - write current Block index.html documents
  - stage directory
  - publish by atomic directory rename
        |
        v
<note>-export/
```

The frontend owns **rendering semantics** because the current editor/Milkdown/ProseMirror document already knows the visual Markdown structure.

The native layer owns **filesystem trust and materialization** because it already owns:

- the bound Note capability,
- revision checks,
- Windows path validation,
- symlink/escape protection,
- source resource reads,
- safe directory publication.

### Rejected: frontend-only export

A frontend-only implementation could download/generated files quickly, but it would duplicate resource traversal and path validation and would not have the same Windows/capability guarantees as the Note backend.

### Rejected: all-native Markdown rendering

Moving Markdown rendering into Rust would create a second Markdown rendering implementation and risk divergence from the editor. Native should materialize files, not reinterpret FlowNote's current editor document.

## Export source-of-truth rules

### Markdown

Export uses `editorRef.current.getMarkdown()` at invocation time.

Therefore a dirty note may export its **latest local Markdown**, not merely the last saved disk version.

Export does not implicitly save the Note.

### Current HTML

Export uses the current in-memory `MixedNoteData.blocks[].html`.

This means Quick Edit changes that are already applied to the live Note can be exported even before Ctrl+S.

An unsaved Full HTML Editor modal draft is not part of the live Note and therefore is not exported. The user must Save or Cancel that modal first.

### Resources

Managed resources are materialized only from the currently bound Note capability and its accepted revision.

If the source package changed externally, the resource snapshot is not silently mixed with local body content.

## Dirty / IME / conflict behavior

Browser Bundle export is allowed when the Note is dirty, provided the bound resource revision is still valid.

It is rejected when:

- IME composition is active,
- another Note operation is busy,
- no Mixed Note is bound,
- the Note is read-only/future-version,
- an external-conflict state is active,
- the source revision no longer matches during materialization,
- a referenced Block is missing/duplicate/invalid,
- required managed resources cannot be read safely.

Failure leaves both the Note and any pre-existing export destination unchanged.

## Browser document rendering

The frontend gets a dedicated export renderer rather than reusing the visible editor DOM directly.

The renderer operates from the current ProseMirror document when the editor is in visual mode.

For normal Markdown nodes it produces semantic browser HTML:

- headings,
- paragraphs,
- lists/tasks,
- blockquotes,
- tables,
- code/pre,
- links,
- emphasis/strong,
- images.

Editor-only chrome, selection markers, NodeView controls, toolbars and Inspector state are never exported.

### HTML Block nodes

Each current HTML Block node becomes an iframe wrapper in the root `index.html`.

Conceptually:

```html
<section class="flownote-html-block flownote-html-block--wide">
  <iframe
    src="./blocks/<id>/index.html"
    sandbox="allow-scripts"
    referrerpolicy="no-referrer"
    loading="lazy">
  </iframe>
</section>
```

The actual `sandbox` attribute depends on the Block script policy:

- `scriptPolicy: off` -> no `allow-scripts`,
- `scriptPolicy: sandbox` -> `allow-scripts`.

Block height uses the current validated viewport height.

Width uses the current document node width (`normal | wide | full`) for the export layout.

HTML Block order is therefore inherited directly from the current document, not reconstructed from the `mixed.blocks` array.

## Protected / unsupported Markdown

FlowNote must not force protected Markdown through a lossy rich-text parser merely to produce an attractive export.

When the editor is currently source-protected:

1. `content.md` is still exported byte-for-byte from the current logical Markdown source.
2. `index.html` shows an escaped readable source presentation for the protected Markdown instead of pretending a complete semantic render was possible.
3. A small neutral notice may state that the source contains syntax FlowNote intentionally did not render in the Browser Bundle.
4. HTML Block references that cannot be safely resolved from the protected representation are not guessed.

This is a fidelity fallback, not an error.

V1 prioritizes "never silently lose source" over incomplete third-party Markdown extension rendering.

## Root index.html

The root file is generated by FlowNote and contains:

- UTF-8 document metadata,
- note title,
- a small self-contained FlowNote export stylesheet,
- the rendered body,
- no FlowNote application runtime,
- no remote UI framework dependency.

The export shell CSS may be inline because it is FlowNote-owned presentation code, not a user-managed asset.

The root page itself does not need JavaScript for V1.

## Block index.html materialization

Each referenced Block gets a standalone export document at:

```text
blocks/<id>/index.html
```

The document is generated from the **Current** HTML and an export CSP.

The export policy mirrors the app's security intent while allowing local managed files.

### Script policy off

Scripts are disabled.

### Script policy sandbox

Scripts may run inside the sandboxed iframe.

### Network

Network remains off by default.

The generated Block document must add a restrictive CSP that permits only the local/export resources required by the current FlowNote resource model, such as:

- local/self CSS,
- local/self script only when script policy allows,
- local/self images/media/fonts,
- data/blob where already required by supported runtime behavior,
- `connect-src 'none'`,
- no remote `http:` / `https:` sources,
- no frames/objects,
- no form submission,
- no base URL rewriting.

Remote/CDN references that were never localized remain blocked in the Browser Bundle.

The implementation must include a real browser/file-origin qualification for ordinary relative CSS, classic JS and images under `file://` with the generated CSP. If the target browser blocks a supported managed local resource under that policy, the exporter must adjust export materialization rather than weaken network isolation or claim success from file-existence tests alone. ES modules, `fetch()`, Worker/WASM and other server-like behaviors remain outside this V1 guarantee.

The bundle may show the same missing-resource behavior a browser naturally produces. It must not label such a bundle "fully offline".

## Resource materialization

### Note-managed resources

V1 copies the bound Note's managed `assets/**` tree into the export `assets/**` tree.

Copying the managed tree rather than only currently parsed image nodes is intentional:

- protected Markdown may contain references the visual parser did not inspect,
- future attachments/shared-localized resources remain Note-owned,
- export does not create broken references by over-pruning.

This copies managed Note resources only, not arbitrary sibling files.

### Block-private resources

For each Block referenced by the current document, copy:

```text
blocks/<id>/assets/**
```

to the same relative location in the export.

Do not copy:

- orphan Block directories,
- `original.html`,
- `block.json`,
- another Block's private assets.

The current HTML keeps its human-readable relative references such as `./assets/style.css`.

No runtime data URL or host absolute path is persisted into the bundle merely because the in-app preview used one.

## Native request contract

The frontend should send a bounded request similar to:

```text
BrowserBundleRequest
├─ note capability id
├─ expected revision
├─ title
├─ current content.md
├─ root index.html
└─ referenced blocks
   ├─ id
   └─ export index.html
```

The native layer derives source resource locations from the bound Note. The frontend never sends host paths.

The request must be strictly validated:

- known fields only,
- valid Block IDs,
- no duplicate referenced IDs,
- every requested Block exists in the bound Note and current Mixed Note,
- referenced Block identities match the current document,
- content size limits remain bounded,
- generated HTML size limits remain bounded.

## Destination UX

V1 Browser Bundle uses a directory export, not a file download.

Recommended flow:

1. user chooses a parent directory,
2. FlowNote proposes/creates `<safe-note-title>-export`,
3. export refuses to overwrite an existing directory,
4. the user can choose another parent/name and retry.

V1 does not recursively overwrite an existing export directory.

This avoids ambiguous partial replacement and makes failure/retry semantics simple.

## Atomic export publication

The native layer writes into a sibling temporary directory first.

```text
parent/
├─ .Timing-export.flownote-tmp-<uuid>/
└─ Timing-export/       # absent until publication
```

Only after all validation, generated files and managed resource copies succeed does FlowNote rename the staged directory to the final export path.

On failure:

- the final destination remains absent/unchanged,
- the temporary directory is removed when safely possible,
- the original Note is never modified.

The export command must not reuse Note-save semantics that would mutate the Note binding/revision.

## Missing resources and diagnostics

If a required managed resource is missing or unsafe:

- export fails visibly,
- no final bundle is published.

V1 does not silently omit a local managed asset and still report success.

Unresolved **remote** URLs are different:

- they are not fetched,
- they remain blocked by the export CSP,
- export may complete with an informational notice that remote dependencies were not localized.

## Security invariants

The materializer must reject:

- `..` traversal,
- absolute paths,
- backslash/drive/colon/NUL path bypasses,
- symlink escapes,
- forged Note capabilities,
- stale revisions,
- cross-Block private resource reads,
- duplicate Block export targets,
- unexpected writes outside the selected export directory.

The browser output must not contain FlowNote host absolute paths.

## UI integration

The existing File actions area gains:

- `Export Browser Bundle`

The action is available for a bound Mixed Note.

The existing `Export Markdown` action remains separate and keeps its current guarded behavior until the Markdown Export sub-slice is implemented.

V1 does not introduce an export wizard for Browser Bundle because there are no format choices in this slice.

Success notice should identify the created export folder.

Errors use the existing visible file/note error surface rather than alerts hidden inside the editor.

## Relationship to Markdown Export

Browser Bundle is implemented first because it establishes the reusable materializer boundary.

The subsequent Mixed Markdown export must reuse the same native export service for:

- destination validation,
- resource copying,
- Block-private asset materialization,
- staging/publication,
- conflict handling.

Markdown Export may choose among source/embed/external-link policies, but it must not create a second ad-hoc filesystem copier.

## Testing obligations

### Frontend renderer

Tests must verify:

1. normal Markdown becomes semantic export HTML without editor chrome,
2. HTML Block order follows the document,
3. Block width/height and script policy become export iframe metadata,
4. protected/source-only Markdown uses the source-fidelity fallback,
5. current unsaved Markdown and Current HTML are used.

### Native materializer

Tests must verify:

1. output layout is exactly rooted under the chosen export directory,
2. `content.md` is the current request content,
3. Note-managed assets are copied,
4. only referenced Block-private assets are copied,
5. Current Block HTML is written, Original is not exported,
6. malformed/duplicate/wrong Block requests are rejected,
7. stale revision/external mutation is rejected,
8. traversal/symlink/colon/NUL escape attempts are rejected,
9. existing destination is not overwritten,
10. failure before publication leaves no final partial bundle.

### App integration

Tests must verify:

1. Browser Bundle action is enabled only for eligible Mixed Notes,
2. IME/busy/conflict/read-only states block export,
3. dirty local body/Current can export without implicitly saving,
4. export failure leaves Note state/Dirty unchanged,
5. success leaves Note state/Dirty unchanged and reports destination.

### Real disk

A real-disk integration test must:

1. create/open a Mixed Note with Markdown image + at least two HTML Blocks,
2. make a local unsaved Markdown/Current edit,
3. export Browser Bundle,
4. inspect `index.html`, `content.md`, copied Note assets and Block-private assets,
5. confirm Block order,
6. confirm Original/provenance files are absent,
7. confirm source Note bytes/revision are unchanged.

## V1 acceptance criteria

Browser Bundle is complete when:

- a Mixed Note exports to a normal directory,
- `index.html` opens without FlowNote,
- current Markdown body is present,
- managed images are available,
- referenced HTML Blocks appear in body order,
- each Block loads its copied private resources,
- Block sandbox/script/network behavior is explicit,
- current dirty Markdown/Current can be exported without saving the Note,
- protected Markdown never silently loses source,
- remote dependencies are not falsely advertised as localized/offline,
- source Note data is not modified,
- failed exports do not publish partial final directories.

## Explicit non-goals for this slice

Not included:

- Mixed Markdown export policy UI,
- single-file HTML,
- ZIP packaging,
- automatic CDN download/localization,
- exporting orphan Blocks,
- rewriting remote URLs,
- server-backed preview host,
- PDF export,
- asset deduplication,
- binary asset editing,
- Shared Localized Resource implementation beyond preserving/copied Note-managed files that already exist.
