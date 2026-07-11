# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [0.8.1] - 2026-07-11

### Fixed
- **Third-party ready: the app name is no longer hard-coded.** The page title and brand
  header read `2nd-B` verbatim, so anyone else building a map for their own app got
  another product's name. They are now an `__APP_NAME__` token filled by `build.js` from
  an optional sibling `<graph>.appname.txt`, defaulting to a generic `앱` when absent — so
  a third party's build never leaks another app's branding. Documented the optional
  `appname.txt` / `stack.txt` sidecars in SKILL.md and README. (Scripts were already
  path-clean; this was the only Simon-specific string in the loaded assets.)

## [0.8.0] - 2026-07-11

### Changed
- **Node add/remove is now a tab in the right panel, not a modal.** The `＋ 노드 추가`
  work (propose a should-exist screen/action/note and optionally connect it to a card)
  moved from a pop-up dialog into a third tab alongside 버그 신고 / 수정 요청. The tab
  holds the add form plus a live list of everything you have added, each row with
  흐름도에서 보기 / 삭제 (remove). The toolbar `＋ 노드 추가` button now opens this tab.
  Typed input is preserved across re-renders (e.g. when you select a card to link to), the
  tab badge shows the added-node count, and the old modal overlay code/CSS is removed.

## [0.7.0] - 2026-07-11

### Added
- **`scripts/apply-anchors.js` — a reusable anchor-correction merge.** A framework-aware
  re-scan produces compact per-screen patches (`{route, stack, screenRenders, actions:[{action, file, impl, renders}]}`);
  this script merges them onto an existing screenmap by `route` + exact `action` string,
  preserving every other field (Korean enrichment, risks/checklist, glossary tags, `to`).
  It carries a **deterministic hallucination guard**: every `path:line` an agent emits is
  validated against the real source tree (file exists AND line in range) and dropped if it
  fails — an empty field beats a wrong one.
- **App-level `stack` note in the exported prompts.** `build.js` embeds an optional sibling
  `<graph>.stack.txt` as a `STACK` constant; `buildBugReport` / `buildStackPrompt` now
  prepend a `[앱 스택]` line so a coding agent gets framework + render-mechanism context
  (e.g. "production UI delegates via isDeepSpaceUI() to src/screens/deepspace/**") before
  it touches anything.

### Fixed
- **The bug report now carries `impl` / `renders`.** `buildBugReport` built its code hint
  from the raw `file` field, bypassing `codeRef()` — so the `impl` (real logic) and
  `renders` (production file) anchors never reached the single most important export. It
  now uses `codeRef()` and additionally surfaces the screen's production render file line.

### Changed
- **2nd-B re-scanned with the hardened SCAN (the honest completion of 0.6.0).** An 8-agent
  framework-aware fan-out filled the previously-empty accuracy fields across 82 screens /
  310 actions: `impl` on 128 actions, action-`renders` on 38, screen-`renders` on 79, with
  0 hallucinated anchors (all validated against source). 158 actions now anchor directly
  into `src/screens/deepspace/**` production files instead of the invisible legacy bodies.

## [0.6.0] - 2026-07-11

### Changed
- **The exported prompt is now measured, not asserted — and hardened.** Prompt quality
  went from **28/60 (46.7%) → 53/60 (88.3%)** on a 6-criteria rubric (grounding, single
  intent, acceptance criteria, constraints, context framing, ambiguity removal), judged
  by an independent 3-lens panel; "safely executable by a coding agent" rose from **1/5
  to 4/5**. See `evals/prompt-quality.md`.
- **`buildStackPrompt` / `buildBugReport` / the 수정 요청 export now carry a contract.**
  A "작업 규칙" preamble tells the coding AI to treat the code anchor as a *hint to
  verify* (reproduce first, trace the real handler, confirm the file that actually
  renders in production), honor a per-item **완료 기준**, respect scope, flag new
  cost/external dependencies, and ask instead of guessing. Per-kind hardening: rename
  now scopes to UI label vs identifier + all locales; add-node checks for an existing
  feature and follows the app's nav/design; connection items disambiguate verify-doc vs
  edit-code and forbid a duplicate path. On-screen cards stay short (non-developer
  readable); the richer 완료 기준/주의 only appear in the copied prompt.
- **Anchor accuracy fixed at the source (the one thing templates can't).** `SCAN` in
  `references/scan-prompts.md` now requires anchoring `file` to the real handler (not the
  screen-mount line), adds optional `impl` (real logic location) and `renders` (the
  production-rendered variant when a screen delegates), and captures a `stack` line.
  `codeRef` shows `impl`/`renders` when present (backward-compatible).

### Verified
- Blind re-score on the identical 5 fixtures: 46.7% → 88.3%. Ground-truth A/B on the real
  target repo (login-bug "misleading anchor" trap): the old prompt shipped a speculative
  auth diff; the hardened prompt reproduced-then-asked and avoided a wrong change to a
  possibly-non-bug. Regression: left 설명 panel + 2-tab layout, expand-all 891/0 overlaps,
  화면 흐름 82/0, node-add lane 0, 0 page errors.

## [0.5.0] - 2026-07-11

### Added
- **노드 추가 ("이런 게 있어야 해요").** A new `＋ 노드 추가` toolbar button opens a
  small dialog to add a **화면 / 동작 / 메모** node that represents something that
  *should* exist. The node appears on the canvas (dashed, draggable, deletable) in a
  clean lane to the right of the map — never overlapping the auto-tree — and can be
  linked to the currently selected node. Every added node is auto-recorded in the
  bottom prompt stack as a **"만들어줘" 요청** (memo nodes as "반영해줘"), so a
  non-developer can describe missing screens/features and hand the whole list to an
  AI. Nodes are editable (name/description) from the 설명 panel and persist in
  localStorage.

### Changed
- **설명(detail) is now a dedicated always-on panel on the LEFT of the canvas.** The
  right panel previously carried three tabs (설명 / 버그 신고 / 수정 요청); the 설명
  tab is split out so a node's explanation is always visible on the left while you
  work, and the right panel keeps just **버그 신고 + 수정 요청**. Selecting a node
  refreshes the left panel without disturbing the right tab.

### Verified
- Left 설명 panel + right 2-tab layout, panel order (설명 | 흐름도 | 신고/요청),
  reportBug switches the right tab while the left keeps detail, tab switching leaves
  the left panel untouched. Node-add end-to-end: dialog → canvas node → 설명 edit →
  dock "추가" card → delete → reload persistence. Regression: catalog expand-all 891
  nodes / 0 overlaps, 화면 흐름 mode 82 / 0, added-node lane 0 overlaps, 0 page errors.

## [0.4.0] - 2026-07-11

### Changed
- **Navigation previews are now the node itself — recursively expandable.** A
  preview card no longer just links to the original with a jump button; it has its
  own ▸/▾ and, when expanded, unfolds the target screen's real actions inline (with
  their data/AI and their own 이동 chips), which open further previews, and so on —
  so you can keep drilling screen → action → next screen → its functions → … all to
  the right without ever losing your place. Bounded by a depth limit (6) and a
  cycle guard (a screen never re-opens one already above it on the path). The whole
  layout engine was rewritten from fixed type-columns to a **recursive mother-
  aligned tree** (x = tree depth), so nothing overlaps at any depth. A small
  "원본 카드로 →" button remains for jumping to the canonical card.

### Verified
- Drill-down: screen → chip → preview → expand materializes the target's 6 actions
  → a nested 이동 chip → a deeper preview, all with 0 overlaps at every depth.
  Regression: catalog expand-all 891 nodes / 0 overlaps, 화면 흐름 mode 82 nodes /
  0 overlaps, AI 하네스 intact, prompt dock intact, 0 page errors.

## [0.3.1] - 2026-07-11

### Changed
- **전체 펼치기 now also opens every navigation preview.** It used to expand only
  the screens' action trees; the "이동 → <화면>" chips stayed collapsed. It now
  opens all nav previews too, so one click reveals screens → actions → data/AI →
  and the linked screen previews. 모두 접기 closes them back. Verified: 82 screens
  + 112 previews open, 891 nodes, 0 overlaps.

## [0.3.0] - 2026-07-11

### Added
- **Prompt-stack dock (bottom bar).** Everything you note across the flow —
  card memos, 틀림/삭제/더봐줘 flags, bug reports, connection add/remove edits, and
  free-typed requests — is now collected in a dock at the bottom as AI-ready
  prompt cards. Each card is a human-readable Korean instruction plus its code
  grounding (route / file:line / api tags), so it's easy for both the user and an
  AI to act on. **전체 복사** copies the whole stack as one paste-into-your-AI
  prompt; a free-text input adds ad-hoc requests (attached to the selected node's
  screen/action when one is selected); cards jump to their node; per-card ✕ and
  비우기 remove; open/closed state and contents persist. The 수정 요청 tab remains
  as the detailed editor for the same data.

### Fixed
- Bug-report builder crashed reading `n.screen.data.route` on an action node
  (screen is stored as the data object, not a node) — now reads `n.screen.route`.

## [0.2.3] - 2026-07-11

### Added
- **"원본 노드로 이동하기" button on every preview card.** The inline preview
  keeps the in-place reading flow, and the button jumps (select + auto-expand +
  centre) to the real target card when you want to continue exploring there.

### Verified (full coverage)
- All 112 navigating actions across all 82 screens have a chip + preview + jump
  button. Every preview's title and capture were programmatically compared to
  its linked screen's real card: 0 title mismatches, 0 thumbnail mismatches,
  0 missing targets (100/112 previews carry a real capture; the rest fall back
  to type icons because the target screen itself has no capture yet).
  All 112 previews open at once: 891 nodes, 0 overlaps, 0 page errors.

## [0.2.2] - 2026-07-11

### Changed
- **Nav chips now expand an inline preview instead of jumping.** Clicking an
  "이동 → <화면>" chip no longer moves the viewport to the target's card; it
  toggles a dashed *preview card* of the target screen right beside the chip
  (thumbnail, summary, action count, "미리보기" badge), so the flow keeps reading
  left-to-right in place. Clicking the preview shows the full screen detail
  (actions, examples, capture) with a "원본으로 가기" link when a jump is wanted.
  Open/closed state persists. Verified: 12 previews open simultaneously,
  791 nodes, 0 overlaps, 0 misalignments.

## [0.2.1] - 2026-07-11

### Added
- **Navigation target chips in catalog mode.** A navigating action (e.g. "첫
  통찰 → 시작하기를 누른다") now shows a dashed "이동 → <화면>" chip to its right
  in the capability column, top-aligned to its mother action — so screen-to-screen
  connectivity is visible in the default view, not only in 화면 흐름 mode.
  Clicking the chip jumps to (selects, expands, centres) the target screen card;
  the action detail panel gains an "이동하는 화면" item. Verified: 112 chips,
  779 nodes expanded, 0 overlaps.

## [0.2.0] - 2026-07-11

Audit + comparable-tool research release: 2 code auditors (24 findings) + 3
researchers (Overflow/FlowMapp/Figma flows, n8n/Zapier/Node-RED canvases,
React Flow/Stately/tldraw patterns) drove this batch.

### Added
- **경로 추적 + 경로 걷기 (Overflow Stories pattern).** In 화면 흐름 mode, pick
  "🚩 여기서 출발" on one screen and "🎯 여기까지 경로" on another → BFS shortest
  button-path is highlighted (everything else dims), listed step-by-step in the
  panel, and "▶ 경로 걷기" opens a walkthrough overlay that shows each screen's
  real capture with "press 『button』 → next screen" instructions.
- **Search that finds things (n8n/Node-RED pattern).** Matching screens
  virtually expand while searching (a hit inside a collapsed screen used to be
  invisible), api tags are searchable, Enter jumps to + centres the first match,
  and the stat bar shows the match count. 150ms debounce (every keystroke used
  to re-serialize 2MB of embedded captures).
- **Copy as Mermaid (Whimsical pattern)** in the 수정 요청 tab — exports the
  screen-navigation graph as a flowchart for wikis/issues/AI chats.
- Keyboard: Esc (staged: walkthrough→path→selection→search→link-mode), +/- zoom,
  0 = fit, double-click = zoom to card. Click empty canvas = deselect.
- Selection now keeps its neighbourhood lit (was hover-only), and an empty
  filter/search state shows a hint instead of a silently blank canvas.

### Fixed
- **Mode-scoped drag positions (P0).** Dragging a screen in 화면 흐름 mode used
  to permanently corrupt the catalog layout (and vice versa) because both modes
  shared one position store. Nav drags now save to their own store; 자동 정렬
  resets only the current mode.
- **localStorage collision (P0).** The storage key is now namespaced by a
  fingerprint of the dataset, so two different apps' flow-debugger HTMLs no
  longer clobber each other's saved positions/edits/bug reports.
- **화면 흐름 layout.** Isolated screens (no nav edges) get their own labelled
  parking grid instead of bloating the entry column; cycle-only clusters are
  seeded properly (tab-bar style mutual navigation now layers instead of piling
  into the parking column); columns are barycenter-ordered (fewer crossings);
  layer-skipping edges bow around intermediate columns; backward edges route
  left-side to right-side instead of stabbing through their source card;
  parallel edges (several buttons to the same target) merge their labels.
- Link editing is disabled in 화면 흐름/하네스 modes (ports hid, button dimmed) —
  it used to silently record invisible edits; harness pipeline edges can no
  longer be cut. aiOnly/펼치기 buttons dim in modes where they do nothing.
- Detail-panel item clicks now actually update the panel, expand the target's
  parent screen, and centre the canvas on it (was a silent no-op half the time).
- Hover no longer rebuilds the full edge SVG on every child-element crossing;
  node drags redraw edges via rAF. Minimap viewport rectangle clamps correctly
  and hides when nothing is visible. Injected GRAPH/GLOSSARY/SHOTS are
  null-guarded. Edit-count badges ignore orphaned entries from older scans.
- Screen cards no longer collapse when re-clicked to read their detail —
  collapse is the ▾ arrow only.

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
