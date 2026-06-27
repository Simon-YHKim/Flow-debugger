# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [0.1.2] - 2026-06-28

### Added
- "AI 하네스" view (toolbar toggle): a left-to-right pipeline showing how the
  app's AI is wired (input -> safety check -> callGemini gateway -> tier ->
  edge proxy + spend cap -> model -> output safety -> audit) with a plain-Korean
  role description for each stage on click.

### Fixed
- dispLabel/codeRef now handle harness nodes (no data field) instead of throwing.

## [0.1.1] - 2026-06-28

### Added
- README preview screenshots (`docs/overview.png`, `docs/debug-detail.png`) showing
  the grouped screen map and the per-action diagnostic panel.

## [0.1.0] - 2026-06-28

### Added
- Initial release as a Claude Code plugin.
- `flow-debugger` skill: scans an app's screens and maps each screen to its user
  actions, data/server calls (db/rpc/edge/storage/auth) and AI calls.
- Self-contained interactive HTML output with: plain-Korean labels, screen-type
  icons and screenshot thumbnails, risk markers (network/cost/AI/external/gate/
  weakpoint), per-action diagnostic checklists and failure modes, drag-and-drop,
  minimap and zoom, connection editing, and a bug-report generator that turns a
  vague symptom into a precise file:line report.
- Scripts: `merge-readers.js`, `build.js` (with embedded-script self-verify),
  `embed-shots.js`.
- Fan-out prompt reference (`references/scan-prompts.md`) and eval cases.
