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
> JSON 배열만 출력:
> ```json
> [{"route":"/capture","title":"Capture","group":"<GROUP>","summary":"...",
>   "actions":[{"action":"Submit clip","feature":"classifyClipper",
>     "apis":["edge:gemini-proxy","db:sources:insert","rpc:bump_gemini_spend","storage:raw-clippings:upload"],
>     "ai":{"purpose":"capture_classify","model":"gemini-2.5-flash","via":"proxy"},
>     "file":"src/app/capture.tsx:1155","detail":"무슨 일이 일어나는지 1-2문장"}]}]
> ```
> 태그 형식: db:<table>:<select|insert|update|delete>, rpc:<name>, edge:<fn>,
> storage:<bucket>:<op>, auth:<op>. ai 없으면 null. 유효한 JSON(쌍따옴표, trailing comma 금지).

## ENRICH

> screenmap.json 을 읽어 group === "<GROUP>" 화면만, 기존 필드 전부 보존하고
> 각 화면에 titleKo(짧은 화면 이름), summaryKo(이 화면이 뭐 하는 곳인지 비개발자용 한 문장),
> 각 동작에 actionKo(사용자가 하는 행동), plain(그 행동을 하면 무슨 일이 일어나는지 쉬운 한국어
> 한 문장, 전문용어/영문 약어 금지)을 추가한다. 자연스럽고 친근하게. JSON 배열만 출력.

## GLOSSARY

> screenmap.json 의 모든 action.apis[] 고유 태그와 모든 ai.purpose 를 모아
> 비개발자용 한국어 풀이를 만든다. 태그 kind = 첫 토큰(db/rpc/edge/storage/auth, 그 외 기타).
> kindKo: db="데이터 저장·조회", rpc="서버 계산", edge="서버 기능", storage="파일 저장",
> auth="로그인·인증", 기타="기타". 각 태그 ko 는 "무엇을 하는지"를 짧게(테이블명 말고 행동으로).
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
