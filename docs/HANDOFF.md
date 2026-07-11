# flow-debugger — Session Handoff

## Latest — 2026-07-11 / node-add + 설명 좌패널 분리(v0.5.0), 프롬프트 품질 측정·강화 46.7%→88.3%(v0.6.0)

### 어디까지 왔나
- main HEAD: `869829b`
- 이번 세션 머지된 커밋(직접 push to main, Simon 승인):
  - `6dc7e62` **v0.5.0** — 노드 추가 기능 + 설명(detail) 탭을 좌측 고정 패널로 분리
  - `869829b` **v0.6.0** — 내보내는 프롬프트 품질을 **측정+강화**(46.7%→88.3%) + 스캔 앵커 정확도 수정
- 테스트 상태: CI 없음. `build.js`가 `new Function`으로 JS 구문 자가검증 + playwright 수동검증(겹침0·pageerror0).
- working tree: clean (0 files), origin/main == local.

### 이번 세션에 한 일 (요약)
1. **v0.5.0 노드 추가** — 툴바 `＋ 노드 추가` → 다이얼로그(화면/동작/메모) → 캔버스 우측 전용 레인에 점선 카드(겹침0 보장, drag/delete). `state.addedNodes[]` 영속, 프롬프트 스택에 "만들어줘" 자동기록. `injectAddedNodes/addUserNode/deleteUserNode/openAddDialog`.
2. **v0.5.0 설명 패널 분리** — 우측 3탭(설명/버그신고/수정요청)에서 **설명을 좌측 고정 `.dpanel#detailBody`**로 분리(순서 설명|흐름도|신고요청). 우측=버그신고+수정요청 2탭. `renderDetail→detailBody`, `setTab("detail")`=좌측만 갱신.
3. **v0.6.0 프롬프트 품질 측정** — 6기준 루브릭 + 3렌즈 심판패널(실2ndB 코드 읽음)로 **28/60(46.7%)→53/60(88.3%)**, 코딩에이전트 "안전실행" 1/5→4/5. 최악결함=앵커가 mount줄+legacy파일 지목("틀린 정밀함").
4. **v0.6.0 템플릿 강화** — `buildStackPrompt/buildBugReport/renderPrompt`에 작업규칙 계약(앵커=검증할 힌트·재현먼저·프로덕션 렌더파일 확인·완료기준·범위잠금·비용게이트·추측대신질문) + kind별 강화. 화면카드는 짧게, `accept`/`guard`는 복사 프롬프트에만.
5. **v0.6.0 스캔 앵커 수정(데이터레벨)** — `references/scan-prompts.md` SCAN이 실핸들러 앵커 + optional `impl`(진짜 로직위치)/`renders`(프로덕션 변형)/`stack` 요구. `codeRef`가 impl/renders 소비(하위호환).
6. **ground-truth A/B** — 로그인버그를 실2ndB에 코딩에이전트로 태움: naive=추측성 auth diff 출하, hardened=재현후 질문(버그아닐수도). 근거 `evals/prompt-quality.md` + fixtures + `scripts/extract-prompt.js`.
7. 리포트: `E:\2ndB\Output\flow-debugger\prompt-quality-report.html` (Simon에 전달).

### 활성 인프라
- 레포: `github.com/Simon-YHKim/Flow-debugger` (PUBLIC, main). 로컬 정본 `E:\Coding Infra\flow-debugger`.
- 대상 앱 데이터: `E:\2ndB\Output\flow-debugger\` (screenmap.debug.json 82화면 · glossary.ko.json · shots.json 59캡처 · 빌드 flow-debugger.html · scan-*.json).
- 전역 설치본(`/flow-debugger`가 로드): `C:\Users\202502\.claude\skills\flow-debugger\` — **template.html·scan-prompts.md 정본과 동기화됨**.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 개선된 SCAN으로 **2nd-B 재스캔** → impl/renders/stack 필드 실제 채우기 → 흐름도 재빌드 | medium | ⭐ 앵커정확도(C1/C5) 잔여 갭을 근본적으로 닫음 — 이번 강화의 정직한 완결 |
| B | HTML에 "AI로 다듬기" 버튼(복사 전 인앱 프롬프트 개선) | small~med | Simon이 AskUserQuestion서 ①②만 선택(③ 미채택) — 보류 |
| C | 완료기준/주의를 화면 카드에도 선택적 노출(progressive disclosure) | small | Simon이 원하면 |
| D | 캡처 갱신: 23개 not-found 화면(신규) 재export 후 재캡처 | small | 아이콘 폴백 중 |

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
  skills/flow-debugger/scripts/{build,merge-readers,embed-shots,extract-prompt}.js
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
