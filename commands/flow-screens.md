---
description: Audit every screen's identity — the real (user-reachable) file it renders, delegation, file-sharing
argument-hint: "[graph.json | flow-map.json]  (default: docs/flow-map.json)"
---

> **flow-debugger 스크립트 위치**: 설치형이면 `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/`, 이 컴퓨터의 수동 복사본이면 `~/.claude/skills/flow-debugger/scripts/` — 있는 쪽을 쓴다.

Audit the identity of **every** screen — the one a user actually reaches — so nobody edits a legacy body
the app never renders.

```
node <scripts>/screens.js <graph.json | docs/flow-map.json>
```

각 화면마다 보여준다:
- **실제 렌더 파일** — 사용자가 보는 화면(=이걸 고쳐야 화면이 바뀐다).
- **🔀 위임** — 주소(URL)는 `src/app` 라우트 파일에 있지만 프로덕션은 다른 파일을 그림. 라우트 파일 본문을 고치면 빌드는 초록인데 화면은 안 바뀐다.
- **📎N 파일 공유** — 한 파일에 화면 N개(이 앱은 한 파일에 17화면도 있다). 이 파일을 고치면 그 화면들이 함께 영향.
- **⛔ 도달 불가** — dev-only / admin-only. 일반 사용자가 접할 수 없는 화면.
- **⚠ 실제 렌더 불명** — 재스캔 권장.

끝에 공유 파일별로 **어느 화면이 몇 번째 줄 범위인지** 묶어서 보여준다 — 그래서 그 파일의 특정 화면만 고칠 때
어디를 봐야 하는지 안다.

이 신원은 흐름도 HTML 에도 실린다: 화면 카드의 🔀/📎/⛔ 배지, 그리고 카드를 누르면 "화면 신원 — 사용자가 실제로 보는 것"
패널. `/flow-watch` 는 공유 파일을 고쳤을 때 **줄 범위로 어느 화면이 바뀌었는지** 구분해 배너에 그 화면만 띄운다.

핵심 불변식: **흐름도의 각 화면은 사용자가 실제로 접할 수 있는 화면을 표현한다 — 위임 출발 파일이나 도달 불가 화면이 아니라.**
