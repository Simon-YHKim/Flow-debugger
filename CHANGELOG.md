# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [0.18.0] - 2026-07-15

### Added — screen IDENTITY: every node is the real, user-reachable screen (never a legacy body)
47 of 86 routes delegate (the URL lives in src/app but production renders a deep-space component
elsewhere) and 36 share a file with other screens (17 in one file) — so "which screen is this,
really?" was a constant trap: editing `src/app/(auth)/sign-in.tsx` changes nothing because
production renders `DeepSpaceSignInDesignScreen` in another file. `scripts/lib/screens-identity.js`
computes, for each screen, its real render file (what the user sees), whether the URL delegates
there, which screens share that file, its line-range inside a shared file, and whether a user can
reach it at all (dev-only gates). This lands as three things:

- **`/flow-screens`** — audit ALL screens at once: real file · 🔀 delegates · 📎N shares · ⛔ unreachable.
- **Flowchart badges + "화면 신원" panel** — every screen card shows 🔀/📎/⛔, and clicking it spells
  out the real render file, the delegation, and the screens it shares a file with (embedded via a
  new `__IDENTITY_JSON__` build token).
- **`/flow-watch` per-screen attribution** — editing one screen of a shared file (auth: 3 screens,
  lines 141/374/566) is attributed by line-range to THAT screen, not all three.

The invariant it enforces: a screen node represents the screen a USER can reach, never the legacy
body a delegating route file still contains, never a dev-only screen. 99 → **108 tests**.

## [0.17.0] - 2026-07-15

### Added — /flow-watch: serve on localhost so the page detects code changes live
A `file://` page is a baked static snapshot the browser sandbox can't refresh into truth — it can't
read your source. `scripts/serve.js` (Node http + fs, no deps) serves the HTML on localhost and answers
`/status` with the change classifier, plus an SSE `/events` stream that watches the anchored files. A
banner in the page — active only when served over http, hidden under `file://` so the emailed static
copy is unchanged — shows **● 최신** or **⚠ 코드 바뀜: 좌표만 밀림 N · 구조 바뀜 M(재스캔 권장)** on load,
tab-focus, and file-save. Detection only: the actual update stays the human-gated /flow-update, and the
banner never edits the map. `/flow-watch` starts it.

### Fixed — classifier reads old versions in a subdirectory app (monorepo)
`git show <commit>:<path>` wants a repo-root-relative path; when the app is a subdir of the repo the
old-version lookup failed and every changed screen fell back to "re-scan". classify-change now prepends
`git rev-parse --show-prefix`. Regression-tested end-to-end (git compare → drift vs re-scan). 96 → 99 tests.

## [0.16.0] - 2026-07-15

### Added — /flow-update now CLASSIFIES the change and ASKS before acting
A code change is one of two things and they are handled oppositely: coordinates just drifted (rebase,
cheap) OR the structure changed — a button/screen/nav/server call was added, removed, or repointed —
which rebase CANNOT reflect (it follows what exists; a new button has no anchor to follow, so it would
silently never enter the map). `scripts/lib/classify-change.js` + `scripts/classify-changes.js` read
each changed screen's OLD vs NOW source and count structural markers (buttons, navigation, server/AI
calls) plus the set of route targets and tables/edge-functions touched. Any delta → that screen is
flagged for re-scan; identical → drift, rebase is enough. On the reference app this correctly split 16
changed screens into 8 drift / 8 re-scan (e.g. a screen whose button count went 6→7 — a real added
button — is re-scan, not a moved line).

`/flow-update` is now **interactive**: it classifies, shows the human the split, and **must call
AskUserQuestion before any rebase, re-scan, or deletion** — classification is automatic, the decision
is the user's. New nodes only ever appear via a re-scan, never invented.

### Verified adversarially
A 4-lens workflow pressure-tested the classifier and command. It confirmed zero misclassifications on
real data and surfaced gaps that are now fixed and regression-tested: comments and string bodies are
stripped before counting (a comment mentioning `router.push` no longer flips a screen to structural);
`.from(` only counts with a string arg (Array.from no longer reads as a DB call); and the marker set
now catches shared `<Action>` wrappers, data hooks (useQuery/useMutation/useSWR), gesture handlers,
aliased navigation (useRouter/useNavigation), the Vercel AI SDK, Supabase auth/realtime, and the
`onPressIn` regex-boundary bug. The command was tightened so drift is also gated behind the question and
"rewritten" screens found mid-rebase loop back to ask. 85 → 96 tests.

## [0.15.0] - 2026-07-15

### Added — four `/flow*` slash commands, one per moment of use
The plugin did one big thing on trigger. But a person uses it at four different moments, and the
expensive scan should not run when it is not needed. Split the invocation (not the plugin — one scan
still feeds both renders):

- **`/flow`** — the once-per-big-change build: scan → verify → HTML + handoff.
- **`/flow-handoff`** — re-render just the handoff docs from the current map (no re-scan). For handing off to another session.
- **`/flow-check`** — is the map still current? fingerprint vs code, ~30s. Changes nothing.
- **`/flow-update`** — the app moved; follow the drift with rebase-anchors and rebuild. No re-scan.

Named with a leading `flow` so typing `/flow` autocompletes all four. Daily *use* stays in the HTML
itself (click, reorder, "안 돼요" → prompt); the commands are only for building and maintaining the map.
SKILL.md and README now open with the four-moment usage table.

## [0.14.6] - 2026-07-15

### Fixed — a re-scan's new bugs now carry a bugAnchor
When a fuller re-scan surfaces bug-risk actions the human triage never saw, those arrive as knownBug
with no bugAnchor — which breaks the contract "every knownBug carries a bugAnchor". make-handoff now
defaults a missing bugAnchor to the action's screen `file` coordinate (never `impl`/src/lib, per the
contract). 75 -> 77 tests.

## [0.14.5] - 2026-07-15

### Added — exported prompts name the file and line to edit, and say "read only there"
The exported bug-report and fix-request prompts are consumed by a coding agent, and that agent burns
tokens searching a codebase it does not know. So every request now opens with a plain
**`고칠 파일: \`path\` 파일의 N번째 줄 근처`** pointer (derived from the verified anchor — the real-logic
`@` location, falling back to the render file, then a bare file), and the work-rules tell the agent it
may **read only the ±40 lines around that anchor instead of the whole file** when the mark is ✔ or ·.
A wrong coordinate costs the downstream agent MORE than none (it reads the wrong file and re-searches),
which is why this rides on the verified anchors rather than raw scan output.

## [0.14.4] - 2026-07-15

### Fixed — a regenerate no longer vandalises downstream curation (near-miss)
A handoff map is generated from a scan, but downstream a human triage writes onto it what a scan
cannot: `bugAnchor` (WHERE a defect actually lives — the screen, not the lib the action calls),
`fixedIn`/`notABug` verdicts, and a top-level `_anchorContract` carrying a hard-won lesson. On a live
run, regenerating the map from a fresh scan **silently erased 41 bug locations, 17 fixed-verdicts and
the contract**, and broke the repo's own test that guards them. make-handoff now MERGES: any field the
scan does not own is carried forward, keyed by (route, raw action); a triage verdict (fixed / not-a-bug)
wins over the scan's mechanical `risks.includes('bug')`. A self-test regenerates over a curated file and
asserts the contract, bugAnchor, fixedIn and the cleared-bug verdict all survive.

### Fixed — the handoff's bug table obeyed the very rule it documents
The "known bugs" table cited `impl || file` — i.e. it preferred `impl`, the lib function the action
calls, which is exactly the anchor `_anchorContract` warns never to cite (the lib throws; the screen
swallows). It now cites `bugAnchor` then `file`, never `impl`, and lists only what triage still
considers open (22, not the scan's raw 41), so the read artifact matches the looked-up one.

### Fixed — three NUL bytes in make-handoff.js
The heredoc footgun again: `grep` saw the file as binary. Scanned and repaired; the control-char scan
is part of the pre-commit routine. 71 → **75 tests**.

## [0.14.3] - 2026-07-15

### Fixed — two latent bugs from reading `git.commit` where the fingerprint writes `git.head`
The handoff opened with "이 지도는 커밋 `?`" (the commit was never resolved), and rebase-anchors could
not auto-detect its base from the fingerprint sidecar, so every run needed an explicit `--from`.
Both now read `git.head`. A self-test drives the fingerprint→rebase auto-base path so the field name
cannot silently rot again. rebase-anchors also refuses a non-graph input (e.g. flow-map.json) with a
clear message instead of a stack trace.

### Added — `impl` anchors are named with the function they implement (honestly)
227 of 2nd-B's `impl` anchors pointed at a file:line with no symbol confirmed. Each of those lines is
often a clean definition (`export function useSignInForm`, `const handleSubmit = useCallback`), and a
reader wants that name without opening the file. `nameImplAnchors` reads it off the code and records
it in a **separate `implName` field** — deliberately NOT embedded in the coordinate. Embedding it
would let the verifier read the name back and "confirm" it, promoting the anchor to the VERIFIED tier
it never earned — a tautology, since the name came from that very line. So the tier is untouched
(verified stays 509, honest), and the name shows as "실제 로직 — useSignInForm()". A self-test asserts
the trust count does not move when an impl is named. 59 → **71 tests**.

## [0.14.2] - 2026-07-15

Two features shipped in 0.14 without a test that could catch them dying, and one that gave up too
early. Fixed all three — the way this tool is supposed to prevent, by proving each against a
deliberately broken build.

### Added — the server view and drag-reorder are now asserted end-to-end
`verify-html.js` drives both in a real browser: it opens 🗄 서버·데이터 and checks the layer draws
(against the page's own embedded backend counts, so a whole-layer-dead regression fails), that the
table/handler panels actually explain RLS and auth; and it grabs a screen card **with the mouse**,
drops it on an arrow, and asserts the result is A→C→B with an export that names the button, its
`file:line`, and the "먼저 물어봐줘" guard. Proven by sabotage: nulling `spliceInto` and emptying the
server graph both turn the run RED. This is the gap that let v0.11's delegation warning ship dead
under green tests.

### Added — drift repair follows a file that was moved or renamed
`rebase-anchors.js` used to give up when a file's path changed ("file gone"). It now reads git's
rename record between the map's commit and HEAD and carries the anchor to the file's new home,
line and all. 42 → **59 self-tests** (drift: line-shift, rewritten-line-not-guessed, and now
follow-a-rename).

### Fixed — docs had drifted from the tool
README described a 6-step pipeline and 25 tests; it now documents prescan, the backend scan, the
fingerprint, check-stale/rebase-anchors, the two-layer system view, and the no-LLM "discuss first"
prompt.

## [0.14.1] - 2026-07-14

The four things the plugin claimed to do, actually done — and done for **any** codebase, not the
one it was written against.

### Added — ④ …and when it is stale, the coordinates move instead of being re-scanned
`scripts/rebase-anchors.js`. Detecting drift is only half of it. Real drift is mostly innocent —
someone adds an import and every line below shifts down by one — and a map that demands a full
LLM re-scan for that is a map nobody ever re-runs. So the repair reads **the actual line of code**
the anchor pointed at *in the commit the map was built from* (the fingerprint knows which), and
finds that same line where it lives today. A line that moved is still the same line.
On the reference app after 4 upstream merges: **823 unchanged, 121 moved, 0 rewritten** — the map
came back to `exact 509 / broken 0` with no re-scan at all.
A line that was genuinely **rewritten** is not guessed at: it is listed, and only those screens
need a real re-scan. `make-handoff` now **refuses to write a handoff over broken anchors**
(`--allow-stale` to override) — stamping today's date on yesterday's map is precisely the failure
this tool exists to prevent, and it was doing it.

### Added — ④ the map now says when it is stale
`scripts/lib/fingerprint.js` + `scripts/check-stale.js`. Every claim this tool makes is a claim
about source code at a moment in time. The moment the app changes, the map drifts — silently — and
keeps handing out coordinates that *used to be* right. That is the exact failure the anchor tiers
exist to prevent, and the map itself had no such discipline.
`build.js` now records the evidence the map was built from (the commit, and the content hash of
every file it anchors into) and `check-stale.js` answers *what changed under this map?* with a
number rather than an opinion. **Put it in CI.** The page and both exported prompts now open by
stating the commit they rest on.

### Added — ② a system flow that actually reaches the system
`scripts/lib/backend.js`. The map used to stop at the tag: a screen called `edge:send-mail` and
then **nothing** — what that function does, which tables it writes, whether a policy will refuse
it, all invisible. "System flow" was screen flow with the server's name on a card.
🌐 시스템 플로우 now has two layers: `↔ 이동 그래프` and **`🗄 서버·데이터`** —
**화면 → 서버 작업 → 서버 함수 → 테이블(RLS·정책)**. Handlers are found wherever the ecosystem puts
them (Supabase edge functions, Next route handlers, Express/Fastify, Netlify/Cloud functions) and
the schema wherever it lives (SQL migrations, Prisma, Drizzle). On the reference app: 9 handlers,
42 tables, 80 tags linked, and one handler with **no auth guard** surfaced.

### Added — ③ drag a screen onto an arrow to reorder the flow
🔀 순서 편집 in the nav view. Drop C onto the A→B arrow and the order becomes **A→C→B**.
But an arrow between screens is not an abstract edge — **it is a button**. So the export does not
say "reorder the graph"; it says *"the 『담기』 button on 홈 (src/app/home.tsx:120 ✔) must now open
미리보기, and 미리보기 has no way to reach 담기 yet"*. That is what a developer implements.
When several buttons lead to the same screen, the tool **does not decide for you** — it lists them
and the prompt says *"나는 전부 바꾸라고 한 적 없어. 먼저 물어봐줘."*

### Added — the exported prompt asks the agent to think, then discuss
Per request, no LLM is called from the plugin. Instead every export now opens with:
*"먼저 어떻게 처리하는 게 최선인지 생각해줘. 방법이 두 가지 이상이면 바로 고르지 말고, 장단점과
영향 범위를 정리해서 나에게 물어봐. 내가 동의한 다음에 고치기 시작해."*

### Fixed — ① the captures were built and then left out
58 screenshots existed and the committed map shipped with **zero**. They are in the build now.

### Fixed — GENERALITY: it only worked on the app it was written for
- **The AI gateway was a list of one product's function names** (`callGemini`, `embedTexts`…), so
  an app whose gateway is called `askAI()` simply had "no AI". It is now **discovered from the
  app's own imports**: a file that imports a model SDK (OpenAI, Anthropic, Google, Cohere,
  Mistral, Bedrock, LangChain…) or hits a model endpoint *is* the gateway, whatever it is called.
- **Backend recognition was Supabase-only.** Prisma, Drizzle, Kysely, Knex, Mongoose, Firebase,
  raw SQL, axios and GraphQL are recognised now.
- Deleted `extract-prompt.js` — an undocumented leftover with one app's routes hard-coded in it.
- `self-test.js` gained a synthetic **Next + Prisma + OpenAI** app: the suite now proves the tool
  finds a gateway it was never told the name of, a route handler, a Prisma schema, and a stale map
  — on a codebase that looks nothing like the one this was built against. 42 → **52 tests**.

## [0.13.1] - 2026-07-14

### Fixed — the handoff was a dump, not a handoff
v0.13.0's handoff was 1,350 lines, 950 of them a coordinate table for every action. A fresh
session reading it burns its context on tables and still does not know what the app is, and the
three things that would have saved it are buried on line 900. **A handoff has to be read to be
worth anything.** Split into the two jobs it was conflating:

| | what it is | size |
|---|---|---|
| `FLOW-HANDOFF.md` | what you **read**, once, in two minutes | ~30 KB |
| `flow-map.json` | what you **look up**, per screen, when you are about to touch it (jq-able) | full data |
| `flow-debugger.html` | what you **click** | — |

The markdown now leads with **the three traps that actually cost an afternoon** in that
codebase, then the feature map and the verified known bugs. Every exhaustive table moved to the
JSON, with `jq` recipes in the doc for the questions people actually ask ("which file do I edit
for this screen?", "what touches this table?", "which actions use AI?").

- The feature map's one-liner column borrowed the first screen's summary, which produced
  "인증·시작 = 빈 껍데기입니다" (it had grabbed the layout wrapper). A wrong one-liner is worse
  than none; the screen names say it themselves.

## [0.13.0] - 2026-07-14

### Added
- **`scripts/make-handoff.js` — pipeline step 7. The map becomes a handoff.**
  The interactive HTML is for a human. This is for the next agent (or the next you): one
  git-persistent markdown file, committed to the TARGET repo and merged, that hands over the
  app's real structure so a fresh session does not start from zero.
  It leads with **the three mistakes a new session actually makes** in that codebase, because
  that is the whole point:
  · editing the file production does not render (the delegation switch, named, with the
    production render file listed per screen)
  · "fixing" a bug on a route a real user cannot open (the gated routes, listed with evidence)
  · missing what an innocent-looking helper really does (`createRecord()` calls an AI three
    frames down — the helpers are listed)
  Then: screen inventory, the screen-to-screen graph as mermaid, the server/data and AI
  inventories, **every verified code coordinate** with its trust mark, the map's own reliability
  stats, and the command to regenerate it. Paths are repo-relative — a handoff that only works
  on one machine is not a handoff.

### Fixed
- **The helper index called a URL cleaner an AI.** `classify\w*` / `transcribe\w*` matched
  ordinary error-classifier functions, so `normalizeAnalyticsUrl()` was reported as calling a
  language model. A handoff that says that is worse than no handoff — the reader stops trusting
  the whole file. The AI entry points are named explicitly now and the call graph finds the rest
  (46 "AI helpers" → 27, with `createRecord()` still correctly caught).
- **Helper capabilities propagated through name collisions.** A callee now only counts if the
  file actually imports it or defines it.
- **The last exported function in a file inherited the rest of the file.** Bodies are bounded.

## [0.12.1] - 2026-07-14

Found by actually running the pipeline end to end on a real 86-screen app, which is the only
way these were ever going to surface.

### Fixed — the verifier had quietly stopped verifying
- **`validateGraph` double-wrapped the symbol.** It received `{symbol, feature}` and passed it
  on as `{symbol: {symbol, feature}}`, so `IDENT.test()` saw an object, found no identifier, and
  reported every anchor as `unchecked` — *even the 253 that carried a perfectly good function
  name*. The verifier stopped verifying and reported the result as if it had. Real map:
  **8 verified → 253 verified** once the symbol actually reached the check.
- **`renders` was flagged for doing its job.** The field names WHERE A SCREEN IS PAINTED, so it
  points at a JSX line or a section comment by definition — and the non-code rule fired on it.
  46 false CAUTIONs on the real map.
- **A JSX line that carries the behaviour is where the behaviour lives.** `onPress={() => save()}`
  and `<Link href="/x">` are the handler; flagging them was a false alarm on a correct anchor,
  and a false alarm costs more trust than a missed one. Only a BARE render line
  (`return <DeepSpaceShell />` with the handlers elsewhere) is refused now.
- **`prescan` named the wrong render switch with full confidence.** It took the first
  plausibly-named function in `lib/` and reported `isCaptureDraftMode()` on an app whose actual
  switch is `isDeepSpaceUI()` — the exact class of error the module exists to prevent. It now
  finds the function that ROUTE FILES actually branch on and ranks by how many do.
- **`apply-anchors` dropped the `symbol` field** a RESCAN produces, so the whole point of the
  re-scan (giving the verifier something to compare against) was lost on merge.

### Result on the real app (86 screens, 342 actions, 608 anchors)
A full framework-aware RESCAN through the fixed pipeline:

| | before | after |
|---|---|---|
| VERIFIED (function found at that line) | 8 | **253** |
| CAUTION (blank / import / comment / bare JSX) | 88 | **0** |
| SUSPECT (function is not there) | 1 | **0** |
| NOT A LOCATION (prose in a coordinate) | 0 | **0** |
| BROKEN | 0 | **0** |
| delegation traps (anchor into a file that renders something else) | 3 | **0** |
| `--strict` | fails | **passes** |

The remaining 355 are `LOCATED` — file and line are real, and the report says plainly that no
function name was compared, because none was recorded. It does not claim a check it did not run.

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
