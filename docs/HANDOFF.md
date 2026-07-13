# flow-debugger — Session Handoff

## Latest — 2026-07-14 / v0.12.0  (실전 포스트모템 + v0.11.0 적대적 재검증)

### 한 줄
v0.11.0 은 **간판 기능(위임 경고)이 모든 빌드에서 죽은 채** 출시됐다 — 단위 30/30 초록, 라이브 PASS 인 채로.
원인은 `build.js` 키 문자열에 박힌 **NUL 바이트 한 개**. git 이 파일을 binary 로 취급해 diff 도 grep 도 그걸 못 봤다.
v0.12.0 은 그걸 고치고, **초록 테스트를 증거로 믿지 않는 검증**을 추가하고, 실전 포스트모템의 5원인을 전부 도구로 막는다.

### v0.12.0 에서 한 것
**v0.11.0 자체 결함 (적대적 재검증 5-agent 가 잡음)**
- NUL 키 → 위임 경고 사망. 이제 `delegKey()` 단일 정의 + `verify-html` 이 **경고가 신고서에 실제로 실리는지** 단언 + 제어문자 스캔이 테스트에 상주.
- **✔ 가 안 한 검증을 했다고 말함**: 547 앵커 중 507이 `unchecked`(파일·줄만 확인)인데 "그 줄에 함수가 실제로 있어"로 나갔다.
  → 3등급 분리: **✔ VERIFIED**(함수 대조) · **· LOCATED**(파일·줄만) · **~ CAUTION** · **⚠ BROKEN**.
- import/주석/문자열 리터럴 위의 심볼이 `exact` 로 통과 · 스냅이 동명이인 함수로 재조준 · resolve 가 정의 아닌 첫 언급 선택
  · `--fix` 가 화이트리스트 밖 확장자(.dart/.xml)의 **정확한 앵커를 삭제** · build.js 가 입력 파일 덮어씀 — 전부 수정 + 공격 케이스를 테스트로 상주.

**실전 포스트모템 (86화면 앱, 초판 27화면만 정확 / 275 오류)**
- `scripts/prescan.js` + `lib/reach.js` = **0단계**. 리더가 눈앞 파일만 봐선 답 못 하는 3가지를 스크립트가 답한다:
  ① 프로덕션 렌더 경로(위임) ② **도달 가능성**(dev 전용 라우트 → 허위 버그 4건의 근원, 실앱 5/5 검출) ③ 헬퍼 속 DB/AI 호출(실앱 216개, AI 46개)
- JSX 렌더 줄 앵커 거부(43건) · `impl` 을 화면 핸들러 이름으로 판정하지 않음(거짓 경고 15건) · 3패스 합치기 금지를 SKILL.md 에 명문화.

**맵 UI (Simon 요청)**
- **🖥 화면별 플로우 / 🌐 시스템 플로우** 2분할.
- 화면별 플로우는 화면 하나가 왼쪽 뿌리, **오른쪽으로만** 뻗는다(86장 세로 적재 폐기). 이동 칩을 펴면 **다음 화면이 그 자리에 펼쳐지고**,
  『이 화면으로 이동 →』으로 그 화면을 새 뿌리로 삼아 앱을 한 홉씩 걸어간다.
- 시스템 플로우 = 화면→화면 그래프(좌→우 계층) + AI 하네스(겹침 해소 패스 추가).

### 검증 (그대로 복붙)
```bash
cd "E:/Coding Infra/flow-debugger/skills/flow-debugger"
node scripts/self-test.js                          # 41/41
node scripts/prescan.js "E:/2ndB" --graph "E:/2ndB/Output/flow-debugger/screenmap.debug.json"
node scripts/verify-anchors.js "E:/2ndB/Output/flow-debugger/screenmap.debug.json" "E:/2ndB"
NODE_PATH="C:/Users/202502/.claude/skills/gstack/node_modules"   node scripts/verify-html.js "E:/2ndB/Output/flow-debugger/flow-debugger.html"        --template assets/flow-debugger.template.html
# PASS 조건: 겹침0 · pageerror0 · 위임경고 발화+신고서 포함 · 하네스 겹침0 · 템플릿 누수0
```

### 절대 잊지 말 것
1. **초록 테스트는 증거가 아니다.** 단위는 라이브러리를 직접 부르고, 라이브는 첫 카드만 눌렀다. **산출물을 봐라.**
2. **검증관도 자신 있게 틀린다.** 모순이 나오면 원본 코드를 직접 연다(실측 3회 모두 검증관이 틀렸다).
3. **heredoc 으로 소스 패치 금지** — NUL·백스페이스가 조용히 박힌다. Edit 툴을 쓴다.
4. 변경할 때마다 **전역 사본 robocopy /MIR 동기화** (`/flow-debugger` 는 전역 사본을 로드).

---

## Latest — 2026-07-14 / v0.11.0 정밀도 릴리스 (앵커 검증 + 하네스 leak 제거 + 3자 준비)

### 한 줄
이 도구가 산출하는 모든 것은 **코딩 에이전트에게 넘기는 `file:line` 한 줄** 아래에 있다.
그 한 줄을 아무도 검증하지 않고 있었다. v0.11.0이 그걸 검증하고, 못 믿을 때는 못 믿는다고 말한다.

### 어디까지 왔나
- main HEAD: v0.11.0. 전역 스킬 사본(`C:\Users\202502\.claude\skills\flow-debugger`)과 **byte-identical 동기화 완료**(drift 0).
- **전체 회귀 PASS**: 단위 30/30 · 데모앱(비-2ndB, 레포에 커밋) 앵커 100% · 2nd-B 86화면 99.8% · 양쪽 라이브 pageerror0·overlap0·템플릿 누수 0.
- 버전 4곳 통일(plugin.json / SKILL.md / cases.json / package.json = **0.11.0**).

### v0.11.0에서 실제로 고친 것 (감사 14건 전부)

**정밀도 (핵심)**
1. `scripts/lib/anchors.js` + `verify-anchors.js` = **앵커 검증 엔진**, 파이프라인 4단계로 정식 편입.
   파일 존재 · 루트 안(`../` 탈출 차단) · 줄 범위 · **그 줄에 그 함수가 실제로 있는지**까지 확인.
   나아가 **복구**한다: 줄 없으면 심볼로 찾아 채우고, 어긋난 줄은 스냅하고, 파일명만 있으면 트리에서 해석.
   - 실측(2nd-B 668앵커): **51%만 깔끔한 path:line, 19%는 줄 없는 파일+심볼, 18%는 좌표 자리에 한국어 산문**.
   - 검증 후: 547앵커 · **신뢰 99.8% · 산문 0 · 깨짐 0**.
2. **위임 트랩 검출**(`lintDelegation`). 앵커가 완벽히 유효한데도 쓸모없는 경우 —
   그 파일이 `if (isDeepSpaceUI()) return <XxxScreen/>` 로 다른 컴포넌트를 대신 렌더할 때.
   좌표 검증으로는 절대 못 잡는다(파일도 줄도 진짜다). 파일을 **읽어야** 잡힌다.
   2nd-B 실맵에서 진짜 3건 발견(`/rlss` → `<RlssDeepSpace/>`, renders 미기록). 신고서가 경고를 싣는다.
3. **신고서에 신뢰 등급**: ✔ 확인됨 / ~ 주의(빈 줄·import·주석) / ⚠ 못 믿음(이유 포함).
   `--app-root` 없이 빌드하면 전부 "미검증"으로 표기 — 확인된 척하지 않는다.
4. `self-test.js` 30 케이스(브라우저·네트워크 불필요) · `verify-html.js` 라이브 검증(레포 안에 있음).

**leak / 정직성**
5. **AI 하네스가 남의 앱 내부를 뿌리던 것 제거.** 한 앱의 게이트웨이·엣지 프록시·스펜드캡·위기 핫라인을
   하드코딩해 **모든 대상에** 무조건 렌더했고 README는 "당신 앱의 AI"라고 설명했다.
   이제 **스캔한 AI 호출에서 파생**(목적 → 경유 → 모델). AI 없으면 버튼도 없음. `<graph>.harness.json`로 직접 그릴 수도 있음.
6. docs 스크린샷 3장을 **레포의 데모 앱**으로 재촬영(전 버전은 JWT role·spend cap·핫라인 번호가 판독 가능했음).

**중립성 / 비개발자 약속**
7. 백엔드 중립화 완성 — kind 개방(색=해시, 한국어=용어집), **범례를 데이터에서 생성**. SKILL.md의 Supabase 전용 지시 제거.
8. 그룹 라벨이 영문("Home Shell")로 나오던 것 → ENRICH `groupKo`.
9. 화면 아이콘이 한 앱의 라우트 리터럴이던 것 → 스캔 `type` + 라우트 휴리스틱.
10. **화면 카드에서도** "안 돼요" 신고 가능(기존엔 동작 카드만). 빈 신고서 export 차단(증상 필수).
11. '수정 요청' 탭이 버그·추가노드를 빠뜨리던 것 → dock과 동일한 전체 프롬프트.
12. `ui/backend/cli` 어휘 누수 17곳 정리.

**위생**
13. `ai` 객체 스키마를 SCAN 프롬프트에 명시 + `merge-readers.js` 스키마 검사(문자열이면 중단).
14. RESCAN/PATCH 프롬프트 신설(0.7.0의 `apply-anchors.js`는 **생산자가 없어 문서대로 하면 절대 실행 안 됐음**).
15. CDN 폰트 제거(진짜 자체완결) · `package.json`(playwright) · `.gitignore` · `capture-shots.js`+문서
    (대표 기능인데 캡처 뜨는 법이 레포 어디에도 없었음) · `examples/demo-notes/`(3자 온보딩 + 회귀 픽스처).

### 활성 인프라
- 레포: `github.com/Simon-YHKim/Flow-debugger` (PUBLIC, main). 로컬 정본 `E:\Coding Infra\flow-debugger`.
- 전역 설치본(`/flow-debugger`가 로드): `C:\Users\202502\.claude\skills\flow-debugger\` — **정본과 동기화됨**.
- 대상 앱 데이터: `E:\2ndB\Output\flow-debugger\` (screenmap.debug.json 86화면·342동작 · glossary · shots 58 · 빌드 HTML).
  백업: `screenmap.debug.pre-v11.json`.
- 데모(레포 내): `examples/demo-notes/` — 소스 + flow/screenmap.debug.json + 빌드 HTML.

### 남은 것
| # | 작업 | 크기 | 메모 |
|---|---|---|---|
| A | 2nd-B `/rlss` 3건 + weak 23건 RESCAN | small | 도구가 이미 지목함. `references/scan-prompts.md` "RESCAN / PATCH" 그대로 |
| B | 2nd-B `unchecked` 507건 → SCAN 재실행 시 `symbol` 필드 채우면 대부분 `exact` 로 승격 | medium | 새 스키마가 이미 요구함. 다음 전수 스캔 때 자연 해소 |
| C | 캡처 갱신(86라우트 중 58장) | small | `capture-shots.js` 로 이제 재현 가능 |
| D | git tag(v0.1.0~v0.11.0 태그가 하나도 없음 — 롤백할 불변 ref 부재) | small | |

### 적용 중인 정책 (영구)
1. **Flow-debugger 레포는 main 직접 push**(Simon 승인). auto-PR·auto-merge 금지.
2. 변경 시마다: **정본 ↔ 전역 스킬 사본 동기화** → `node scripts/self-test.js` → 데모+2ndB 재빌드 →
   `verify-html.js`(겹침0·pageerror0·템플릿 누수0) → 버전 bump(4곳) → Conventional Commits → push.
3. 커밋 본문에 **큰따옴표·em-dash 금지**(here-string pathspec 사고) → `git commit -F <파일>`.
4. `git add -A`/`.` 금지 → 명시적 경로만 stage.
5. playwright는 `NODE_PATH="C:/Users/202502/.claude/skills/gstack/node_modules"`, `channel:'chrome'`.

### 검증 (그대로 복붙)
```bash
cd "E:/Coding Infra/flow-debugger/skills/flow-debugger"
node scripts/self-test.js                                  # 30/30
node scripts/verify-anchors.js ../../examples/demo-notes/flow/screenmap.debug.json ../../examples/demo-notes
node scripts/verify-anchors.js "E:/2ndB/Output/flow-debugger/screenmap.debug.json" "E:/2ndB"
NODE_PATH="C:/Users/202502/.claude/skills/gstack/node_modules" \
  node scripts/verify-html.js "E:/2ndB/Output/flow-debugger/flow-debugger.html" \
       --template assets/flow-debugger.template.html
```

---
