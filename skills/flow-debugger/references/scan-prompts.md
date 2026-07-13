# flow-debugger: fan-out prompts

화면 수가 많으면 화면을 그룹으로 나눠 그룹당 리더 1명으로 병렬 실행한다.
각 리더는 아래 프롬프트의 스키마대로 **JSON 배열만** 반환한다(설명/펜스 없이).

## Contents
- SCAN: 화면 -> 동작 -> api/ai 추출 (필수)
- ENRICH: 쉬운 한국어 라벨 (비개발자 필수)
- GLOSSARY: api/ai 용어 한국어 풀이
- ANNOTATE: 디버그 위험/체크리스트 (이 스킬의 핵심)
- RESCAN / PATCH: 앵커 정확도 재스캔 (정밀도가 부족할 때)
- 모델/도구 메모

## 앵커(코드 위치)가 이 스킬의 전부다 — 먼저 읽을 것

흐름도의 그림은 이해를 돕지만, **개발자(또는 코딩 에이전트)에게 실제로 전달되는 것은 `file:line` 한 줄**이다.
틀린 좌표는 없는 것보다 나쁘다: 에이전트가 프로덕션에 렌더되지도 않는 파일을 고치고, 빌드는 초록이고, 화면은 그대로다.

그래서 스캔은 이렇게 쓴다:
- **`file`** — 그 동작을 처리하는 **핸들러 줄**. 화면 mount·import·렌더 가드 줄이 아니다.
- **`impl`** — 실제 로직이 다른 파일(훅/헬퍼)에 있으면 그 위치. **반드시 `path:line` 또는 `path (symbolName)` 형식**.
  설명문을 여기 넣지 말 것 — "loadDomainLevels(userId) — 별 밝기 계산" 같은 산문은 좌표가 아니다. 설명은 `detail`에.
- **`renders`** — 화면이 조건부로 다른 컴포넌트에 위임하면(`if (isXxxUI()) return <YyyScreen/>`, `Platform.select`, 실험 플래그)
  **프로덕션에서 실제로 렌더되는 파일**.
- **`symbol`** — 그 동작의 **실제 코드 식별자**(`handleSubmit`, `useSignInForm`, `SeenLensView`).
  검증기가 이 이름으로 줄 번호를 대조·보정한다. `feature`가 슬러그(`consent-gate`)면 `symbol`을 따로 준다.
- 확실치 않으면 **생략**한다. 빈 값이 틀린 값보다 낫다.

줄 번호를 모르면 `path (symbolName)` 로 써도 된다 — `verify-anchors.js`가 파일에서 심볼을 찾아 줄을 채운다.

## 대상 모드 (ui / backend / cli)

기본은 "화면 기반 UI"(mode=ui)지만, 화면이 없는 대상도 **같은 스키마**로 맵핑한다. 최상위 노드가 무엇이냐만 다르다:
- **ui**: 최상위 노드 = 화면. (기본)
- **backend** (API 서버): 최상위 노드 = **엔드포인트**. route = 경로(예 "POST /api/orders"), title = 사람이 읽을 이름. actions = 그 핸들러가 하는 DB/서비스/외부 호출·검증·발행 단계. `<graph>.mode.txt` = "backend".
- **cli** (명령줄 도구): 최상위 노드 = **명령/서브커맨드**. route = 명령 이름(예 "deploy"), actions = 그 명령이 하는 파일 I/O·네트워크·프로세스 호출 단계. `<graph>.mode.txt` = "cli".

모든 모드에서 SCAN/ENRICH/GLOSSARY/ANNOTATE 스키마는 동일하다. `to` 는 다른 엔드포인트·명령을 부르거나 이어지면 그 대상(호출 그래프). 스크린샷은 UI 가 아니면 생략(아이콘 폴백). 빌드 때 `<graph>.mode.txt` 로 화면→엔드포인트/명령 어휘가 자동 전환된다(제목·통계·노드 라벨·스펙 팝업 모두).

## SCAN

> 너는 "<APP>" 앱 화면을 흐름도용으로 매핑한다. group = "<GROUP>".
> 아래 화면 파일을 전부 읽고 런타임 동작을 추적한다: <FILE LIST>
> 핸들러/useEffect 에서 백엔드 호출(DB/RPC/서버함수/스토리지/인증, REST·GraphQL fetch 등)과
> LLM 호출을 찾는다. lib 헬퍼를 거치면 실제 호출까지 따라간다.
> 각 화면마다 PRIMARY 동작만(최대 ~6), 화면 로드 데이터 패치는 "On load" 동작으로.
>
> **앵커 정확도(중요 — 흐름도가 개발자에게 넘길 신고서의 신뢰도를 좌우한다):**
> - `file` 은 **동작의 실제 로직이 있는 줄** — 화면 진입(mount)/import/렌더 가드/주석 줄이 아니라, 그 동작을 처리하는 **핸들러 함수의 줄**. (로그인 버튼이면 `<Pressable>` 렌더 줄이 아니라 `handleSubmit`/`signInWithPassword` 호출 줄.)
> - 실제 로직이 **다른 파일의 훅/헬퍼**에 있으면 그 위치를 **`impl`** 에 적는다. **형식은 `path:line` 또는 `path (symbolName)` 뿐** — 설명 문장을 넣지 말 것(설명은 `detail`).
> - 화면이 조건에 따라 **다른 컴포넌트에 위임**하면 **프로덕션에서 실제로 렌더되는 파일**을 **`renders`** 에 적는다. 없으면 개발자가 안 보이는 legacy 파일을 고쳐 "빌드는 초록인데 화면은 그대로"가 된다.
> - **`symbol`** = 그 동작의 실제 코드 식별자(`handleSubmit`, `useSignInForm`). 검증기가 이걸로 줄 번호를 대조·보정한다.
> - 확실치 않으면 추정하지 말고 생략한다(빈 값이 틀린 값보다 낫다).
>
> JSON 배열만 출력(배열 요소는 전부 화면 객체 — 다른 종류의 객체를 섞지 말 것):
> ```json
> [{"route":"/sign-in","title":"Sign in","group":"<GROUP>","type":"auth","summary":"...",
>   "renders":"src/screens/deepspace/dds-auth-screens.tsx:149 (SignInScreen)",
>   "actions":[{"action":"Sign in","feature":"email-password-login","symbol":"handleSubmit",
>     "apis":["auth:signInWithPassword","db:users:select"],
>     "ai":null,
>     "file":"src/app/(auth)/sign-in.tsx:198","impl":"src/lib/auth/useSignInForm.ts:154 (submitSignIn)",
>     "renders":"src/screens/deepspace/dds-auth-screens.tsx:305",
>     "detail":"무슨 일이 일어나는지 1-2문장","to":"/"}]}]
> ```
> **`type`** (화면 아이콘 — 비개발자가 화면을 알아보는 수단): graph|list|form|chat|dashboard|settings|auth|onboarding|detail|card|test|media 중 하나. 애매하면 생략.
>
> **`ai`** — AI/LLM 을 부르면 **객체**로, 아니면 `null`. **문자열로 쓰지 말 것**(문자열이면 흐름도에 빈 AI 카드가 생긴다):
> ```json
> "ai":{"purpose":"capture_classify","model":"gemini-2.5-flash-lite","via":"서버 함수 경유"}
> ```
> `purpose`=필수(코드상의 목적 키), `model`=아는 경우 실제 모델 id, `via`=호출 경로(예 "서버 함수 경유", "클라이언트 직접").
>
> 태그 형식 — **앱의 실제 백엔드에 맞춰** 고른다(Supabase 전용 아님):
> - Supabase: db:<table>:<select|insert|update|delete>, rpc:<name>, edge:<fn>, storage:<bucket>:<op>, auth:<op>
> - 범용(REST/GraphQL/기타): rest:<METHOD>:<path>(예 rest:GET:/api/notes), graphql:<query|mutation>:<name>, http:<METHOD>:<host>, fn:<name>, external:<service>, auth:<op>
> 실제 호출을 **정직하게** 반영하고, 해당 없는 종류를 억지로 db: 에 끼워 넣지 말 것. 유효한 JSON(쌍따옴표, trailing comma 금지).
> **stack 한 줄**(프레임워크·백엔드·화면변형 메커니즘)은 배열에 섞지 말고 **따로** 한 줄로 반환한다(화면 객체 배열을 오염시키면 흐름도에 유령 노드가 생긴다). 이 줄은 `<graph>.stack.txt` 로 저장돼 내보내는 프롬프트 맨 위 `[앱 스택]`이 된다.
> **`to`**: 그 동작이 버튼/링크/router(push/replace/navigate/Link href)로 **다른 화면으로 이동**시키면
> 대상 route(예 "/capture-full"), 이동이 아니면 null. (화면 흐름 뷰가 이 값으로 화면→화면 화살표를 그린다.)

## ENRICH

> screenmap.json 을 읽어 group === "<GROUP>" 화면만, 기존 필드 전부 보존하고
> 각 화면에
> - `titleKo` 짧은 화면 이름
> - `groupKo` 이 그룹의 **쉬운 한국어 이름**(그룹 하나당 하나, 같은 그룹의 모든 화면에 같은 값. 예: "auth-onboarding" → "인증·시작").
>   이게 없으면 흐름도의 그룹 칩·컬럼 머리글이 영문 id 그대로 나와서, 쉬운 한국어라는 이 도구의 유일한 약속이 깨진다.
> - `summaryKo` 이 화면이 뭐 하는 곳인지 비개발자용 한 문장
> - `example` 이 화면을 언제 쓰는지 구체적 상황 한 문장("예:" 없이 상황만)
>
> 각 동작에
> - `actionKo` 사용자가 하는 행동
> - `plain` 그 행동을 하면 무슨 일이 일어나는지 쉬운 한국어 한 문장(전문용어/영문 약어 금지)
> - `example` 그 동작을 실제로 쓰는 구체적 사용 예시 한 문장 — 실제 상황·데이터를 넣어 손에 잡히게, "예:" 접두어 없이 상황만(앞에 UI가 자동으로 "예: "를 붙임)
>
> 자연스럽고 친근하게. **코드 앵커(file/impl/renders/symbol)는 손대지 말 것.** JSON 배열만 출력.

## GLOSSARY

> screenmap.json 의 모든 action.apis[] 고유 태그와 모든 ai.purpose 를 모아
> 비개발자용 한국어 풀이를 만든다. 태그 kind = 첫 토큰.
> kindKo 매핑: db="데이터 저장·조회", rpc="서버 계산", edge="서버 기능", storage="파일 저장",
> auth="로그인·인증", rest/http/graphql="서버 요청", fn="서버 기능", external="외부 서비스".
> 이 표에 없는 kind 라도(실제 백엔드 호출이면 특히) "기타"로 버리지 말고 뜻에 맞는 한국어 한 마디를 지어 준다.
> 각 태그 ko 는 "무엇을 하는지"를 짧게(경로·테이블명 말고 행동으로).
> ai purpose 는 ko(한글 기능명) + desc(비개발자용 한 문장). JSON 객체만 출력:
> ```json
> {"apis":{"db:sources:insert":{"ko":"수집한 글 저장","kindKo":"데이터 저장·조회"}},
>  "ai":{"capture_classify":{"ko":"캡처 자동 분류","desc":"저장한 내용을 AI가 주제로 자동 분류"}}}
> ```

## ANNOTATE

> screenmap.ko.json 을 읽어 group === "<GROUP>" 화면만, 기존 필드 전부 보존하고
> 각 동작에 세 필드를 추가한다.
> 1) risks: 다음 중 해당하는 것만 (없으면 []):
>    - network: 서버/DB/엣지/스토리지 호출(인터넷 필요)
>    - auth: 로그인/세션 필요
>    - ai: AI/LLM 호출(느리거나 답이 달라질 수 있음)
>    - cost: 유료 AI/쿼터 소모 가능
>    - external: 외부 서비스 의존(OAuth, 서드파티 API)
>    - gate: 기본 꺼짐/권한/등급 필요
>    - weakpoint: 취약(조용한 실패, 타임아웃 없음, 에러 처리 없음)
>    - bug: 코드/설명에 드러난 알려진 결함·미완성
> 2) checklist: "안 될 때 확인할 것" 쉬운 한국어 2-4개(실제 의존성에 맞게)
> 3) failureModes: "이렇게 안 될 수 있어요" 쉬운 한국어 1-3개
> 정확하게(후하게 X). **코드 앵커는 손대지 말 것.** JSON 배열만 출력. 이 결과가 screenmap.debug.json 의 최종 데이터.

## RESCAN / PATCH

`verify-anchors.js` 가 `SUSPECT`(그 줄에 함수가 없음) · `WEAK`(빈 줄/import/주석) · `NOT A LOCATION`(산문) 을
많이 뱉으면, 그 화면들만 **framework-aware 재스캔**해서 앵커만 고친다. 결과는
`scripts/apply-anchors.js` 가 route + action 키로 base 에 병합하고(한국어 보강·위험 주석은 그대로 보존),
모든 좌표를 실제 소스트리에 대조한다.

> 너는 "<APP>" 의 아래 화면들의 **코드 앵커만** 다시 잡는다(설명·한국어·위험은 건드리지 않는다).
> 대상 화면: <ROUTE LIST> / 소스 루트: <APP ROOT>
> 각 화면에 대해:
> 1. 이 라우트가 프로덕션에서 **실제로 렌더하는 파일**을 찾는다. 위임(`if (isXxxUI()) return <Yyy/>`,
>    `Platform.select`, 실험 플래그)이 있으면 **끝까지 따라가서** 진짜 렌더 파일을 찾는다.
> 2. 각 동작의 **핸들러 함수**를 찾는다(버튼 렌더 줄이 아니라). 로직이 훅/헬퍼에 있으면 그 파일·줄.
> 3. 좌표는 `path:line` 또는 `path (symbolName)` 로만 쓴다. 설명 문장 금지. 모르면 생략.
>
> JSON 배열만 출력:
> ```json
> [{"route":"/sign-in",
>   "stack":"프레임워크·백엔드·렌더 위임 메커니즘 한 줄(앱 전체 공통 — 아무 화면에나 한 번만)",
>   "screenRenders":"src/screens/deepspace/dds-auth-screens.tsx:149 (SignInScreen)",
>   "actions":[{"action":"Sign in","symbol":"handleSubmit",
>     "file":"src/app/(auth)/sign-in.tsx:198",
>     "impl":"src/lib/auth/useSignInForm.ts:154 (submitSignIn)",
>     "renders":"src/screens/deepspace/dds-auth-screens.tsx:305"}]}]
> ```
> `action` 문자열은 **base 와 똑같이** 쓴다(다르면 매칭이 안 돼 그 동작의 앵커가 버려진다 — 대소문자·공백 차이는 자동 보정되지만 의미가 바뀌면 매칭 실패).

패치 파일은 `patch-<group>.json` 이름으로 한 디렉터리에 모은 뒤:
```bash
node scripts/apply-anchors.js Output/screenmap.debug.json <patchDir> <appRoot> Output/screenmap.debug.json
node scripts/verify-anchors.js Output/screenmap.debug.json <appRoot> --strict
```

## 모델/도구 메모

- 스키마 검증 서브에이전트는 자주 실패하므로 JSON 은 텍스트로 받아 `merge-readers.js` 로 합친다
  (merge-readers 가 스키마를 직접 검사하고, `ai` 가 문자열이면 거기서 멈춘다).
- 화면이 적으면 fan-out 없이 한 번에 스캔해도 된다.
- 스크린샷이 없으면 GLOSSARY/ENRICH 만으로도 동작한다(화면유형 아이콘으로 인식). 캡처를 뜨는 법은
  [capture-shots.md](capture-shots.md).
