---
name: flow-debugger
description: >-
  Use when a non-developer needs to see and debug how an app actually works,
  screen by screen - triggers "플로우 디버거", "워크플로우 디버깅", "비개발자 디버깅",
  "화면 흐름도 만들어", "어디서 막히는지", "이거 왜 안 돼", "flow debugger",
  "debug for non-developers", "visual flow map". Scans the app screens and maps
  every screen to its user actions, the data and server calls (db, rpc, edge
  function, storage, auth, REST, GraphQL) and AI calls, VERIFIES every code
  anchor against the real source tree, then writes one self-contained
  interactive flow-debugger.html with clickable nodes, drag-and-drop, plain
  Korean labels, real screenshot thumbnails, risk markers (인터넷/비용/AI/외부의존/약점),
  per-action diagnostic checklists, connection editing, and a bug-report
  generator that turns a vague "안 돼요" into a precise, VERIFIED file:line report.
  Produces the HTML plus a copy-paste fix and bug prompt for the assistant.
version: 0.16.0
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
compatibility: [claude-code]
author: Simon Kim
---

# flow-debugger

비개발자가 자기 앱의 **워크플로우를 눈으로 보고 디버깅**할 수 있게 하는 스킬.
앱 화면을 전수 스캔해 `화면 -> 사용자 동작 -> 데이터/서버 작업 + AI`로 잇고,
각 동작에 **약점 마커 + 진단 체크리스트**를 붙여, 비개발자가 "여기서 안 돼요"를
**개발자가 바로 고칠 수 있는 신고서(검증된 file:line 포함)**로 바꿔 보낼 수 있는
단일 HTML(`flow-debugger.html`)을 만든다.

이 스킬의 단 하나의 포인트: **비개발자도 워크플로우를 쉽게 디버깅한다.**
그래서 모든 라벨은 쉬운 한국어, 코드 식별자는 "개발 정보"로 분리, 위험은 색으로,
고장 신고는 폼으로 받는다.

## 정밀도가 이 도구의 전부다

그림은 이해를 돕지만, 개발자(또는 코딩 에이전트)에게 **실제로 전달되는 것은 `file:line` 한 줄**이다.
**틀린 좌표는 없는 것보다 나쁘다** — 에이전트가 프로덕션에 렌더되지도 않는 파일을 고치고,
빌드는 초록이고, 화면은 그대로다.

그래서 파이프라인에 **앵커 검증(4단계)이 들어 있고, 건너뛸 수 없다**:
모든 좌표를 실제 소스트리에 대조해서 — 파일이 있는지, 줄이 범위 안인지,
**그 줄에 그 함수가 실제로 있는지**까지 확인하고, 어긋난 줄은 심볼 위치로 보정하고,
좌표가 아닌 산문은 좌표 자리에서 빼낸다. 그 결과가 신고서에 ✔ / ~ / ⚠ 로 그대로 실린다.

## 사람이 쓰는 법 — 명령어 4개 (`/flow*`)

비싼 건 **스캔 한 번**이고, HTML(사람용)과 핸드오프(AI/개발자용)는 그 스캔의 두 렌더다.
그래서 하나의 플러그인, 네 개의 시점으로 나눈다:

| 명령어 | 언제 | 하는 일 | 비용 |
|---|---|---|---|
| **`/flow`** | 처음 / 앱이 크게 바뀐 뒤 | 전수 스캔 → 검증 → **HTML + 핸드오프 둘 다** | 비쌈(1회) |
| **`/flow-handoff`** | 다른 세션·사람에게 넘길 때 | 현재 지도로 핸드오프 문서만 재생성(**재스캔 X**) | 쌈 |
| **`/flow-check`** | 앱이 바뀐 것 같을 때 | 지도가 아직 맞는지 지문 대조 | 30초 |
| **`/flow-update`** | 낡았을 때 | **화면별로 좌표만 밀림 vs 구조 바뀜 분류 → 사용자에게 물어보고** 좌표 이사 / 재스캔 → 재빌드 | 쌈~중간 |

- **쓰기(매일)**는 명령어가 아니다: `/flow`로 만든 `flow-debugger.html`을 **열어서** 클릭·순서편집·"안 돼요"로 버그/수정 프롬프트를 복사한다.
- **넘기기**: 받는 쪽은 `docs/FLOW-HANDOFF.md`만 읽으면 된다.
- 모드 라우팅: "핸드오프만" 요청에 전체 파이프라인을 돌리지 말고 `/flow-handoff`(=make-handoff)만, "아직 맞아?"엔 `/flow-check`만 실행한다.

## When to use / boundaries

발동:
- "플로우 디버거 만들어", "워크플로우 디버깅", "이 앱 어디서 막히는지 보여줘" → `/flow`
- "비개발자도 알아보게 화면 흐름도", "이거 왜 안 되는지 신고서 만들어줘" → `/flow`
- 앱 인수인계, 비개발 PM/창업자에게 구조 설명, 버그 1차 분류(triage)

쓰지 말 것 (경계):
- 다양성 페르소나로 막힘 점검 -> `persona-simulation`
- 한 디자이너 시선의 시각 QA -> `design-review`
- 권한/IDOR 점검 -> `authz-designer`
- 코드 구조/순환참조 -> `code-health-guard`
- 이 스킬은 "비개발자가 **읽고 디버깅**하는 인터랙티브 맵"이 핵심. 정적 보고서가 아니다.

## 선행 체크 (코드 근거 없으면 중단)

스캔할 **실제 화면 코드**가 있어야 한다. 추측 금지.

```bash
ROOT="${1:-.}"
# Expo/RN: src/app · Next(app/pages 라우터) · SvelteKit: src/routes · Nuxt/Vue: pages·src/views
# CRA/Vite: src/screens·src/pages · 그 외: 사용자가 지정
for d in "src/app" "app" "src/pages" "pages" "src/screens" "src/routes" "src/views" "views" "screens"; do
  ls "$ROOT/$d"/*.{tsx,jsx,ts,js,vue,svelte} >/dev/null 2>&1 && { echo "SCREENS: $ROOT/$d"; exit 0; }
  [ -d "$ROOT/$d" ] && { echo "SCREENS: $ROOT/$d"; exit 0; }
done
echo "NO_SCREEN_CODE"
```

`NO_SCREEN_CODE` 면 멈추고 **사용자에게 화면 코드 디렉터리를 물어본다**
(그 경로를 SCAN 프롬프트의 `<FILE LIST>` 로 그대로 넣으면 된다 — 별도 설정 파일은 없다).
화면이 없는 대상(API 서버·CLI)이면 중단하지 말고 `<graph>.mode.txt` = `backend`/`cli` 로 진행한다.

## 파이프라인 (8단계 + 상시 stale 점검)

프롬프트 전문은 [references/scan-prompts.md](references/scan-prompts.md) 에 있다.
화면이 많으면 Workflow(또는 `agent-delegate`)로 그룹별 병렬 fan-out 한다.
출력 디렉터리는 `<project>/Output` 또는 사용자가 지정한 곳.

### 0) PRESCAN — 리더가 스스로 알 수 없는 사실을 먼저 구한다 (**필수**)
```bash
node scripts/prescan.js <appRoot> --out Output/prescan.json
```
실측으로, 이 스킬을 86화면 앱에 돌렸을 때 **27화면만 정확**했고 275건의 오류가 났다. 원인 중 셋은
모델이 아니라 **질문**의 문제였다 — 눈앞의 파일만 봐선 답할 수 없는 걸 물었다:
- **프로덕션은 어느 컴포넌트를 그리는가** (위임을 못 따라가 화면 10개가 아예 다른 화면이 됐다)
- **사용자가 이 코드에 닿는가** (dev 전용 라우트의 버튼을 "데이터 손실"로 신고 — **허위 버그 4건**)
- **이 헬퍼가 속으로 뭘 하는가** (`createRecord` 안의 임베딩 호출 — 서버 66·AI 7 누락)

prescan 이 셋을 스크립트로 답한다. 그 출력을 **SCAN 프롬프트 맨 위에 붙여서** 리더에게 준다
(scan-prompts.md "0단계 PRESCAN").

### 1) 스캔 (필수)
화면 목록을 그룹으로 나눠, 각 리더가 화면을 전수 읽고 동작별로
`feature / symbol / apis[] / ai / file / impl / renders / to` 를 추출한 JSON 배열을 반환한다
(scan-prompts.md "SCAN"). 앵커 규칙은 그 문서 맨 위 "앵커가 이 스킬의 전부다"를 따른다.

api 태그는 앱의 실제 백엔드에 맞춘다 — Supabase(`db:` `rpc:` `edge:` `storage:` `auth:`)든
범용(`rest:` `graphql:` `http:` `fn:` `external:`)이든. **`ai` 는 `{purpose, model, via}` 객체 또는 `null`**
(문자열로 쓰면 흐름도에 빈 AI 카드가 생긴다 — merge-readers 가 잡아서 멈춘다).

```bash
node scripts/merge-readers.js <workflow-output.json> Output/screenmap.json
```

### 2) 한국어 보강 (권장, 비개발자 필수)
각 화면/동작에 `titleKo / groupKo / summaryKo / actionKo / plain / example` 추가 + 용어집
(scan-prompts.md "ENRICH", "GLOSSARY"). `groupKo` 가 없으면 그룹 칩이 **영문 id** 로 나온다.
산출: `Output/screenmap.ko.json`, `Output/glossary.ko.json`.

### 3) 디버그 주석 (이 스킬의 핵심)
각 동작에 `risks[]` / `checklist[]` / `failureModes[]` 추가 (scan-prompts.md "ANNOTATE").
산출: `Output/screenmap.debug.json`.

### 4) 앵커 검증 · 보정 (**건너뛰지 말 것 — 신고서의 신뢰도 전부**)
```bash
node scripts/verify-anchors.js Output/screenmap.debug.json <appRoot> --fix Output/screenmap.debug.json
node scripts/verify-anchors.js Output/screenmap.debug.json <appRoot>   # 결과 확인
```
- 줄 번호가 없으면 **심볼로 찾아서 채우고**, 어긋난 줄은 **실제 위치로 보정**하고,
  파일명만 있으면 소스트리에서 찾아 경로를 완성한다.
- 그 줄에 함수가 없으면 `SUSPECT`, 빈 줄/import/주석이면 `WEAK`, 산문이면 `NOT A LOCATION`
  (→ `implNote` 로 옮겨 좌표 행세를 못 하게 한다), 파일이 없으면 드롭.
- `SUSPECT`/`WEAK` 가 많으면 그 화면만 **RESCAN** 하고 `apply-anchors.js` 로 병합한다
  (scan-prompts.md "RESCAN / PATCH"). 한국어·위험 주석은 보존된다.

### 5) 스크린샷 (선택, 화면 인식↑)
절차 전문: [references/capture-shots.md](references/capture-shots.md)
```bash
node scripts/capture-shots.js Output/screenmap.debug.json http://localhost:8081 Output/shots
node scripts/embed-shots.js Output/shots/shots-map.json Output/shots.json
```

### 6) 빌드
```bash
node scripts/build.js assets/flow-debugger.template.html \
  Output/screenmap.debug.json Output/glossary.ko.json Output/shots.json \
  Output/flow-debugger.html --app-root <appRoot>
```
**`--app-root` 를 반드시 준다.** 안 주면 빌드는 되지만 신고서의 모든 좌표에 "미검증"이 붙는다.
build.js 는 토큰 주입 후 `new Function` 으로 JS 구문을 자가검증하고, 앵커 상태를 HTML 에 심는다.

라이브 검증(선택이지만 권장 — 구문 통과 ≠ 페이지가 돈다):
```bash
npm install    # playwright (skills/flow-debugger/package.json)
node scripts/verify-html.js Output/flow-debugger.html --template assets/flow-debugger.template.html
```
겹침 0 · pageerror 0 · 앵커 검증됨 · 빈 신고서 차단 · 템플릿에 남의 앱 문자열 없음 을 확인한다.

선택 사이드카(그래프와 같은 폴더, `<graph>.<이름>`):
- `screenmap.debug.appname.txt` — 페이지 제목/브랜드에 쓸 앱 이름 한 줄(없으면 "앱").
- `screenmap.debug.stack.txt` — 프레임워크·백엔드·렌더 위임 한 줄. 내보내는 프롬프트 맨 위 `[앱 스택]`.
  (`apply-anchors.js` 가 RESCAN 패치의 `stack` 에서 자동 생성한다.)
- `screenmap.debug.mode.txt` — `ui`(기본) / `backend`(엔드포인트) / `cli`(명령).
- `screenmap.debug.harness.json` — 이 앱의 AI 배선을 직접 그릴 때
  (`{nodes:[{id,hx,hy,color,label,role,detail}], edges:[[from,to]]}`). 없으면 스캔한 AI 호출에서
  **자동 파생**한다(없는 단계를 지어내지 않는다).

### 6.5) **낡음 점검 → 분류 → 좌표 이사 / 재스캔** (드리프트 대응 = `/flow-check`·`/flow-update`)
```bash
node scripts/check-stale.js      <graph.json> <appRoot> --strict     # 낡았나? (CI 에 넣을 것) = /flow-check
node scripts/classify-changes.js <graph.json> <appRoot>             # 화면별: 좌표만 밀림 vs 구조 바뀜
node scripts/rebase-anchors.js   <graph.json> <appRoot> --from <커밋> # 좌표만 밀린 것 → 옮긴다
node scripts/verify-anchors.js   <graph.json> <appRoot> --strict     # 그리고 다시 증명한다
```
`build.js` 는 지도를 만들 때 **지문**(커밋 + 앵커한 모든 파일의 해시)을 남긴다. 앱이 바뀌면
`check-stale` 이 **무엇이 바뀌었는지 숫자로** 답한다.

드리프트는 대개 무해하다 — import 한 줄 추가되면 아래가 전부 한 줄씩 밀린다. 그래서 `rebase-anchors` 는
**지도를 만든 커밋에서 그 줄의 코드 내용을 읽어, 지금 파일에서 같은 줄을 다시 찾는다.** 옮겨간 줄은
여전히 같은 줄이고, 파일이 통째로 **이동/개명**돼도 (git rename 추적) 따라간다.

**하지만 rebase 는 "있던 것의 이동"만 따라간다 — 없던 버튼·화면·이동·서버호출은 못 만든다.** 그래서
`classify-changes` 가 바뀐 화면마다 old↔now 구조 마커(버튼·이동·서버·AI 호출 수, 이동 대상·테이블 집합)를
대조해 **좌표만 밀림(rebase 로 충분) vs 구조 바뀜(재스캔 필요)** 로 가른다. 이게 `/flow-update` 가 코드를
고치기 전에 읽는 것이다 — **분류는 자동, 결정은 사용자**: 재스캔·삭제는 사람에게 물어본 뒤에만 한다
(새 버튼을 지어내면 그게 이 도구가 금지하는 "지어낸 노드"다).

- 그 줄이 **재작성/삭제**됐다면 rebase 가 **추측하지 않고 목록으로 뱉는다** — 그 화면만 재스캔.
- `make-handoff` 는 깨진 좌표가 남아 있으면 **핸드오프 생성을 거부한다**(`--allow-stale` 로만 강행).
  낡은 지도에 오늘 날짜 도장을 찍어주는 게 이 도구가 막으려는 바로 그 실패이기 때문이다.

### 7) 핸드오프 — **새 세션이 앱 구조를 이어받게 한다**
```bash
node scripts/make-handoff.js <graph.json> <appRoot>   --glossary Output/glossary.ko.json --prescan Output/prescan.json   --out <appRepo>/docs/FLOW-HANDOFF.md --html docs/flow-debugger.html --name "<앱 이름>"
```
인터랙티브 HTML 은 **사람**을 위한 것이다. 이건 **다음 에이전트(또는 다음의 나)** 를 위한 것이다 —
git 에 남는 마크다운 하나로 앱의 실제 구조를 넘긴다:

- **이 앱에서 새 세션이 저지르는 실수 3가지** (프로덕션이 안 그리는 파일 고치기 · 열리지도 않는 화면의
  "버그" 고치기 · 겉보기와 다른 헬퍼) — 이게 이 문서의 존재 이유다
- 화면 인벤토리 (그룹별, **프로덕션 렌더 파일** 열 포함) · 화면 이동 그래프(mermaid)
- 서버·데이터 작업 · AI 기능 인벤토리
- **검증된 코드 좌표** (화면 → 동작 → file:line, ✔/·/⚠ 등급)
- 이 맵의 신뢰도 통계 + **맵 갱신하는 법**

**반드시 대상 앱 레포에 커밋하고 main 에 머지한다.** 한 대의 머신에만 있는 핸드오프는 핸드오프가 아니다.
다음 세션은 `git pull` 후 이 파일 하나만 읽으면 구조를 안다.

## 비개발자가 얻는 디버깅 기능 (HTML)

- **약점 마커**: 동작 카드에 색점으로 "인터넷 필요/비용/AI/외부의존/조용한 실패 위험" 표시
- **증상 -> 경로 추적**: 동작을 누르면 "이게 되려면 필요한 것"(데이터/서버/AI)이 강조됨
- **진단 체크리스트**: 동작별 "안 될 때 확인하세요" + "이렇게 안 될 수 있어요"
- **버그 신고서**: **화면 카드에서도, 동작 카드에서도** "안 돼요"를 누르고 증상만 적으면
  (증상은 필수 — 빈 신고서는 내보내지 않는다) 코드 위치·의존 작업·점검 포인트가 박힌 신고서가 생성.
  각 좌표에 **✔(대조 확인) / ~(줄이 코드가 아님) / ⚠(믿지 말 것)** 이 붙어, 코딩 에이전트가
  어디를 믿고 어디를 직접 찾아야 하는지 안다.
- **코드 위치 패널**: 카드마다 검증 결과와 그 이유를 한국어로 표시
- **시스템 스펙**(상단 📋): 스택·규모·서버작업·AI·위험 프로필 + **코드 위치 신뢰도**
- **AI 하네스**: 이 앱의 AI 호출에서 파생한 배선(목적 → 경유 → 모델). AI 가 없으면 버튼도 없다.
- **🌐 시스템 플로우 = 두 층**:
  - `↔ 이동 그래프` — 화면이 버튼으로 어떻게 이어지는지 + **🔀 순서 편집**(화면을 화살표 위에
    떨구면 그 사이에 끼워짐: A→B 에 C를 떨구면 **A→C→B**). 바뀐 순서는 *"A의 『담기』 버튼이
    이제 C로 가야 해"* 라는 **실제 코드 변경 요청**으로 프롬프트에 나간다.
  - `🗄 서버·데이터` — **화면 → 서버 작업 → 서버 함수 → 테이블(RLS)**. 앱의 서버 코드와 스키마에서
    파생(Supabase 엣지·Next 라우트·Express·Lambda / SQL·Prisma·Drizzle). 서버가 없는 앱이면 안 뜬다.
- **내보내는 프롬프트가 먼저 "의논하라"고 요구한다**: 방법이 둘 이상이면 바로 고르지 말고
  장단점·영향 범위를 정리해 사용자와 정한 뒤 진행하라고 지시한다.
- **연결 편집 / 노드 추가 / 프롬프트 스택**: 수정 요청과 "만들어줘"를 프롬프트로 모아 복사
- 한국어 라벨, 화면 썸네일/유형 아이콘, 미니맵/줌, 그룹 필터, 위치/편집 localStorage 저장
- 외부 의존성 0 (CDN 폰트도 없음) — 오프라인에서 열어도 그대로 돈다

## 산출물

- `flow-debugger.html` (자체 완결 단일 파일)
- 중간 데이터: `screenmap.json`, `screenmap.ko.json`, `screenmap.debug.json`,
  `glossary.ko.json`, `shots.json`
- 사용자가 만든 **버그 신고서 / 수정 요청** 텍스트 (앱으로 다시 보내 고치는 입력)

## 절대 하지 말 것

**SCAN · ENRICH · ANNOTATE 를 한 패스로 합치지 말 것.** 토큰을 아끼려고 합쳤다가
동작 90개·서버 호출 66개 누락, 앵커 43개 오류가 났고, **아낀 토큰을 검증·수리에 10배로 지불했다.**
화면이 많으면 합치지 말고 그룹을 쪼개 병렬로 돌린다.

**검증 없이 확신에 찬 헤드라인을 쓰지 말 것.** 앵커는 `verify-anchors.js` 로 전수 검증하고,
버그 주장은 "프로덕션에서 이 화면이 열리는가"라는 도달 가능성 렌즈로 반박해 본 뒤에만 보고한다.

## 닫는 루프

비개발자가 HTML 에서 만든 버그 신고서/수정 요청을 받으면:
1. **✔ 좌표는 출발점으로 신뢰**하고, **⚠ 는 직접 찾는다**(신고서가 이유를 적어 준다).
2. `(렌더: …)` 프로덕션 파일에서 고친다 — legacy 본문을 고치면 빌드만 초록이다.
3. 흐름도 데이터가 틀렸으면 정정하고, 앵커가 틀렸으면 그 화면만 RESCAN 해서 4단계를 다시 돌린다.
