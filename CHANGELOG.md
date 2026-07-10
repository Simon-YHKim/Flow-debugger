# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [0.1.6] - 2026-07-10

### Added
- **"화면 흐름" (navigation flow) mode.** A toolbar toggle (like "AI 하네스") that
  lays screens out left-to-right by navigation depth (BFS layers) and draws an
  arrow for every button that opens another screen — so you see how screens
  connect, not just a vertical catalog. Hovering a screen highlights its links and
  shows the button labels; clicking a screen opens its detail (with its capture).
  Powered by a new per-action `to` field (target route). The SCAN prompt now emits
  `to`, so any future scan gets the flow view automatically.

## [0.1.5] - 2026-07-10

### Added
- **Usage examples in the detail panel.** Each screen now shows an "이럴 때 써요"
  box (a concrete situation for using the screen) and each action shows a
  "사용 예시" box (a concrete example of doing that action), styled with an accent
  border and an automatic "예: " prefix. The scan ENRICH prompt now generates an
  `example` field per screen and per action.

### Fixed
- Detail-panel "used AI / data·server" list items now navigate to the correct
  per-action capability node — a v0.1.4 regression where they pointed at the old
  de-duplicated node ids and silently did nothing on click.

## [0.1.4] - 2026-07-10

### Changed
- **Capabilities now align to their mother node (strict tree).** Previously api/ai
  nodes were de-duplicated into one shared sink column ordered by barycenter, which
  pulled shared data/server nodes (e.g. "데이터 저장·조회") to the top, away from the
  screens that actually use them. Each action now owns its OWN capability nodes,
  placed in the capability column top-aligned to that action, so a data/server/AI
  node always sits right next to the action that uses it and never flies to the top.
  A shared table therefore appears once per action; the detail panel still lists
  every action that uses it. Verified 0 overlaps and 0 capabilities above their
  mother across all 82 screens / 667 nodes expanded.

## [0.1.3] - 2026-07-10

### Fixed
- **Layout no longer overlaps.** The old column packer only placed screens whose
  group id was in a hard-coded list, so a scan using any other group taxonomy left
  every screen stacked at the origin. Groups are now derived from the scan data
  (any group ids work), and each screen owns a vertical band that also holds its
  own actions, so nodes never overlap — verified 0 overlaps with all 82 screens /
  490 nodes expanded.
- **Connector lines no longer hide behind nodes.** `api` and `ai` were separate
  columns, so an action->ai edge crossed over the api column. They are now one
  adjacent "capability" sink column, so every edge travels an empty gutter and
  never crosses a node. The sink is ordered by the barycenter of the actions that
  use each capability to reduce edge crossings.
- **Group filter chips** now reflect the actual scan groups (were hard-coded to a
  fixed set that didn't match arbitrary data, making the toggles no-ops).
- Bumped the localStorage key so stale saved positions from the old layout are
  discarded on first open.

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
