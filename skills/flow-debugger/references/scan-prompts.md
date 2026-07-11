# flow-debugger: fan-out prompts

화면 수가 많으면 화면을 그룹으로 나눠 그룹당 리더 1명으로 병렬 실행한다.
각 리더는 아래 프롬프트의 스키마대로 **JSON 배열만** 반환한다(설명/펜스 없이).

## Contents
- SCAN: 화면 -> 동작 -> api/ai 추출 (필수)
- ENRICH: 쉬운 한국어 라벨 (비개발자 필수)
- GLOSSARY: api/ai 용어 한국어 풀이
- ANNOTATE: 디버그 위험/체크리스트 (이 스킬의 핵심)
- 모델/도구 메모

## SCAN

> 너는 "<APP>" 앱 화면을 흐름도용으로 매핑한다. group = "<GROUP>".
> 아래 화면 파일을 전부 읽고 런타임 동작을 추적한다: <FILE LIST>
> 핸들러/useEffect 에서 supabase 호출(.from(x).select/insert/update/delete,
> .rpc(name), .functions.invoke(fn), .storage.from(b)...), LLM 호출
> (callGemini/callAdvisor/embedTexts/transcribe/classify*)을 찾는다. lib 헬퍼를
> 거치면 실제 api(table/rpc/edge/storage)까지 따라간다.
> 각 화면마다 PRIMARY 동작만(최대 ~6), 화면 로드 데이터 패치는 "On load" 동작으로.
>
> **앵커 정확도(중요 — 흐름도가 개발자에게 넘길 신고서의 신뢰도를 좌우한다):**
> - `file` 은 **동작의 실제 로직이 있는 줄**을 가리켜야 한다 — 화면 진입(mount)/import/렌더 가드 줄이 아니라, 그 동작을 처리하는 **핸들러 함수의 줄**. (예: 로그인 버튼이면 `<Pressable>` 렌더 줄이 아니라 `handleSubmit`/`signInWithPassword` 호출 줄.)
> - 실제 로직이 **다른 파일의 훅/헬퍼**(예: `useSignInForm.ts`, `lib/…`)에 있으면 그 위치를 **`impl`** 에 적는다(`file` 은 화면 파일, `impl` 은 진짜 로직 위치).
> - 화면이 조건에 따라 **다른 컴포넌트에 위임**하면(예: `if (isDeepSpaceUI()) return <XxxDesignScreen/>`, `Platform.select`, 실험 플래그) **프로덕션에서 실제로 렌더되는 파일**을 **`renders`** 에 적는다. 이게 없으면 개발자가 안 보이는 legacy 파일을 고쳐 "빌드는 초록인데 화면은 그대로"가 된다.
> - 확실치 않으면 추정하지 말고 `impl`/`renders` 를 생략한다(빈 값이 틀린 값보다 낫다).
>
 JSON 배열만 출력(배열 요소는 전부 화면 객체 — 다른 종류의 객체를 섞지 말 것):
> ```json
> [{"route":"/sign-in","title":"Sign in","group":"<GROUP>","summary":"...",
>   "renders":"src/screens/deepspace/dds-auth-screens.tsx:149",
>   "actions":[{"action":"Sign in","feature":"handleSubmit",
>     "apis":["auth:signInWithPassword","db:users:select"],
>     "ai":null,
>     "file":"src/app/(auth)/sign-in.tsx:198","impl":"src/lib/auth/useSignInForm.ts:154",
>     "renders":"src/screens/deepspace/dds-auth-screens.tsx:305",
>     "detail":"무슨 일이 일어나는지 1-2문장","to":"/"}]}]
> ```
> 태그 형식 — **앱의 실제 백엔드에 맞춰** 고른다(Supabase 전용 아님):
> - Supabase: db:<table>:<select|insert|update|delete>, rpc:<name>, edge:<fn>, storage:<bucket>:<op>, auth:<op>
> - 범용(REST/GraphQL/기타 백엔드): rest:<METHOD>:<path>(예 rest:GET:/api/notes), graphql:<query|mutation>:<name>, http:<METHOD>:<host>, fn:<name>(로컬/서버 함수 호출), auth:<op>(로그인·세션)
> 실제 호출을 **정직하게** 반영하고, 해당 없는 종류를 억지로 db: 에 끼워 넣지 말 것. ai 없으면 null. 유효한 JSON(쌍따옴표, trailing comma 금지).
> `impl`/`renders` 는 해당 없으면 생략(선택 필드 — 흐름도가 있으면 '코드 힌트'에 "@ impl (렌더: renders)"로 더한다). **stack 한 줄**(프레임워크·백엔드·화면변형 메커니즘)은 배열에 섞지 말고 ENRICH 의 앱 최상위 요약/전체 메모로 따로 전달한다(화면 객체 배열을 오염시키면 흐름도에 유령 노드가 생긴다).
> **`to`**: 그 동작이 버튼/링크/router(push/replace/navigate/Link href)로 **다른 화면으로 이동**시키면
> 대상 route(예 "/capture-full"), 이동이 아니면 null. (화면 흐름 뷰가 이 값으로 화면→화면 화살표를 그린다.)

## ENRICH

> screenmap.json 을 읽어 group === "<GROUP>" 화면만, 기존 필드 전부 보존하고
> 각 화면에 titleKo(짧은 화면 이름), summaryKo(이 화면이 뭐 하는 곳인지 비개발자용 한 문장),
> example(이 화면을 언제 쓰는지 구체적 상황 한 문장, "예:" 없이 상황만),
> 각 동작에 actionKo(사용자가 하는 행동), plain(그 행동을 하면 무슨 일이 일어나는지 쉬운 한국어
> 한 문장, 전문용어/영문 약어 금지), example(그 동작을 실제로 쓰는 구체적 사용 예시 한 문장 —
> 실제 상황·데이터를 넣어 손에 잡히게, "예:" 접두어 없이 상황만; 앞에 UI가 자동으로 "예: "를 붙임)
> 을 추가한다. 자연스럽고 친근하게. JSON 배열만 출력.

## GLOSSARY

> screenmap.json 의 모든 action.apis[] 고유 태그와 모든 ai.purpose 를 모아
> 비개발자용 한국어 풀이를 만든다. 태그 kind = 첫 토큰.
> kindKo 매핑: db="데이터 저장·조회", rpc="서버 계산", edge="서버 기능", storage="파일 저장",
> auth="로그인·인증", rest/http/graphql="서버 요청", fn="서버 기능".
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
> 정확하게(후하게 X). JSON 배열만 출력. 이 결과가 screenmap.debug.json 의 최종 데이터.

## 모델/도구 메모

- 스키마 검증 서브에이전트는 자주 실패하므로 JSON 은 텍스트로 받아 `merge-readers.js` 로 합친다.
- 화면이 적으면 fan-out 없이 한 번에 스캔해도 된다.
- 스크린샷이 없으면 GLOSSARY/ENRICH 만으로도 동작한다(아이콘으로 화면 인식).
