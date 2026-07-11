# flow-debugger — Session Handoff

## Latest — 2026-07-11 / v0.8.1 3자 배포 준비(앱이름 파라미터화) · v0.8.0 노드추가=탭 · v0.7.0 앵커 재스캔

### 어디까지 왔나
- main HEAD: v0.8.1 (아래 커밋). origin == local, working tree clean.
- 3자 이용 경로 검증: 플러그인 **미설치**(installed_plugins.json엔 insane-search만) → `/flow-debugger`는 전역 스킬(`~/.claude/skills/flow-debugger`) 로드, 정본과 byte-identical(README 1개만 여분). 전역 빌드로 라이브검증 PASS(탭·앵커·stack). 3자 설치=`/plugin marketplace add Simon-YHKim/Flow-debugger` → `/plugin install flow-debugger@flow-debugger`(marketplace.json 유효, MIT).
- 이번 세션 머지된 커밋(직접 push to main):
  - **v0.8.1** — 3자 배포 준비: 템플릿에 하드코딩된 `2nd-B` 제목/브랜드를 `__APP_NAME__` 토큰화(build.js가 sibling `<graph>.appname.txt`로 채움, 없으면 "앱"). 남의 앱 이름 유출 방지. SKILL/README에 appname/stack sidecar 문서화. 스크립트는 원래 경로-클린이었음.
  - **v0.8.0** — `＋ 노드 추가`를 모달 다이얼로그 → **우측 패널 탭**(버그신고/수정요청 옆)으로 이동. 폼+추가노드 목록(흐름도에서 보기/삭제), 툴바 버튼은 탭 오픈, 입력값 재렌더 보존, 배지 카운트, 옛 .adlg 모달 제거. playwright PASS(탭 3개·add→캔버스+목록·삭제·overlap0·pageerror0).
  - `1e634c0` **v0.7.0** — 2nd-B 재스캔으로 0.6.0이 비워둔 앵커 정확도 필드 실채움 + apply-anchors.js + 버그신고서 codeRef 픽스 + stack 주입 + A'(divergent 4화면 액션SET prod 재도출)
- 직전: `869829b` v0.6.0(프롬프트 품질 측정·강화 46.7%→88.3%), `6dc7e62` v0.5.0.
- 테스트 상태: CI 없음. `build.js`가 `new Function`으로 JS 구문 자가검증 + playwright 라이브검증(pageerror0·overlap0·export 내용확인).

### 이번 세션에 한 일 (요약) — Task A "honest completion"
1. **문제 확인** — 0.6.0이 스키마·템플릿엔 impl/renders/stack을 추가했지만 **실데이터(screenmap.debug.json, 07-10 스캔)엔 0개**였다: 82화면/310동작 중 impl=0·renders=0·screen.renders=0. 앵커가 `src/app/*.tsx` legacy 위임파일을 가리켜 "빌드 초록인데 화면 그대로"의 원흉.
2. **framework-aware 재스캔(Workflow, 8병렬 Opus)** — 그룹당 1에이전트가 실2nd-B 소스를 읽어 `isDeepSpaceUI()` 위임을 해소 → `screenRenders`(프로덕션 렌더 파일), 핸들러 추적 → `file`/`impl`, DeepSpace 렌더위치 → `renders`. 화면별 **컴팩트 패치**만 반환(한글 enrichment·annotation 보존).
3. **`scripts/apply-anchors.js`(신규)** — 패치를 base에 route+exact-action 키로 병합, 나머지 필드 전부 보존. **결정적 환각가드**: 모든 path:line을 실트리에 존재+범위검증→불통과는 드롭("빈 값 > 틀린 값"). 결과: 82/82화면·310/310동작 매칭, impl=128·action.renders=38·screen.renders=79, **드롭 0(환각 0)**. 158동작이 이제 deepspace 프로덕션 파일을 직접 가리킴.
4. **버그신고서 codeRef 픽스** — `buildBugReport`가 raw `file`로 코드힌트를 만들어 impl/renders가 **최중요 산출물에 안 닿던** 버그. 이제 `codeRef()` 사용 + 화면 프로덕션 렌더파일 라인 별도 노출.
5. **stack 주입** — `build.js`가 sibling `<graph>.stack.txt`를 `STACK` 상수로 임베드, `buildBugReport`/`buildStackPrompt`가 `[앱 스택]` 프리앰블 추가(코딩에이전트가 프레임워크·위임 메커니즘을 먼저 인지).
6. **라이브검증 PASS** — pageerror0·overlap0(82노드), 내보낸 버그신고서가 impl/renders/[앱 스택]/렌더파일 라인 모두 포함(sign-in·ttfv 샘플 확인).
7. 산출물: `E:\2ndB\Output\flow-debugger\flow-debugger.html`(재빌드, 2.12MB) · `screenmap.debug.json`(v2) · `screenmap.debug.stack.txt` · 백업 `screenmap.debug.pre-anchor.json`.

### 활성 인프라
- 레포: `github.com/Simon-YHKim/Flow-debugger` (PUBLIC, main). 로컬 정본 `E:\Coding Infra\flow-debugger`.
- 대상 앱 데이터: `E:\2ndB\Output\flow-debugger\` (screenmap.debug.json 82화면 · glossary.ko.json · shots.json 59캡처 · 빌드 flow-debugger.html · scan-*.json).
- 전역 설치본(`/flow-debugger`가 로드): `C:\Users\202502\.claude\skills\flow-debugger\` — **template.html·scan-prompts.md 정본과 동기화됨**.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| ~~A~~ | ~~개선된 SCAN으로 2nd-B 재스캔 → impl/renders/stack 채우기 → 재빌드~~ | ~~medium~~ | ✅ **v0.7.0 완료** (1e634c0) |
| ~~A'~~ | ~~액션SET divergence — divergent DeepSpace 화면 액션SET 재도출~~ | ~~medium~~ | ✅ **완료** (Simon 결정=Prod기준 재도출). divergent 5화면 정밀식별(48은 이미 prod-anchored, 29 native) → /theme·/manual·/account·/inbox 4화면 액션SET을 실 DeepSpace 화면 기준으로 교체(legacy 유령액션 제거: manual 언어토글/권한/리서치, account privacy행, inbox source-mgmt), /deepspace-preview=0액션. 13 prod액션·앵커 전부 valid·재빌드·verify PASS. 310→309동작. |
| B | HTML에 "AI로 다듬기" 버튼(복사 전 인앱 프롬프트 개선) | small~med | Simon이 AskUserQuestion서 ①②만 선택(③ 미채택) — 보류 |
| C | 완료기준/주의를 화면 카드에도 선택적 노출(progressive disclosure) | small | Simon이 원하면 |
| D | 캡처 갱신: not-found 화면 재export 후 재캡처(모든 82route는 소스존재—캡처만 갭) | small | 아이콘 폴백 중 |

### 적용 중인 정책 (영구)
1. **Flow-debugger 레포는 main 직접 push**(Simon 승인). **auto-PR·auto-merge 금지**(글로벌 정책).
2. flow-debugger 변경 시마다: **정본↔전역 스킬 사본 동기화** → 2nd-B HTML 재빌드 → playwright 검증(겹침0·pageerror0) → 버전 bump → **plugin.json 무결성 검증**(`wc -c`+`json.load` — 과거 동시쓰기로 0바이트 사고) → Conventional Commits(+`Claude Fable 5` trailer) → push.
3. 커밋 본문에 **큰따옴표·em-dash 금지**(here-string pathspec 사고 2회) → `git commit -F <파일>`.
4. `git add -A`/`.` 금지 → 명시적 경로만 stage(멀티에이전트 stray 휩쓸림 방지).
5. playwright는 `NODE_PATH="C:/Users/202502/.claude/skills/gstack/node_modules"`, `channel:'chrome'`. 합성 pointer 이벤트의 `setPointerCapture "No active pointer"`는 테스트 아티팩트 → pageError 필터링.

### 핵심 파일 위치
```
E:\Coding Infra\flow-debugger\                                  정본 플러그인 레포(origin Simon-YHKim/Flow-debugger)
  .claude-plugin/plugin.json                                    버전 매니페스트(현재 0.6.0)
  skills/flow-debugger/assets/flow-debugger.template.html       단일파일 HTML 템플릿(핵심 편집 대상)
  skills/flow-debugger/references/scan-prompts.md               SCAN/ENRICH/GLOSSARY/ANNOTATE 프롬프트
  skills/flow-debugger/scripts/{build,merge-readers,apply-anchors,embed-shots,extract-prompt}.js
    apply-anchors.js = 재스캔 패치를 base에 병합(route+action키) + path:line 존재검증 환각가드
  skills/flow-debugger/evals/prompt-quality.md                  프롬프트 품질 eval(루브릭·before/after·재현)
  CHANGELOG.md
C:\Users\202502\.claude\skills\flow-debugger\                   전역 설치본(/flow-debugger 로드 — 동기화 필수)
E:\2ndB\Output\flow-debugger\                                   대상앱 데이터 + 빌드 HTML + 리포트
```

### 검증
```bash
cd "E:/Coding Infra/flow-debugger"
node skills/flow-debugger/scripts/build.js \
  skills/flow-debugger/assets/flow-debugger.template.html \
  "E:/2ndB/Output/flow-debugger/screenmap.debug.json" \
  "E:/2ndB/Output/flow-debugger/glossary.ko.json" \
  "E:/2ndB/Output/flow-debugger/shots.json" \
  "E:/2ndB/Output/flow-debugger/flow-debugger.html"   # "... JS OK" = 구문 통과
# 라이브 검증(겹침/에러): scratchpad의 verify-final.js 등을 NODE_PATH 지정해 실행
```

### 다음 세션 시작하는 법
```bash
cd "E:/Coding Infra/flow-debugger"
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A 작업(2nd-B 재스캔)부터 시작 권장
```

---
