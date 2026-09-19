# FlowNote Slice 3 Reliability Design

**Status:** approved-by-existing-product-specs / implementation design
**Date:** 2026-09-15

This design implements the already-approved requirements in Note Format v1.2, PRD v0.3, Resource Architecture, and Requirements Matrix. It does not change the persisted format.

## 1. Scope

Slice 3 covers three independent reliability boundaries:

1. External `.note` modification handling with clean/dirty/IME behavior.
2. Structured diagnostics and explicit recovery for Missing / Orphan / malformed Note states.
3. Same-note HTML Block Deep Copy with independent Block-private managed resources.

Cross-note shared-localized dependency transfer remains deferred until the shared-resource model exists. Slice 3 must not invent hidden cross-note paths.

## 2. External modification detection

### Alternatives considered

**A. Frontend filesystem watcher using an absolute Note path.** Rejected. It widens frontend filesystem authority and couples the UI to host paths.

**B. Add an OS watcher dependency such as `notify`.** Architecturally valid, but adds a new native dependency and lifecycle complexity before the product behavior is proven.

**C. Capability-bound revision probe. Recommended for Slice 3.** The frontend knows only the existing Note capability ID. A small native `note_probe` command reads the bound Note tree and compares its full-package revision with the revision stored in the capability binding. No binding revision is mutated by a probe.

The probe loop is an implementation detail and can later be replaced by an OS event watcher without changing the port, state machine, format, or conflict UX.

### State machine

```text
Disk unchanged
    -> no action

Disk changed + Local Clean + not composing
    -> note_reload
    -> apply disk snapshot
    -> subtle "updated from disk" notice

Disk changed + IME composing
    -> queue only
    -> compositionend
    -> probe again
    -> if still clean: reload
    -> if local became dirty: conflict

Disk changed + Local Dirty
    -> External Conflict
    -> never auto reload
    -> never update binding revision
    -> never overwrite disk
```

Conflict actions:

- **Reload Disk**: explicit discard of local edits, then native reload/apply.
- **Save Local As...**: preserves local content in a new Note and leaves the externally changed original untouched.

There is no silent Last Write Wins path.

## 3. Probe boundary

Native response:

```ts
interface NoteProbe {
  revision: string
  changed: boolean
}
```

Rules:

- input is capability ID only;
- native code resolves the bound path;
- reads the complete Note tree revision, including resources;
- never updates the binding revision;
- forged/closed capability is rejected;
- path/symlink/security checks remain identical to normal Note reads.

The polling interval is deliberately coarse (about 1 second) and only active for a bound desktop Mixed Note. No background polling exists for closed Notes.

## 4. Recovery diagnostics

Automatic destructive repair is forbidden.

Native snapshots gain structured diagnostics while preserving the existing human-readable `notice`.

Initial diagnostic kinds:

```text
invalidAnchor
duplicateAnchor
missingBlock
orphanBlock
partialPackage
```

A diagnostic may include a Block ID when it is safely known.

### Recovery behavior

- Invalid/duplicate/missing anchors keep source bytes and force safe read-only behavior.
- Orphan Block directories remain on disk and are listed; they are never auto-deleted.
- Recovery commands operate against the currently bound revision and fail on external change.
- Recovery never rewrites Original merely to make validation pass.

### Explicit repairs in Slice 3

**Missing Block / invalid reference:** user may remove the exact invalid/missing FlowNote Anchor from `content.md`. This is an explicit data-model repair; it does not fabricate HTML.

**Orphan Block:** user may restore the orphan by appending a valid anchor at the end of `content.md`. The existing Block directory becomes referenced again; its Current / Original / private assets remain untouched.

If the backend cannot prove the requested repair targets exactly the reported diagnostic, it refuses the operation.

## 5. Deep Copy

Normal same-note HTML Block copy has value semantics.

```text
Source Block A
    -> new Block ID B
    -> candidate anchor B inserted immediately after A
    -> candidate Mixed data adds cloned config/Current/Original
    -> save request includes blockCopies: A -> B
    -> native staging copies A/private assets/** to B/private assets/**
    -> validate complete candidate
    -> commit
    -> apply only after save success
```

The runtime-only `blockCopies` instruction is not persisted in `note.json` or `block.json`.

Rules:

- target ID must be new and valid;
- source Block must exist in the currently bound Note;
- target Block must exist in candidate Mixed data and match cloned Current/Original/config;
- only `blocks/<source>/assets/**` is copied as private managed content;
- critical files (`block.json`, `index.html`, `original.html`) are generated from candidate data;
- source and copy must be independently editable after commit;
- save failure leaves the live editor/store unchanged.

Shared localized resources are not introduced in Slice 3. When that model exists, immutable shared resources may remain shared as defined by Resource Architecture.

## 6. Failure and recovery ordering

The existing staged Note save remains the transaction boundary.

```text
build candidate
-> copy managed resources into staging
-> validate candidate tree
-> commit directory swap
-> acknowledge snapshot
-> apply frontend state
```

Prefer recoverable Orphan state over a dangling Anchor. Never delete abnormal files automatically.

## 7. Testing obligations

Slice 3 is complete only when tests cover:

- clean external edit auto reload;
- dirty external edit enters conflict and leaves both versions intact;
- external edit during IME is queued and rechecked after composition;
- external private-resource edit is also detected by full-tree revision;
- forged capability probe fails;
- missing Block diagnostics preserve source;
- orphan diagnostics preserve directory;
- explicit remove-reference repair;
- explicit restore-orphan repair;
- repair rejects stale revision;
- Deep Copy gets a new ID;
- Current/Original/config copied;
- private assets copied independently;
- editing copied Current does not affect source;
- failed Deep Copy save does not change live Note;
- real-disk close/reopen validates repaired/copied state;
- all existing regression/build gates remain green.

## 8. Non-goals

Not part of this Slice:

- arbitrary automatic merge;
- unsandboxed HTML;
- shared localized/CDN implementation;
- cross-note shared dependency transfer;
- runtime-state persistence;
- background cloud sync;
- automatic deletion of Orphans or recovery directories.
