---
description: Regenerate the handoff docs (FLOW-HANDOFF.md + flow-map.json) from the CURRENT map — no re-scan
argument-hint: "[app-root]  (default: current repo)"
---

> **flow-debugger 스크립트 위치**: 설치형이면 `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/`, 이 컴퓨터의 수동 복사본이면 `~/.claude/skills/flow-debugger/scripts/` — 있는 쪽을 쓴다.


Regenerate the handoff for the app at: **$1** (if empty, the current repository root).

This is the **cheap** path — it re-renders the readable handoff from the map that already exists. Do NOT
re-scan the app.

1. Find the current verified graph (the `screenmap.*.json` the last build used; if unsure, ask).
2. Run `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/make-handoff.js <graph> "$1" --out docs/FLOW-HANDOFF.md --json docs/flow-map.json --name <App>`.
   - It preserves any downstream curation (bugAnchor / fixedIn / _anchorContract) and writes a fresh fingerprint.
3. If it refuses because coordinates are stale, the map has drifted — run **/flow-update** first, then retry.
4. If there is no map yet, tell the user to run **/flow** first (this command does not scan).

Report the handoff path and remind the user a fresh session only needs to read `docs/FLOW-HANDOFF.md`.
