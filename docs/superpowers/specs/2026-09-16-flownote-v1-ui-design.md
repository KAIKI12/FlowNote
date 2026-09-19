# FlowNote V1 UI / UX Design

## Status

Approved for first-wave prototype implementation on 2026-09-19.

## Product intent

FlowNote is a document-first desktop Markdown note application. The document remains the primary object and Markdown remains a continuous editable surface. HTML Visuals are the only explicitly object-like blocks in the document flow.

The target product feeling is:

- quiet like Typora during writing,
- flexible like Obsidian during management,
- visually refined like Craft / Capacities,
- precise like Linear in spacing and states,
- distinctively FlowNote when presenting HTML Visual content.

The UI must not introduce a Notion-style per-paragraph block mental model.

## Core interaction model

### Markdown

Markdown is continuously editable in Edit and Focus modes. Users click directly into text and type. There is no "select Markdown block" or "enter Markdown edit mode" interaction.

Read mode uses the same document content with editing disabled and editing chrome removed.

### HTML Visual

HTML is embedded as a figure-like object inside the document.

States:

1. Normal: visual content dominates; border/chrome is nearly invisible.
2. Hover: compact top-right toolbar appears with Edit, Width, Fullscreen, More.
3. Selected: a restrained accent ring appears and the Inspector may show block-specific settings.
4. Quick Edit: large modal, left HTML source and right live preview.
5. Fullscreen: application chrome disappears; current visual becomes presentation content with only a lightweight exit affordance.

Width options remain Normal / Wide / Full.

## App shell

### Top bar

Minimal top bar:

- FlowNote brand,
- global search affordance,
- Edit / Read / Focus segmented control,
- Inspector toggle,
- theme / more actions.

It must not become an Office-style ribbon.

### Left Files Sidebar

Collapsible, low-chrome sidebar:

- New Note / Open,
- Search,
- Recent,
- Favorites,
- folder/document area,
- weak Tags / Trash area,
- file/document operations remain reachable without occupying the main top bar.

For the first-wave prototype, navigation sections may use current-document and representative workspace items while real file-tree persistence remains deferred. Existing file commands and aria-label contracts must remain available.

### Center document

The center column is the visual center.

- Markdown reading/editing measure: approximately 760-900 px.
- Generous whitespace.
- HTML Visual may break out to approximately 1100 px in Wide mode or viewport width in Full mode.
- Principle: **Text narrow, visual content wide.**

### Right Inspector

Closed by default. Tabs:

- Outline
- Block
- Info

Outline derives headings from current Markdown.
Block shows contextual HTML Visual properties when one is selected.
Info shows current note metadata/status.

The Inspector must not become a permanent settings wall.

## View modes

### Edit

Normal working mode. Markdown remains directly editable. HTML Visual contextual controls are available.

### Read

Read is not a separate Preview pipeline. It is the same document with editor noise removed.

- Markdown read-only.
- Formatting toolbar and block edit controls hidden.
- HTML remains interactive.
- Sidebar may remain available for knowledge navigation.
- Wide HTML layout remains supported.

### Focus

Focus remains editable.

- Left Sidebar hidden.
- Inspector hidden.
- Top bar heavily reduced.
- Continuous Markdown editing remains available.
- HTML remains in the document flow and does not automatically become presentation mode.

### HTML Fullscreen

Presentation-specific mode.

- No FlowNote workspace chrome.
- Current HTML visual occupies the primary display.
- Only lightweight title / Esc / close control remains.
- Intended for defense, presentation, and knowledge display.

## HTML Quick Edit

Large modal:

- left: HTML Source,
- right: Live Preview,
- top: visual name and status,
- bottom: Cancel, Open Full Editor, Save.

Quick Edit is for frequent small edits and immediate feedback. Full Editor is reserved for complex HTML/CSS/JS and resource workflows; the first-wave prototype may expose the entry point without introducing new file-format behavior.

## Visual language

Default Light theme:

- off-white app/background surfaces,
- white document surface,
- very light gray borders,
- dark gray text,
- restrained indigo / muted blue accent.

Avoid:

- large gradients,
- heavy glassmorphism,
- card-everywhere,
- saturated backgrounds,
- dashboard statistics,
- decorative AI glow,
- excessive permanent buttons.

Hierarchy should primarily come from typography, spacing, alignment, and progressive disclosure.

## First-wave implementation scope

The first-wave app prototype will implement:

1. new App Shell and visual tokens,
2. collapsible Files Sidebar,
3. minimal Topbar,
4. Edit / Read / Focus shell states wired to the existing editor mode,
5. contextual Inspector with Outline / Block / Info,
6. narrow centered continuous Markdown canvas,
7. HTML Visual Normal / Hover / Selected styling,
8. HTML Quick Edit modal with live preview,
9. HTML Fullscreen presentation overlay,
10. preserve all existing file operations and HTML edit/duplicate behavior,
11. preserve current file/note/storage architecture and test contracts.

Explicitly out of scope for this prototype:

- real workspace/folder tree persistence,
- global indexed search implementation,
- cross-note dependency localization,
- shared localized resources / CDN localization,
- full advanced HTML IDE,
- format migrations,
- changes to Note Format semantics.

## Safety / regression constraints

- Do not change .md or .note format semantics.
- Do not remove existing aria-labels relied on by tests.
- Do not delete or reset unrelated worktree changes.
- Existing Markdown Gate, file, disk, HTML, desktop and Rust behaviors remain authoritative.
- UI changes should be additive around the existing editor/session/file capabilities.
