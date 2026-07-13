# 화면 캡처 뜨기 (shots)

썸네일은 비개발자가 "어떤 화면인지" 알아보는 유일한 수단이다. 그런데 이 절차가
어디에도 적혀 있지 않아서(스크립트도, 문서도 없이 `shots-map.json` 을 소비만 했다)
한 번 뜬 캡처를 다시 뜰 수도, 새 앱의 캡처를 뜰 수도 없었다. 그 구멍을 메우는 문서다.

캡처는 **선택**이다. 없으면 화면유형 아이콘(`type`)으로 대체된다.

## 흐름

```
앱을 웹으로 띄운다  ->  scripts/capture-shots.js 로 라우트별 png  ->  shots-map.json
                     ->  scripts/embed-shots.js 로 base64 임베드  ->  shots.json  ->  build.js
```

## 1) 앱을 웹으로 띄운다

| 스택 | 명령 | 기본 주소 |
|---|---|---|
| Expo / React Native | `npx expo start --web` 또는 `npm run web` | http://localhost:8081 |
| Next.js | `npm run dev` | http://localhost:3000 |
| Vite / CRA | `npm run dev` / `npm start` | http://localhost:5173 |
| 정적 빌드 | `npx serve dist` | http://localhost:3000 |

네이티브 전용 화면은 웹에서 안 뜰 수 있다 — 그건 캡처를 비우고 아이콘 폴백으로 둔다.
(안드로이드 실기기/에뮬 캡처가 꼭 필요하면 `adb exec-out screencap -p > x.png` 를 라우트마다
딥링크로 이동하며 반복한다. 느리고 잘 깨져서 권장하지 않는다.)

## 2) 라우트별로 캡처

```bash
node scripts/capture-shots.js <graph.json> <baseUrl> <outDir> [--base-path /app] \
     [--auth-url <로그인주소> --email <id> --password <pw>] [--wait 1200] [--width 390] [--height 844]
```

- `graph.json` 의 모든 `route` 를 돌면서 `<baseUrl><basePath><route>` 를 연다.
- 결과: `<outDir>/<slug>.png` 들 + `<outDir>/shots-map.json` (`{route: pngPath}`)
- 로그인이 필요한 화면이 있으면 `--auth-url/--email/--password` 로 먼저 로그인한다
  (테스트 계정으로. **실계정·운영 자격증명 금지**).
- 동적 라우트(`/record/[id]`)는 자동으로 건너뛴다 — 실제 id 가 필요하면
  `shots-map.json` 을 손으로 채워도 된다(형식만 맞으면 된다).

## 3) 임베드

```bash
node scripts/embed-shots.js <outDir>/shots-map.json Output/shots.json
```

이 파일이 base64 data URI 로 HTML 안에 박힌다(그래서 산출물이 자체완결이다).
캡처가 많으면 HTML 이 커진다 — 86화면/58캡처에 약 1.8MB.

## 4) 빌드

```bash
node scripts/build.js assets/flow-debugger.template.html \
  Output/screenmap.debug.json Output/glossary.ko.json Output/shots.json \
  Output/flow-debugger.html --app-root <앱 루트>
```

## 커버리지 확인

빌드 로그의 `캡처` 수 또는 HTML 의 **📋 시스템 스펙** 팝업에서 확인한다.
캡처가 없는 라우트는 아이콘으로 나오므로, 그대로 둬도 흐름도는 정상 동작한다.
