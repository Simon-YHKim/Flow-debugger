---
description: Serve the flow-debugger on localhost so the page detects code changes live (banner on refresh/save)
argument-hint: "[app-root]  (default: current repo)  [--port 8848]"
---

> **flow-debugger 스크립트 위치**: 설치형이면 `${CLAUDE_PLUGIN_ROOT}/skills/flow-debugger/scripts/`, 이 컴퓨터의 수동 복사본이면 `~/.claude/skills/flow-debugger/scripts/` — 있는 쪽을 쓴다.

Serve the flow-debugger for the app at **$1** (if empty, the current repo) so the page can DETECT code changes.

왜 이게 필요한가: `flow-debugger.html` 을 `file://` 로 그냥 열면, 그건 지도가 **구워진 정적 스냅샷**이고
브라우저 샌드박스 때문에 소스를 못 읽어서 **새로고침해도 변화를 감지 못 한다.** localhost 로 서빙하면 서버가
파일시스템을 읽어 `/status`(분류기)로 답해주고, 페이지가 **새로고침·탭 복귀·파일 저장** 때 배너로 알려준다.

### 실행
```
node <scripts>/serve.js <appRepo>/docs/flow-debugger.html <screenmap.json> "$1" [--port 8848]
```
- `docs/flow-debugger.html` 와 `screenmap.*.json`(지문 사이드카 `*.fingerprint.json` 포함)이 이미 있어야 한다.
  없으면 먼저 **/flow** 로 빌드하라고 안내한다.
- **백그라운드로 띄우고**(run_in_background) 부팅 로그의 URL(`http://localhost:8848`)을 사용자에게 알려준다.
- 파일 와처가 붙어 있어, 코드를 저장하면 (새로고침 없이도) 배너가 뜬다. 종료는 Ctrl+C / 그 프로세스 kill.

### 사용자에게 설명할 것
- 브라우저에서 그 주소를 열면 상단 배너가:
  - **● 최신** — 코드가 지도와 일치.
  - **⚠ 코드 바뀜** — 좌표만 밀림 N화면 · **구조 바뀜 M화면(재스캔 권장)**. "무엇이 바뀌었나"로 화면 목록.
- 배너는 **감지만** 한다. 실제 갱신은 **/flow-update**(분류→물어봄→이사/재스캔). 배너가 스스로 지도를 고치지 않는다.
- `file://` 로 열면 배너는 꺼지고 예전처럼 정적 스냅샷으로 동작한다(같은 HTML, 두 모드).

포트가 이미 쓰이면 `--port <다른번호>` 로 다시 실행한다.
