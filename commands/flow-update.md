---
description: The app changed — move the map's coordinates to the current code without a full re-scan
argument-hint: "[app-root]  (default: current repo)"
---

> **flow-debugger 스크립트 위치**: 설치형이면 `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/`, 이 컴퓨터의 수동 복사본이면 `~/.claude/skills/flow-debugger/scripts/` — 있는 쪽을 쓴다.


Update the flow map for the app at: **$1** (if empty, the current repository root) — the **cheap** refresh that
follows the code instead of re-scanning it.

1. **See what moved** — `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/check-stale.js <graph.json> "$1"`.
   If it is FRESH, stop: nothing to do.
2. **Follow the drift** — `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/rebase-anchors.js <screenmap.json> "$1"`
   (it reads the commit the map was built from and finds each anchored line where it lives now — a line that just
   shifted, or a file that moved/renamed, is followed automatically).
3. **Lines that were REWRITTEN** are listed, not guessed — those screens need a real re-scan (**/flow** on just them, or accept them as located).
4. **Re-verify** — `verify-anchors.js <screenmap.json> "$1" --fix <screenmap.json> --strict`.
5. **Rebuild** — `build.js … --app-root "$1" --strict-anchors` and `make-handoff.js …` so the HTML and handoff match.

Report before/after: how many coordinates moved, how many were rewritten, and that the map is verified again.
