---
description: Is the flow map still current? Checks the map's fingerprint against the code (30 seconds)
argument-hint: "[app-root]  (default: current repo)"
---

> **flow-debugger 스크립트 위치**: 설치형이면 `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/`, 이 컴퓨터의 수동 복사본이면 `~/.claude/skills/flow-debugger/scripts/` — 있는 쪽을 쓴다.


Check whether the flow map still describes the app at: **$1** (if empty, the current repository root).

Run `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/check-stale.js docs/flow-map.json "$1"`
(or point it at whatever `flow-map.json` / `screenmap.*.json` this project uses).

- **FRESH** → every anchored file is byte-identical to when the map was built. The coordinates can be trusted.
- **STALE** → it prints exactly which files changed. The map's `file:line` coordinates may now be wrong; run
  **/flow-update** to move them to the current code (cheap), or **/flow** to fully re-scan if the app changed a lot.

Just report the result plainly — do not change anything.
