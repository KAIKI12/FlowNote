# FlowNote Mixed Markdown Export Plan

## Goal

Add a V1 Mixed Note Markdown export that never silently loses HTML Blocks or managed resources.

## V1 policy

Mixed Note Markdown export uses **external HTML links**:

- export a normal `.md` file inside a sibling export directory,
- replace each valid FlowNote HTML Block anchor with a relative Markdown link to `./blocks/<id>/index.html`,
- write the Block's **Current HTML** to that path,
- copy Note-managed `assets/**` and referenced Block-private `blocks/<id>/assets/**`,
- never export `original.html`, `block.json`, orphan Blocks, or internal `.note` paths,
- allow Dirty editor content to export without implicitly saving or clearing Dirty,
- reject external-conflict / read-only / unknown-version Notes.

Ordinary Markdown notes keep the existing one-click `.md` download behavior.

## Architecture

Reuse the Browser Bundle native materializer. Browser Bundle and Markdown export share:

- bound Note capability + revision validation,
- destination validation,
- a single verified NoteTree snapshot,
- Note-owned resource copying,
- referenced Block-private resource materialization,
- sibling staging directory + atomic rename,
- source Note immutability.

The frontend owns the presentation transform from FlowNote anchor fences to ordinary Markdown links. The native layer owns filesystem safety and publication.

## Verification

Cover:

1. anchor order and ordinary Markdown fidelity,
2. Current HTML rather than Original,
3. Note images and Block-private assets,
4. Dirty export without save,
5. stale/forged/future-version/unsafe destination rejection,
6. no partial publish and no source Note mutation,
7. normal Markdown export remains unchanged,
8. full frontend/native regression and production build.
