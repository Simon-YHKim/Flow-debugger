// flow-debugger: PRESCAN — the deterministic facts a reader cannot discover on its own.
//
// A real run of this skill produced a map where only 27 of 86 screens were right. Three of the
// five root causes were not "the model read the code badly" — they were "the model was asked a
// question it could not answer from the file in front of it":
//
//   · Which of these two components does production actually render?
//       The route file delegates (`if (isDeepSpaceUI()) return <XxxScreen/>`), so the scan
//       described the dead legacy body. 10 screens were simply the wrong screen.
//   · Does a user ever reach this code?
//       `DevOnlyRoute` redirects to / in production. The scan read the code correctly and
//       reported "your save button is fake, you are losing data" about a screen nobody can
//       open. 4 of 21 bug claims were like this — the most damaging kind of error this tool
//       can make, because its reader cannot check.
//   · What does this innocent-looking helper really do?
//       `createRecord()` calls an embedding model three frames down. The screen file says
//       nothing about it. 66 server calls and 7 AI calls went missing.
//
// So we grep for them ONCE, deterministically, and paste the answers into the SCAN prompt.
// Facts, not inference.
//
// usage:
//   node prescan.js <appRoot> [--out Output/prescan.json] [--graph <graph.json>]
//
// Feed the printed block into the SCAN prompt (references/scan-prompts.md, "PRESCAN 결과").
const fs = require('fs');
const path = require('path');
const R = require('./lib/reach');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const v = argv[i];
  if (v === '--out' || v === '--graph') flags[v.slice(2)] = argv[++i];
  else if (v.startsWith('--')) flags[v.slice(2)] = true;
  else pos.push(v);
}
if (!pos.length) { console.error('usage: node prescan.js <appRoot> [--out prescan.json] [--graph graph.json]'); process.exit(2); }
const appRoot = pos[0];
try { if (!fs.statSync(appRoot).isDirectory()) throw 0; }
catch (e) { console.error('not a directory: ' + appRoot); process.exit(2); }

const graph = flags.graph && fs.existsSync(flags.graph)
  ? JSON.parse(fs.readFileSync(flags.graph, 'utf8')) : null;

const render = R.detectRenderMode(appRoot);
const helpers = R.indexHelpers(appRoot);
const gates = graph ? R.scanGates(appRoot, graph) : {};

const out = { appRoot: path.resolve(appRoot), render, helpers, gates };
const outPath = flags.out || 'prescan.json';
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

// ---- the human/prompt-facing summary ------------------------------------------
const aiH = Object.entries(helpers).filter(([, v]) => v.ai);
const dbH = Object.entries(helpers).filter(([, v]) => v.apis.length && !v.ai);

console.log('PRESCAN -> ' + outPath + '\n');

console.log('1) 프로덕션 렌더 경로');
if (render) {
  console.log('   ' + render.fn + '()  @ ' + render.file);
  console.log('   ' + render.note);
  console.log('   → SCAN 프롬프트에 "사용자가 보는 화면은 이 함수가 고르는 쪽이다"를 명시할 것.');
  console.log('     이걸 안 알려주면 리더가 라우트 파일의 legacy 본문을 화면이라고 적는다(실측 10화면).');
} else {
  console.log('   (감지되지 않음 — 라우트 파일이 화면을 직접 그리는 것으로 보임)');
}

console.log('\n2) 겉보기와 다른 헬퍼 (' + Object.keys(helpers).length + '개 — 화면 코드만 읽으면 절대 안 보임)');
if (aiH.length) {
  console.log('   ★ 내부에서 AI를 부르는 함수 (' + aiH.length + '):');
  aiH.slice(0, 20).forEach(([k, v]) =>
    console.log('     ' + k + '()  ' + v.file + (v.via ? '   ← ' + v.via + ' 경유' : '') +
      (v.apis.length ? '\n        + ' + v.apis.slice(0, 4).join(', ') : '')));
}
if (dbH.length) {
  console.log('   서버/DB를 건드리는 함수 (' + dbH.length + ', 상위 15):');
  dbH.slice(0, 15).forEach(([k, v]) => console.log('     ' + k + '()  ' + v.apis.slice(0, 3).join(', ')));
}
console.log('   → SCAN 프롬프트에 이 표를 붙일 것. 화면에 createRecord(...) 한 줄만 있어도');
console.log('     리더가 그 안의 DB/AI 호출을 apis/ai 에 적을 수 있게 된다(실측 누락 66+7건).');

if (graph) {
  const g = Object.entries(gates);
  console.log('\n3) 게이트가 걸린 화면 (' + g.length + ') — 여기 있는 "버그"는 사용자에게 안 보일 수 있다');
  if (!g.length) console.log('   (없음)');
  g.forEach(([route, v]) => console.log('   ' + route + '  [' + v.gate + ']  ' + v.why + '\n      ' + v.evidence + '  ' + v.line));
  if (g.length) {
    console.log('   → 이 화면의 동작에 bug 위험을 붙이기 전에 "프로덕션에서 열리는가"를 먼저 답할 것.');
    console.log('     실측: 확신에 찬 버그 신고 4건이 전부 dev 전용 라우트였다.');
  }
} else {
  console.log('\n3) 게이트 — --graph <screenmap.json> 을 주면 화면별로 검사합니다.');
}
