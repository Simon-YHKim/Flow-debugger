---
name: flow-debugger
description: >-
  Use when a non-developer needs to see and debug how an app actually works,
  screen by screen - triggers "플로우 디버거", "워크플로우 디버깅", "비개발자 디버깅",
  "화면 흐름도 만들어", "어디서 막히는지", "이거 왜 안 돼", "flow debugger",
  "debug for non-developers", "visual flow map". Scans the app screens and maps
  every screen to its user actions, the data and server calls (db, rpc, edge
  function, storage, auth) and AI calls, then writes one self-contained
  interactive flow-debugger.html with clickable nodes, drag-and-drop, plain
  Korean labels, real screenshot thumbnails, risk markers (인터넷/비용/AI/외부의존/약점),
  per-action diagnostic checklists, connection editing, and a bug-report
  generator that turns a vague "안 돼요" into a precise file:line report.
  Produces the HTML plus a copy-paste fix and bug prompt for the assistant.
version: 0.1.0
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
compatibility: [claude-code]
author: simon-stack
---

# flow-debugger

비개발자가 자기 앱의 **워크플로우를 눈으로 보고 디버깅**할 수 있게 하는 스킬.
앱 화면을 전수 스캔해 `화면 -> 사용자 동작 -> 데이터/서버 작업 + AI`로 잇고,
각 동작에 **약점 마커 + 진단 체크리스트**를 붙여, 비개발자가 "여기서 안 돼요"를
**개발자가 바로 고칠 수 있는 신고서(file:line 포함)**로 바꿔 보낼 수 있는
단일 HTML(`flow-debugger.html`)을 만든다.

이 스킬의 단 하나의 포인트: **비개발자도 워크플로우를 쉽게 디버깅한다.**
그래서 모든 라벨은 쉬운 한국어, 코드 식별자는 "개발 정보"로 분리, 위험은 색으로,
고장 신고는 폼으로 받는다.

## When to use / boundaries

발동:
- "플로우 디버거 만들어", "워크플로우 디버깅", "이 앱 어디서 막히는지 보여줘"
- "비개발자도 알아보게 화면 흐름도", "이거 왜 안 되는지 신고서 만들어줘"
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
# Expo/RN: src/app, Next: app/ 또는 src/pages, 기타: src/screens
ls "$ROOT/src/app"/*.tsx 2>/dev/null || ls "$ROOT/app"/*.tsx 2>/dev/null \
  || ls "$ROOT/src/pages" 2>/dev/null || ls "$ROOT/src/screens" 2>/dev/null \
  || { echo "NO_SCREEN_CODE - 화면 코드 경로를 먼저 지정"; exit 0; }
```

화면 디렉터리가 없으면 멈추고 경로를 묻는다.

## 파이프라인 (5단계)

프롬프트 전문은 [references/scan-prompts.md](references/scan-prompts.md) 에 있다.
화면이 많으면 Workflow(또는 `agent-delegate`)로 그룹별 병렬 fan-out 한다.
출력 디렉터리는 `<project>/Output` 또는 사용자가 지정한 곳.

### 1) 스캔 (필수)
화면 목록을 그룹으로 나눠, 각 리더가 화면을 전수 읽고 동작별로
`feature / apis[] / ai`를 추출한 JSON 배열을 반환한다 (scan-prompts.md "SCAN").
스키마 핵심: 각 api 태그는 `db:<table>:<op>` / `rpc:<name>` / `edge:<fn>` /
`storage:<bucket>:<op>` / `auth:<op>` 형식. ai 는 `{purpose, model, via}` 또는 null.

리더 출력을 병합:
```bash
node scripts/merge-readers.js <workflow-output.json> Output/screenmap.json
```

### 2) 한국어 보강 (권장, 비개발자 필수)
각 화면/동작에 `titleKo / summaryKo / actionKo / plain`(쉬운 한국어)을 추가하고,
용어집(api 태그/ai purpose -> 쉬운 한국어)을 만든다 (scan-prompts.md "ENRICH", "GLOSSARY").
산출: `Output/screenmap.ko.json`, `Output/glossary.ko.json`.

### 3) 디버그 주석 (이 스킬의 핵심)
각 동작에 세 필드를 추가 (scan-prompts.md "ANNOTATE"):
- `risks[]`: `network|auth|ai|cost|external|gate|weakpoint|bug` 중 해당하는 것
- `checklist[]`: "안 될 때 확인할 것" 쉬운 한국어 2-4개
- `failureModes[]`: "이렇게 안 될 수 있어요" 쉬운 한국어 1-3개

산출: `Output/screenmap.debug.json` (보강+주석이 모두 들어간 최종 데이터).

### 4) 스크린샷 임베드 (선택, 화면 인식↑)
실제 캡처가 있으면 `route -> png경로` 맵을 만들어 base64 로 임베드한다.
없으면 비워도 되고, 화면유형 아이콘으로 대체된다.
```bash
node scripts/embed-shots.js Output/shots-map.json Output/shots.json
```

### 5) 빌드
템플릿에 데이터를 주입해 단일 HTML 을 만든다 (glossary/shots 는 없으면 `{}`).
```bash
node scripts/build.js assets/flow-debugger.template.html \
  Output/screenmap.debug.json Output/glossary.ko.json Output/shots.json \
  Output/flow-debugger.html
```
빌드 직후 `<script>` 구문을 반드시 자가 검증한다 (build.js 가 `new Function`
파싱으로 확인하고 실패 시 비정상 종료). 그 다음 브라우저로 연다.

## 비개발자가 얻는 디버깅 기능 (HTML)

- **약점 마커**: 동작 카드에 색점으로 "인터넷 필요/비용/AI/외부의존/조용한 실패 위험" 표시
- **증상 -> 경로 추적**: 동작을 누르면 "이게 되려면 필요한 것"(데이터/서버/AI)이 강조됨
- **진단 체크리스트**: 동작별 "안 될 때 확인하세요" + "이렇게 안 될 수 있어요"
- **버그 신고서**: "이 동작이 안 돼요"를 누르고 증상/기대만 적으면, 코드 경로와
  점검 포인트가 박힌 개발자용 신고서가 자동 생성(복사 버튼)
- **연결 편집**: 점을 끌어 연결을 잇고 선을 눌러 끊기(맵 수정 요청 자동 생성)
- 한국어 라벨, 화면 썸네일/유형 아이콘, 미니맵/줌, 그룹 필터, 위치/편집 localStorage 저장

## 산출물

- `flow-debugger.html` (자체 완결 단일 파일)
- 중간 데이터: `screenmap.json`, `screenmap.ko.json`, `screenmap.debug.json`,
  `glossary.ko.json`, `shots.json`
- 사용자가 만든 **버그 신고서 / 수정 요청** 텍스트 (앱으로 다시 보내 고치는 입력)

## 닫는 루프

비개발자가 HTML 에서 만든 버그 신고서/수정 요청을 받으면, 거기 적힌 file:line 과
의존 작업부터 framework-aware 로 원인을 찾아 고치고, 흐름도 데이터가 틀렸으면 정정한다.
