---
description: Build (or rebuild) the interactive flow-debugger for this app — full scan + verified map + HTML + handoff
argument-hint: "[app-root]  (default: current repo)"
---

> **flow-debugger 스크립트 위치**: 설치형이면 `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/`, 이 컴퓨터의 수동 복사본이면 `~/.claude/skills/flow-debugger/scripts/` — 있는 쪽을 쓴다.


Build the flow-debugger for the app at: **$1** (if empty, use the current repository root).

This is the expensive, once-per-big-change build. Invoke the `flow-debugger` skill and follow its full
pipeline exactly — do NOT shortcut the anchor verification (a wrong `file:line` is worse than none):

0. **PRESCAN** `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/prescan.js` — production render path, gated routes, AI-in-helper index.
1. **SCAN** screens → actions → api/ai/anchors, merge with `merge-readers.js`.
2. **ENRICH** Korean labels + glossary (do not fold the 3 passes into 1).
3. **ANNOTATE** risks / checklist / failureModes.
4. **VERIFY** `verify-anchors.js <graph> "$1" --fix <graph> --strict` — the point of the whole tool.
5. **SHOTS** (권장 — 비개발자는 썸네일로 화면을 알아본다) `capture-shots.js` → `embed-shots.js`. 웹빌드를 못 띄우면 건너뛰되, 그 사실(그림 없음 → 아이콘 폴백)을 사용자에게 알린다. 옛 그림을 새 골격에 남기지 않는다.
6. **BUILD** `build.js --template … --graph … --out docs/flow-debugger.html --app-root "$1" --strict-anchors` (emits the fingerprint + backend layer).
7. **HANDOFF** `make-handoff.js` → `docs/FLOW-HANDOFF.md` + `docs/flow-map.json` (one scan feeds both the HTML and the handoff).

When done, tell the user the two outputs: the **HTML to open and click** (`docs/flow-debugger.html`) and the
**handoff a fresh session reads** (`docs/FLOW-HANDOFF.md`). Both come from this one scan.
