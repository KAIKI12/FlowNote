# FlowNote

FlowNote is a local-first, document-first Markdown desktop note app with native HTML Visual blocks.

## Download

Windows installers are published on GitHub Releases:

- **Recommended:** NSIS installer (`FlowNote_*_x64-setup.exe`)
- **Alternative:** MSI package (`FlowNote_*_x64_en-US.msi`)
- **Integrity:** each release includes `SHA256SUMS.txt`

[Download the latest FlowNote release](https://github.com/KAIKI12/FlowNote/releases/latest)

The current public build is an early prototype. Keep backups of important notes while the app is under active development.

## Development

The desktop app lives in `flownote-app/` and uses Tauri 2 + React + TypeScript + Vite.

```bash
cd flownote-app
npm ci
npm run tauri:dev
```

Release tags matching `v*` trigger `.github/workflows/release.yml`, which builds Windows MSI + NSIS installers, runs Rust tests, generates SHA256 checksums, and publishes the assets to GitHub Releases.

For implementation status and architecture, see:

- `flownote-app/STATUS.md`
- `REQUIREMENTS-MATRIX.md`
- `FlowNote Note Format v1.2 — Freeze Candidate Draft.md`
