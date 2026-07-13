# Flow Debugger

비개발자가 자기 앱의 **워크플로우를 눈으로 보고 디버깅**하게 해주는 Claude Code 플러그인.

앱 화면을 전수 스캔해 `화면 → 사용자 동작 → 데이터/서버 작업 + AI`로 잇고, 각 동작에
**위험 마커 + 진단 체크리스트**를 붙여, "여기서 안 돼요"를 개발자(또는 코딩 에이전트)가 바로 고칠 수 있는
**버그 신고서**로 바꿔 보낼 수 있는 단일 자체완결 HTML을 만든다.

외부 의존성은 스크립트 실행용 `node` 뿐. 산출된 HTML은 네트워크를 전혀 쓰지 않는다(폰트 CDN도 없음).

## 이 도구의 핵심은 정밀도다

그림은 이해를 돕지만, 개발자에게 **실제로 전달되는 것은 `file:line` 한 줄**이다.
**틀린 좌표는 없는 것보다 나쁘다** — 에이전트가 프로덕션에 렌더되지도 않는 파일을 고치고, 빌드는 초록이고,
화면은 그대로다.

그래서 파이프라인에 **앵커 검증 단계**가 있고, 모든 좌표를 실제 소스트리에 대조한다:

- 파일이 존재하는가 · 줄이 범위 안인가 · **그 줄에 그 함수가 실제로 있는가**
- 줄 번호가 없으면 **심볼로 찾아 채우고**, 어긋난 줄은 **실제 위치로 보정**한다
- 빈 줄/import/주석을 가리키면 `~`, 함수가 없으면 `⚠`, 산문이면 좌표 자리에서 빼낸다
- 결과가 신고서에 **✔ / ~ / ⚠** 로 그대로 실려, 에이전트가 어디를 믿고 어디를 직접 찾을지 안다

실측(RN/Expo 앱, 86화면·342동작·547앵커): 신뢰 가능 **99.8%**, 산문 0, 깨진 좌표 0.
검증을 켜기 전 원본 데이터에는 **18%가 좌표조차 아닌 산문**이었다.

그리고 앵커가 **완벽히 유효한데도 쓸모없는 경우**가 있다 — 그 파일이 조건에 따라 다른 컴포넌트를
대신 렌더할 때(`if (isNewUI()) return <NotesScreenV2/>`). 검증기는 이것도 잡아 신고서에 경고를 싣는다.

## 미리보기

아래 이미지는 이 레포의 [`examples/demo-notes`](examples/demo-notes) 데모 앱을 그대로 맵핑한 결과다.

화면을 그룹별로 보여주고(유형 아이콘·위험 색점), 카드를 누르면 동작 → 데이터/서버 → AI로 펼쳐진다:

![개요 — 화면 그룹, 위험 마커](docs/overview.png)

동작을 고르면 왼쪽 패널에 **검증된 코드 위치**(✔ 와 그 이유), 약점·진단 체크리스트, 실패 모드,
그리고 "이 동작이 안 돼요 → 신고서 만들기" 버튼이 뜬다:

![디버그 상세 — 검증된 앵커와 진단 패널](docs/debug-detail.png)

**AI 하네스**는 이 앱의 AI 호출에서 그대로 파생된다(목적 → 경유 → 모델). 없는 단계를 지어내지 않는다:

![AI 하네스 — 스캔 데이터에서 파생](docs/harness.png)

## 데모로 5초 만에 확인하기

```bash
cd skills/flow-debugger
node scripts/verify-anchors.js ../../examples/demo-notes/flow/screenmap.debug.json ../../examples/demo-notes
node scripts/build.js assets/flow-debugger.template.html \
  ../../examples/demo-notes/flow/screenmap.debug.json \
  ../../examples/demo-notes/flow/glossary.ko.json \
  ../../examples/demo-notes/flow/flow-debugger.html \
  --app-root ../../examples/demo-notes
# examples/demo-notes/flow/flow-debugger.html 를 브라우저로 연다
```

데모에는 이 도구가 잡으라고 만들어진 함정이 일부러 들어 있다 — `src/notes.js` 가
`isNewUI()` 로 `<NotesScreenV2/>` 에 위임한다. 검증기가 그걸 찾아내고, 신고서가 경고한다.

## 설치 (플러그인)

```bash
# 1) 이 레포를 마켓플레이스로 추가
/plugin marketplace add Simon-YHKim/Flow-debugger
# 2) 플러그인 설치
/plugin install flow-debugger@flow-debugger
```

설치 후 `/flow-debugger:flow-debugger` 또는 "플로우 디버거 만들어 / 워크플로우 디버깅"으로 호출.

### 플러그인 없이 쓰기 (수동 복사)

```powershell
robocopy ".\skills\flow-debugger" "$env:USERPROFILE\.claude\skills\flow-debugger" /E
```

## 쓰는 법

스킬 발동 후 6단계 파이프라인을 돈다(프롬프트 전문: `skills/flow-debugger/references/scan-prompts.md`):

1. **스캔** 화면 → 동작 → api/ai/앵커 추출 → `merge-readers.js`로 병합(+스키마 검사)
2. **한국어 보강** titleKo/groupKo/summaryKo/actionKo/plain + 용어집
3. **디버그 주석** risks / checklist / failureModes
4. **앵커 검증·보정** `verify-anchors.js` ← **정밀도의 전부. 건너뛰지 말 것**
5. **스크린샷**(선택) `capture-shots.js` → `embed-shots.js`
6. **빌드** `build.js`로 토큰 주입 + JS 자가검증 → `flow-debugger.html`

직접 돌리는 예 (스킬 폴더 기준):

```bash
# 4) 앵커를 실제 소스와 대조해 고친다
node scripts/verify-anchors.js Output/screenmap.debug.json <앱루트> --fix Output/screenmap.debug.json

# 6) 빌드 — --app-root 를 줘야 신고서 좌표에 ✔ 가 붙는다
node scripts/build.js assets/flow-debugger.template.html \
  Output/screenmap.debug.json Output/glossary.ko.json Output/shots.json \
  Output/flow-debugger.html --app-root <앱루트>

# 라이브 검증(선택): 겹침0 · pageerror0 · 빈 신고서 차단 · 템플릿 누수 없음
npm install && node scripts/verify-html.js Output/flow-debugger.html --template assets/flow-debugger.template.html
```

선택 사이드카(그래프 옆에 `<graph>.<이름>`으로 두면 자동 인식):

| 파일 | 용도 |
|---|---|
| `screenmap.debug.appname.txt` | 페이지 제목/브랜드에 쓸 앱 이름 한 줄 (없으면 "앱") |
| `screenmap.debug.stack.txt` | 프레임워크·백엔드·렌더 위임 한 줄 → 내보내는 프롬프트의 `[앱 스택]` |
| `screenmap.debug.mode.txt` | `ui`(기본) / `backend`(엔드포인트) / `cli`(명령) |
| `screenmap.debug.harness.json` | 이 앱의 AI 배선을 직접 그릴 때. 없으면 스캔한 AI 호출에서 **자동 파생** |

## 산출물 HTML이 주는 것

- 화면 카드(유형 아이콘·실제 스크린샷 썸네일)로 어떤 화면인지 인식
- 동작 카드의 **위험 색점**: 인터넷 필요·비용·AI·외부의존·로그인·기본꺼짐·조용한 실패 위험
- 동작 선택 시 **진단 체크리스트** + "이렇게 안 될 수 있어요"
- **버그 신고**: 화면 카드에서도 동작 카드에서도. 증상만 적으면(증상은 필수) 코드 위치·의존 작업·점검 포인트가
  박힌 신고서 자동 생성 — 각 좌표에 **✔ 확인됨 / ~ 주의 / ⚠ 믿지 말 것**
- **코드 위치 패널**: 카드마다 검증 결과와 이유를 한국어로
- **시스템 스펙**(📋): 스택·규모·서버작업·AI·위험 프로필 + **코드 위치 신뢰도**
- **AI 하네스**: 이 앱의 AI 호출에서 파생한 배선(목적 → 경유 → 모델). AI가 없으면 버튼도 없음
- **연결 편집 / 노드 추가 / 프롬프트 스택**(수정 요청을 프롬프트로 모아 복사)
- 겹침 방지 자동 배치, 한국어, 미니맵/줌, 그룹 필터, localStorage 저장

## 구성

```
Flow-debugger/
  .claude-plugin/
    plugin.json  marketplace.json
  skills/flow-debugger/
    SKILL.md
    package.json                         playwright (캡처·라이브검증용 devDep)
    assets/flow-debugger.template.html   토큰: __GRAPH_JSON__ __GLOSSARY_JSON__ __SHOTS_JSON__
                                               __STACK_JSON__ __ANCHORS_JSON__ __HARNESS_JSON__
                                               __APP_NAME__ __MODE__
    scripts/
      lib/anchors.js        앵커 파싱·해석·검증 엔진 (이 도구의 심장)
      verify-anchors.js     앵커를 실제 소스트리에 대조·보정  ← 4단계
      merge-readers.js      리더 출력 병합 + 스키마 검사
      apply-anchors.js      RESCAN 패치 병합 (한국어·위험 보존)
      capture-shots.js      라우트별 스크린샷
      embed-shots.js        base64 임베드
      build.js              토큰 주입 + 앵커 감사 + JS 자가검증
      verify-html.js        라이브 검증(브라우저)
      self-test.js          앵커 엔진 단위 테스트 (node만, 25 케이스)
    references/
      scan-prompts.md       SCAN / ENRICH / GLOSSARY / ANNOTATE / RESCAN
      capture-shots.md      캡처 뜨는 법
    evals/
  README.md  LICENSE  CHANGELOG.md
```

## 테스트

```bash
cd skills/flow-debugger
node scripts/self-test.js      # 앵커 엔진 25 케이스, 브라우저·네트워크 불필요
npm install && node scripts/verify-html.js <built.html> --template assets/flow-debugger.template.html
```

## 라이선스

MIT (c) 2026 Simon Kim.
