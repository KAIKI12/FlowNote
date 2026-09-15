# FlowNote Markdown Qualification Pack

Files:

- `markdown-editor-qualification.md` — acceptance rules and test procedure.
- `markdown-editor-qualification-result-template.md` — result record.
- `fixtures/` — Markdown stress-test documents.

Recommended repo location:

```text
docs/qualification/
├─ markdown-editor-qualification.md
├─ markdown-editor-qualification-result.md
└─ fixtures/
```

Run the tests against the exact Milkdown configuration used by FlowNote, not an isolated Milkdown demo, because CSS, plugins, schema extensions, and app-level synchronization can change behavior.
