# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [0.12.0] - 2026-07-14

Driven by a real run that went wrong, and by an adversarial re-review of 0.11.0 that found the
release's own headline feature was dead. Both are the same lesson: a green test suite is not
evidence, and a tool that reports confidently is worse than one that reports nothing.

### Fixed — 0.11.0 shipped a feature that never once ran
- **The delegation warning never fired, in any built HTML.** `build.js` wrote the lookup key
  with a stray **NUL byte** while the template read it with a space, so `delegWarn()` returned
  null for every node — forever. The build console printed `DELEGATION TRAP: 4` and the report
  said nothing. The unit test passed (it calls the library, which was fine) and the live check
  passed (it only ever clicked the FIRST screen card, never a trapped one). The NUL also made
  git treat `build.js` as a binary blob, so the diff was unreviewable and every grep-based audit
  silently skipped the file. `verify-html.js` now asserts the warning fires end-to-end and
  reaches the exported report; a repo-wide control-character check runs with the tests.
- **✔ claimed a check it had not run.** 507 of the real map's 547 anchors are `unchecked` — the
  file exists and the line is inside it, and nothing was compared to a function name, because
  the scan gave no symbol. They rendered as **✔** under the sentence "그 줄에 해당 함수가 실제로
  있어". The tool was lying about its own evidence to a reader who cannot check. There are now
  three honest tiers: **✔ VERIFIED** (a named function was found at that line) · **· LOCATED**
  (file and line are real; nothing was compared) · **~ CAUTION** · **⚠ BROKEN**.
- **A symbol on an import line, a comment, or inside a string literal was confirmed `exact`.**
  The blank/import/comment guard sat inside the no-symbol branch, so supplying a symbol bypassed
  it. One such anchor was live in the real map, reported ✔ — it was a JSDoc comment.
- **Snapping retargeted anchors to a different function with the same name**, and `resolve` took
  the first textual mention (a dead copy inside a legacy helper) instead of the definition.
  Definitions are matched now, the exported one wins, and an ambiguous name refuses to move.
- **`--fix` destroyed correct anchors.** A whitelist of file extensions turned any `.dart`,
  `.xml`, `.c`, `.astro` anchor into "prose" and deleted it. Nothing is ever deleted now; a
  rejected anchor keeps its text in a note field.
- **`build.js` overwrote an input file** when positional args were mixed with `--out`.

### Added — from a post-mortem of a real 86-screen run (27 screens correct, 275 errors)
Three of the five root causes were not "the model read the code badly". They were "the model was
asked a question it could not answer from the file in front of it". So a script answers them now.
- **`scripts/prescan.js` + `lib/reach.js` — pipeline step 0.**
  · **Production render path.** The route file delegates (`if (isXxxUI()) return <NewScreen/>`),
    so the scan described the dead legacy body: **10 screens were the wrong screen entirely.**
  · **Reachability.** A scan read a screen correctly, saw its save button was a no-op, and told a
    non-developer *"your 담기 button is fake, you are losing data."* The route is wrapped in
    `DevOnlyRoute` and redirects in production — **nobody can reach that button.** The code was
    right and the conclusion was false. **4 of 21 bug claims were this**, the most damaging error
    this tool can make. Gated screens are now detected (5/5 on the real app, including the one
    the false report was filed against), badged 🔒 on the card, and the bug report opens with
    *"먼저 이 화면이 프로덕션에서 열리는지 확인해줘."*
  · **Helper capabilities.** `createRecord()` calls an embedding model three frames down; the
    screen file says nothing about it. **66 server calls and 7 AI calls went missing.** prescan
    indexes every helper with the DB/AI it really touches (216 on the real app, 46 of them AI)
    and the SCAN prompt now carries that table.
- **An anchor on a JSX render line is no longer accepted.** A real run put all three home-screen
  actions on `return <DeepSpaceShell />` — the handlers were not even in that file. (**43 wrong
  anchors.**) It is now flagged and snapped to the handler.
- **`impl` is no longer judged by the screen handler's name.** `symbol` names the screen's
  handler; `impl` points into a lib function with a different name. That mismatch produced 15
  "the function is not there" warnings on a real map, and **all 15 were false**.
- **SKILL.md / scan-prompts.md: do not merge SCAN · ENRICH · ANNOTATE into one pass.** Merging
  them to save tokens cost 90 missing actions, 66 missing server calls and 43 bad anchors — and
  the saved tokens were paid back tenfold in verification and repair.

### Changed — the map itself
- **Two views instead of three co-equal toggles: 🖥 화면별 플로우 / 🌐 시스템 플로우.**
- **화면별 플로우 grows to the RIGHT from one screen.** The catalog stacked all 86 screens
  vertically, so the "tree" ran downward for a full screen before it ever went sideways. Now one
  screen is the root on the left and everything cascades right: 동작 → 데이터·서버·AI → 그 동작이
  데려가는 **다음 화면**, which you can open in place and then make the new root
  (『이 화면으로 이동 →』) — walking the app one hop at a time.
- **시스템 플로우** is the whole app: the screen-to-screen graph (layered left→right) plus the AI
  wiring, with 경로 추적 / 경로 걷기.
- A screen bug report now inherits its actions' verified anchors (29 of 86 screens had none).
- Korean particles agree with the unit (`엔드포인트가`, not `엔드포인트이`).
- The AI harness view gained a de-overlap pass; it had none.

## [0.11.0] - 2026-07-14

The precision release. Everything the tool produces is downstream of one datum — the
`file:line` it hands a coding agent — and until now nothing verified it. This release makes
that anchor trustworthy, and says so honestly when it is not.

### Added
- **`scripts/verify-anchors.js` + `scripts/lib/anchors.js` — anchor verification, a new
  pipeline step (4/6) that cannot be skipped.** Every code anchor is now resolved and
  checked against the real source tree: the file exists, it is inside the app root (a `../`
  escape used to be readable), the line is in range, and **the named function is actually on
  that line**. Beyond checking, it *repairs*: an anchor with no line number is resolved BY
  its symbol; a drifted line is snapped to where the function really is; a bare filename is
  resolved against the tree when unique. Measured on the 2nd-B map (668 anchors): **51% were
  a clean `path:line`, 19% a file with a symbol and no line, and 18% were Korean prose in the
  coordinate slot** — shipped to developers as a "code hint" no editor can open. After
  verification: 547 anchors, **99.8% trustworthy, 0 prose, 0 broken**.
- **Delegation-trap detection.** An anchor can be perfectly valid and still useless: the file
  it points at hands off to another component in production (`if (isDeepSpaceUI()) return
  <XxxScreen/>`). Editing it leaves the build green and the screen unchanged — the exact
  failure this whole tool exists to prevent, and no amount of validating the coordinate
  catches it. `lintDelegation` reads the anchored file, and the bug report now carries a
  loud warning naming the component that actually renders.
- **Trust markers in the export.** The bug report separates **✔ confirmed** (file, line and
  function all checked) from **~ caution** (the line is blank / an import / a comment) and
  **⚠ unusable** (with the reason), so a coding agent knows what to trust and what to go find.
  Built without `--app-root`, every coordinate is labelled unverified rather than implied true.
- **`scripts/self-test.js`** — 30 unit tests for the anchor engine, every case taken from a
  real scan shape. Node only, no browser, no network.
- **`scripts/verify-html.js`** — live browser verification (overlaps, page errors, the empty-
  report gate, the exported anchors, template leakage). Every "verify PASS" in this
  changelog's history rested on scripts that lived in a temp directory and no longer exist;
  this one lives with the code.
- **`scripts/capture-shots.js` + `references/capture-shots.md`** — the screenshot procedure.
  Thumbnails are how a non-developer recognises a screen, and nothing in the repo produced
  them; `embed-shots.js` consumed a map a human had to build by a process nobody wrote down.
- **`examples/demo-notes/`** — a small, committed, non-2nd-B app (REST + one AI call) with a
  deliberate delegation trap. The README screenshots come from it, `npm test` runs against it,
  and a first-time user can build a map in one command.
- **RESCAN / PATCH prompt** (`references/scan-prompts.md`) — `apply-anchors.js` has existed
  since 0.7.0 with **no producer**: no prompt told an agent to emit the patches it consumes,
  and neither SKILL.md's pipeline nor the README mentioned it. The deterministic guard was
  unreachable by anyone following the docs.
- **`package.json`** (playwright declared), **`.gitignore`**, and a `symbol` / `type` /
  `groupKo` field in the scan schema.

### Fixed
- **The AI harness no longer ships another app's internals.** It was a hand-written diagram of
  ONE app — its gateway function, its edge proxy, its per-tier spend caps, its crisis hotline
  numbers — rendered unconditionally for every target, and the README described it as "your
  app's AI". A third party mapping their own app was shown a stranger's architecture as their
  own, and the reader this tool is built for is by definition someone who cannot tell that it
  is false. It is now **derived from the AI calls the scan actually found** (purpose → via →
  model); an app with no AI has no button. A hand-authored pipeline can be supplied in
  `<graph>.harness.json`.
- **The scan's `ai` object shape is now in the prompt.** The only example was `"ai":null`, so a
  reader would guess `"ai":"capture_classify"` — producing a node id of `ai:undefined` and a
  blank AI card, while the build cheerfully reported "JS OK". `merge-readers.js` now
  schema-checks reader output and stops instead of shipping a corrupted map.
- **Backend neutrality finished.** 0.9.0 taught the SCAN prompt `rest:`/`graphql:`/`http:`/`fn:`
  but left the template's colour and label tables hard-coded to Supabase's five primitives, so
  a REST app's calls rendered grey with the English word "rest" on the card, under a static
  legend of five colours that were nowhere on screen. Kinds are now open-ended (colour by hash,
  Korean from the glossary) and **the legend is built from the data**. `SKILL.md` still
  instructed Supabase-only tags; fixed.
- **Group labels are Korean again.** They were derived by title-casing the raw id, so the
  shipped map read "Home Shell", "Self Model", "Records Graph" — machine-translated English in
  a tool whose one promise is plain Korean. ENRICH now asks for `groupKo`.
- **A bug report can no longer be empty.** Pressing the button created the entry and every
  field was optional, so "재현해서 고쳐줘" shipped with nothing to reproduce — and with an
  invented completion criterion attached. A symptom is now required.
- **You can report a broken *screen*, not just a broken action.** The button existed only on
  action cards, while a non-developer's "안 돼요" is usually "빈 화면이에요" / "로딩만 돌아요".
- **The 수정 요청 tab exported an incomplete prompt.** It built its own list from `state.edits`
  only, silently dropping bug reports and added nodes — which its own badge counted. It now
  emits the same complete text as the dock.
- **`build.js` cannot silently swallow the wrong file.** The 4-argument form loaded
  `shots.json` into the glossary slot (the natural way to skip the glossary) and shipped a map
  with zero thumbnails, exit 0. Inputs are shape-checked; named flags are available.
- **"Self-contained" is now true.** The template hot-linked a CDN font — so the one artifact
  meant to be opened offline broke offline, in the tool that flags "인터넷 필요" as a risk.
- **Screen icons work for any app.** The type map was a literal list of one app's ~64 routes;
  every other app's cards came out as the same grey "detail" icon under a help text promising
  you could recognise screens by them. Type now comes from the scan (`type`), with a
  route-word heuristic as fallback.
- **The `ui`/`backend`/`cli` vocabulary switch is complete** — 17 generated strings still said
  "화면" on an API server.
- **Versions agree.** plugin.json said 0.10.0, SKILL.md 0.1.0, cases.json 0.1.0, and HANDOFF
  0.6.0. All four are 0.11.0.
- The precheck accepts SvelteKit / Nuxt / Vue / pages-router layouts instead of stopping at
  `NO_SCREEN_CODE` with no way to say where the screens are.

## [0.10.0] - 2026-07-11

### Added
- **명령/엔드포인트 모드 — pure backend & CLI targets.** A `<graph>.mode.txt` = `ui` |
  `backend` | `cli` (default `ui`) drives the noun for the top-level node: 화면 /
  엔드포인트 / 명령. The page title, stat bar, node type labels, empty states, legend,
  search/flow-button text, and the spec popup all switch vocabulary. `scan-prompts.md`
  gains a "대상 모드" section: a screenless API server maps each endpoint as a top node
  (route = "METHOD /path", actions = the handler's DB/service/external calls); a CLI maps
  each command. Proven end-to-end by scanning an Express API server (PostgreSQL + external
  payment API + JWT) — 4 endpoints, 11 actions, correct 엔드포인트 vocabulary, pageerror 0.
- **Minimap drag-to-pan.** The minimap was click-only; it now supports click **and drag**
  (pointer-captured, so it keeps panning even when the cursor leaves the minimap) for fast
  navigation of large maps. Cursor shows grab / grabbing.

### Changed
- **시스템 스펙 moved from a tab to a top button + popup.** Per request: the spec is no
  longer the 4th right-panel tab. A **📋 시스템 스펙** button in the toolbar opens a centered
  popup (closable via the 닫기 button, Esc, or clicking the backdrop). The right panel is
  back to three tabs (버그 신고 / 수정 요청 / 노드 추가).

## [0.9.0] - 2026-07-11

### Added
- **시스템 스펙 tab.** A fourth right-panel tab (버그 신고 / 수정 요청 / 노드 추가 / 스펙)
  that auto-profiles the examined system from the loaded data: the stack line, scale
  (screens / actions / groups / server-data calls / AI features / captures), a
  data/server-call inventory grouped by kind with tag chips, an AI inventory
  (purpose · model · via), a risk profile (count per network/auth/ai/cost/external/
  gate/weakpoint/bug), and screens per group. Works for any target — app, web page, or
  other program — since it computes purely from the graph/glossary/stack.

### Changed
- **Framework-neutral scan (not just Supabase).** A generality test scanning a plain
  vanilla-JS web app (REST `fetch` + OpenAI, no framework) surfaced that the api-tag
  vocabulary and GLOSSARY kindKo table were hard-coded to Supabase's five primitives, so
  a naive run bucketed REST calls as "기타". SCAN now documents generic tag conventions
  (`rest:<METHOD>:<path>`, `graphql:`, `http:`, `fn:`) alongside the Supabase set, and
  GLOSSARY maps rest/http/graphql → "서버 요청", fn → "서버 기능", and tells the model to
  name any other backend kind rather than dropping it to "기타". The visualization, Korean
  enrichment, risk annotation, and file/impl tracing were already backend-agnostic.

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
