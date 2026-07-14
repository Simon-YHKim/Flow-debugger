// flow-debugger: turn the verified map into a HANDOFF a fresh session can actually READ.
//
// The first version of this script dumped 1,350 lines — 950 of them a coordinate table for
// every action — and called it a handoff. It was a DUMP. A fresh session that reads it burns
// its context on tables and still does not know what the app is, and the three things that
// would have saved it are buried on line 900.
//
// A handoff has to be read to be worth anything. So this splits the two jobs:
//
//   FLOW-HANDOFF.md   what you READ, once, in two minutes. What the app is, the three traps
//                     that will cost you an afternoon, the feature map, the known bugs.
//   flow-map.json     what you LOOK UP, per screen, when you are about to touch it. Every
//                     action, its verified coordinates, its dependencies. grep/jq-able.
//   flow-debugger.html what you CLICK, when you want to see it.
//
// usage:
//   node make-handoff.js <graph.json> <appRoot> --out <repo>/docs/FLOW-HANDOFF.md
//        [--json <repo>/docs/flow-map.json] [--prescan p.json] [--glossary g.json]
//        [--html docs/flow-debugger.html] [--name "2nd-B"]
const fs = require('fs');
const path = require('path');
const A = require('./lib/anchors');
const R = require('./lib/reach');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const v = argv[i];
  if (v.startsWith('--')) flags[v.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
  else pos.push(v);
}
if (pos.length < 2) {
  console.error('usage: node make-handoff.js <graph.json> <appRoot> --out docs/FLOW-HANDOFF.md [--json docs/flow-map.json] [--prescan p.json] [--glossary g.json] [--html docs/flow-debugger.html] [--name App]');
  process.exit(2);
}
const [graphPath, appRoot] = pos;
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const rd = (p, d) => { try { return p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d; } catch (e) { return d; } };
const glossary = rd(flags.glossary, {});
const GAPI = glossary.apis || {}, GAI = glossary.ai || {};

const sideStack = graphPath.replace(/\.json$/, '.stack.txt');
const stack = fs.existsSync(sideStack) ? fs.readFileSync(sideStack, 'utf8').trim() : '';
const appName = (flags.name && flags.name !== true) ? flags.name : '앱';
const prescan = rd(flags.prescan, null) || {
  render: R.detectRenderMode(appRoot), helpers: R.indexHelpers(appRoot), gates: R.scanGates(appRoot, graph),
};
const audit = A.validateGraph(graph, appRoot, { snap: false });
const deleg = A.lintDelegation(graph, appRoot);
const st = audit.stat;
const verified = st.exact + st.near + st.resolved;
const located = st.unchecked + st.fileonly;
const broken = st.absent + st.prose + st.missing + st.ambiguous + st.range + st.outside + st.unparsable;

// A handoff is a promise: "these coordinates are real, start here." If the graph no longer matches
// the tree — because the app moved on since it was scanned — then writing the handoff anyway
// stamps today's date on yesterday's map, and the next session walks straight into wrong lines
// wearing a checkmark. That is the exact failure this tool exists to prevent, so it is the one
// thing it must not do quietly.
if (broken > 0 && !flags['allow-stale']) {
  console.error(`\n이 지도는 지금 코드와 맞지 않습니다 — 좌표 ${broken}개가 틀렸어요.`);
  console.error(`(그 줄에 해당 함수가 없음 ${st.absent} · 파일 없음 ${st.missing} · 그 외 ${broken - st.absent - st.missing}`
    + ` — 스캔 이후 코드가 움직였다는 뜻입니다.)`);
  console.error(`핸드오프를 이대로 쓰면, 다음 세션은 틀린 줄을 '확인됨' 표시와 함께 받게 됩니다.\n`);
  console.error(`먼저 좌표를 지금 코드로 옮기세요:`);
  console.error(`  node scripts/rebase-anchors.js <graph.json> "${path.resolve(appRoot)}" --from <지도를 만든 커밋>`);
  console.error(`  node scripts/verify-anchors.js <graph.json> "${path.resolve(appRoot)}" --fix <graph.json> --strict`);
  console.error(`\n그래도 그냥 내보내려면 --allow-stale (권하지 않습니다).`);
  process.exit(1);
}

const outPath = (flags.out && flags.out !== true) ? flags.out : 'FLOW-HANDOFF.md';
const jsonPath = (flags.json && flags.json !== true) ? flags.json : path.join(path.dirname(outPath), 'flow-map.json');
const htmlRel = (flags.html && flags.html !== true) ? flags.html : null;
const rel = p => {
  const r = path.relative(path.resolve(appRoot), path.resolve(p)).replace(/\\/g, '/');
  return r.startsWith('..') ? path.basename(p) : r;
};

const ko = s => s.titleKo || s.title || s.route;
const actKo = a => a.actionKo || a.action;
const apiKo = t => (GAPI[t] && GAPI[t].ko) || t;
const trust = raw => {
  const v = audit.index[raw]; if (!v) return '';
  if (['exact', 'near', 'resolved'].includes(v.status)) return '✔';
  if (['unchecked', 'fileonly'].includes(v.status)) return '·';
  if (v.status === 'weak') return '~';
  return '⚠';
};
const groups = [...new Set(graph.map(s => s.group))];
const groupKo = g => (graph.find(s => s.group === g && s.groupKo) || {}).groupKo || g;
const acts = graph.flatMap(s => (s.actions || []).map(a => ({ s, a })));
const aiUses = acts.filter(x => x.a.ai && x.a.ai.purpose);
const aiPurposes = [...new Set(aiUses.map(x => x.a.ai.purpose))];
const apiTags = [...new Set(acts.flatMap(x => x.a.apis || []))];
const bugs = acts.filter(x => (x.a.risks || []).includes('bug'));

// ================================================================ the JSON (what you look up)
const map = {
  app: appName,
  generatedFrom: path.basename(graphPath),
  stack,
  production: prescan.render ? { switch: prescan.render.fn, at: prescan.render.file, note: prescan.render.note } : null,
  gates: prescan.gates,
  aiHelpers: Object.fromEntries(Object.entries(prescan.helpers || {}).filter(([, v]) => v.ai)),
  trust: { verified, located, caution: st.weak, broken, total: st.total, delegationTraps: deleg.length },
  screens: graph.map(s => ({
    route: s.route, title: ko(s), group: s.group, groupKo: s.groupKo || s.group,
    summary: s.summaryKo || s.summary || '',
    rendersInProduction: s.renders || null,
    gate: (prescan.gates || {})[s.route] || null,
    actions: (s.actions || []).map(a => ({
      action: actKo(a), raw: a.action, symbol: a.symbol || null,
      does: a.plain || a.detail || '',
      file: a.file || null, fileTrust: a.file ? trust(a.file) : null,
      impl: a.impl || null, implTrust: a.impl ? trust(a.impl) : null, implName: a.implName || null,
      apis: a.apis || [], ai: a.ai || null, goesTo: a.to || null,
      risks: a.risks || [], checklist: a.checklist || [], failureModes: a.failureModes || [],
      knownBug: (a.risks || []).includes('bug'),
    })),
  })),
};
fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
fs.writeFileSync(jsonPath, JSON.stringify(map, null, 2), 'utf8');

// The handoff is a set of claims about source code at one commit. The moment the app moves past
// it, every coordinate in it is a guess wearing a checkmark. So it leaves with the evidence it
// was built from, and the next session can ask — in one command — whether it still holds.
const { fingerprint } = require('./lib/fingerprint');
const fpPath = jsonPath.replace(/\.json$/, '.fingerprint.json');
const fp = fingerprint(graph, appRoot, new Date().toISOString());
fs.writeFileSync(fpPath, JSON.stringify(fp, null, 2), 'utf8');

// ================================================================ the MD (what you read)
const L = []; const p = (...x) => L.push(...x);

p(`# ${appName} — 구조 핸드오프`, '');
p(`> 새 세션은 **이 파일만 읽으면** 앱 구조를 안다. 2분이면 된다.`);
p(`> 개별 화면을 건드릴 땐 [\`${rel(jsonPath)}\`](${rel(jsonPath)}) 를 조회한다(아래 §5).`);
p(`> 자동 생성 — 손으로 고치지 말고 \`make-handoff.js\` 로 재생성할 것.`, '');
p(`**${graph.length}개 화면 · ${acts.length}개 동작 · 서버/데이터 ${apiTags.length}종 · AI ${aiPurposes.length}종**  `);
p(`코드 좌표 ${st.total}개 전부 실제 소스와 대조: **✔ 함수까지 확인 ${verified}** · **· 파일·줄만 확인 ${located}** · ⚠ ${broken + st.weak}`, '');
if (stack) p('**스택** — ' + stack, '');

// A map that cannot say when it went out of date is worse than no map: it hands out coordinates
// with the same confidence whether they are right or not. So the first thing the next session sees
// is what this map rests on, and the one command that checks it.
p(`### 0. 먼저 — 이 문서가 아직 맞는지 30초 안에 확인`, '');
p(`이 지도는 커밋 \`${(fp.git && fp.git.head) ? String(fp.git.head).slice(0, 8) : '?'}\`${fp.git && fp.git.dirty ? ' (+ 커밋 안 된 변경)' : ''} 의 코드를 읽고 만들었다.`);
p(`그 뒤로 코드가 바뀌었다면 아래 좌표들은 **틀린 채로 자신 있어 보인다.** 바로 확인할 것:`, '');
p('```bash');
p(`node <flow-debugger>/scripts/check-stale.js ${rel(jsonPath)} . --strict`);
p('```');
p(`- **exit 0** — 앵커한 파일 ${Object.keys(fp.files || {}).length}개가 그대로다. 이 문서를 믿고 시작해도 된다.`);
p(`- **exit 1** — 바뀐 파일 목록이 그대로 출력된다. **그 화면들만** 다시 스캔하면 된다(§6 재생성).`, '');

// ---------------------------------------------------------------- the traps
p('---', '', '## 1. 코드 만지기 전에 반드시 아는 3가지', '');
p('이 셋을 모르고 시작하면 반나절을 버린다. 실제로 그렇게 됐다.', '');

let n = 0;
if (prescan.render) {
  n++;
  p(`### ${n}. \`src/app/*.tsx\` 를 고치면 **화면이 안 바뀐다**`, '');
  p(`**\`${prescan.render.fn}()\`** (\`${prescan.render.file}\`) 가 어느 UI를 그릴지 고른다`
    + (prescan.render.routes ? ` — 라우트 ${prescan.render.routes}개가 이걸로 갈라진다.` : '.'), '');
  p(`사용자가 보는 건 **위임된 쪽**이다. 라우트 파일의 본문은 프로덕션에서 렌더되지 않는다.`);
  p(`거기를 고치면 **빌드는 초록인데 화면은 그대로**다.`, '');
  const withR = graph.filter(s => s.renders);
  p(`**고칠 파일 찾는 법** — 화면 ${withR.length}개가 위임한다. 그 화면의 진짜 파일:`, '');
  p('```bash');
  p(`jq -r '.screens[] | select(.route=="/sign-in") | .rendersInProduction' ${rel(jsonPath)}`);
  p('```', '');
}

const gateList = Object.entries(prescan.gates || {});
if (gateList.length) {
  n++;
  p(`### ${n}. 이 ${gateList.length}개 화면은 **사용자가 못 연다**`, '');
  p(`배포판에서 열리지 않는다. **여기서 찾은 "버그"는 실사용자에게 안 보인다** — 고치기 전에 그것부터 확인할 것.`);
  p(`(전에 이걸 안 물어서 "저장 버튼이 가짜다, 데이터가 사라진다"는 확신에 찬 **허위 신고 4건**이 나갔다.)`, '');
  p('| 화면 | 왜 | 근거 |', '|---|---|---|');
  gateList.forEach(([r, g]) => p(`| \`${r}\` | ${g.why} | \`${g.evidence}\` |`));
  p('');
}

const aiH = Object.entries(prescan.helpers || {}).filter(([, v]) => v.ai);
if (aiH.length) {
  n++;
  p(`### ${n}. 겉보기와 다른 함수 — **호출 한 줄에 AI가 숨어 있다**`, '');
  p(`화면 코드엔 \`createRecord(...)\` 한 줄뿐인데 그 안에서 **AI를 부른다.** 화면 파일만 읽으면 절대 안 보인다.`);
  p(`(이걸 안 따라가서 서버 호출 66건·AI 7건이 통째로 지도에서 빠졌었다.)`, '');
  p(`**AI를 부르는 함수 ${aiH.length}개** — 화면에 이 호출이 보이면 AI·비용·지연을 계산에 넣어라:`, '');
  p('| 함수 | 위치 | 경유 |', '|---|---|---|');
  aiH.slice(0, 12).forEach(([k, v]) => p(`| \`${k}()\` | \`${v.file}\` | ${v.via ? '`' + v.via + '`' : '직접'} |`));
  if (aiH.length > 12) p(`\n전체 ${aiH.length}개: \`jq '.aiHelpers | keys' ${rel(jsonPath)}\``);
  p('');
}

// ---------------------------------------------------------------- feature map
p('---', '', '## 2. 앱 기능 지도', '');
// The "하는 일" column used to borrow the first screen's summary, which produced things like
// "인증·시작 = 빈 껍데기입니다" (it had grabbed the (auth) layout wrapper). A wrong one-liner is
// worse than none — the screen names below say it themselves.
p('| 영역 | 화면 | 동작 | 주요 화면 |', '|---|---|---|---|');
groups.forEach(g => {
  const list = graph.filter(s => s.group === g);
  const nAct = list.reduce((n, s) => n + (s.actions || []).length, 0);
  const top = list.slice().sort((a, b) => (b.actions || []).length - (a.actions || []).length).slice(0, 4);
  p(`| **${groupKo(g)}** | ${list.length} | ${nAct} | ${top.map(s => `${ko(s)} \`${s.route}\``).join(' · ')} |`);
});
p('');
p(`전체 화면 목록: \`jq -r '.screens[] | "\\(.groupKo)  \\(.title)  \\(.route)"' ${rel(jsonPath)}\``, '');

// ---------------------------------------------------------------- known bugs
if (bugs.length) {
  p('---', '', `## 3. 알려진 문제 ${bugs.length}건 (검증됨)`, '');
  p('스캔이 코드에서 확인한 결함이다. **손대기 전에 여기 있는지 먼저 본다.**', '');
  p('| 화면 | 안 되는 것 | 증상 | 코드 |', '|---|---|---|---|');
  bugs.forEach(({ s, a }) => {
    const sym = (a.failureModes || [])[0] || a.detail || '';
    const loc = a.impl || a.file;
    p(`| \`${s.route}\` | ${actKo(a)} | ${String(sym).replace(/\|/g, '/').slice(0, 60)}${sym.length > 60 ? '…' : ''} | ${loc ? '`' + loc + '` ' + trust(loc) : '—'} |`);
  });
  p('');
}

// ---------------------------------------------------------------- nav
const NAV = [];
acts.forEach(({ s, a }) => { if (a.to && graph.some(x => x.route === a.to)) NAV.push([s, a, a.to]); });
if (NAV.length) {
  p('---', '', `## 4. 화면 이동 (${NAV.length}개 연결)`, '');
  p('<details><summary>mermaid 그래프 펼치기</summary>', '', '```mermaid', 'flowchart LR');
  const id = new Map(); let i = 0;
  const mid = r => { if (!id.has(r)) id.set(r, 'S' + (++i)); return id.get(r); };
  const seen = new Set();
  NAV.forEach(([s, a, to]) => {
    const k = s.route + '>' + to; if (seen.has(k)) return; seen.add(k);
    const q = t => String(t).replace(/["|]/g, "'");
    const t = graph.find(x => x.route === to);
    p(`  ${mid(s.route)}["${q(ko(s))}"] -->|${q(actKo(a))}| ${mid(to)}["${q(t ? ko(t) : to)}"]`);
  });
  p('```', '', '</details>', '');
}

// ---------------------------------------------------------------- lookup
p('---', '', '## 5. 필요할 때 찾아보는 법', '');
p(`읽는 건 여기까지다. 나머지는 **찾아 쓴다** — [\`${rel(jsonPath)}\`](${rel(jsonPath)}) 에 ${acts.length}개 동작 전부 있다.`, '');
p('```bash');
p(`# 한 화면이 무슨 일을 하는가`);
p(`jq '.screens[] | select(.route=="/capture")' ${rel(jsonPath)}`);
p('');
p(`# 이 화면을 고치려면 어느 파일인가 (프로덕션 렌더 파일)`);
p(`jq -r '.screens[] | select(.route=="/capture") | .rendersInProduction' ${rel(jsonPath)}`);
p('');
p(`# 어떤 동작이 이 테이블을 건드리나`);
p(`jq -r '.screens[].actions[] | select(.apis[]? | contains("records")) | .action' ${rel(jsonPath)}`);
p('');
p(`# AI 쓰는 동작 전부`);
p(`jq -r '.screens[] as $s | $s.actions[] | select(.ai) | "\\($s.route)  \\(.action)  \\(.ai.purpose)"' ${rel(jsonPath)}`);
p('```', '');
if (htmlRel) p(`**클릭해서 보기:** [\`${htmlRel}\`](${htmlRel}) — 화면별 플로우 / 시스템 플로우, 버그 신고서 생성.`, '');

// ---------------------------------------------------------------- trust
p('---', '', '## 6. 이 지도를 얼마나 믿어도 되나', '');
p('| | 수 | 뜻 |', '|---|---|---|');
p(`| **✔** | ${verified} | 그 줄에 **그 함수가 실제로 있음** — 출발점으로 신뢰해도 됨 |`);
p(`| **·** | ${located} | 파일·줄은 실재. **대조할 함수명이 없어 그 줄이 맞는지는 확인 못 함** — 근처를 읽고 판단 |`);
p(`| **~** | ${st.weak} | 빈 줄/import/주석 — 로직은 다른 줄 |`);
p(`| **⚠** | ${broken} | 대조 실패 — 믿지 말 것 |`);
p(`| 위임 트랩 | ${deleg.length} | 앵커가 가리키는 파일이 프로덕션에선 다른 걸 그림 |`, '');
if (deleg.length) {
  p('**위임 트랩 — 이 좌표를 고쳐도 화면은 안 바뀐다:**', '');
  deleg.slice(0, 8).forEach(d => p(`- \`${d.route}\` :: ${d.action} → \`${d.file}\` 는 프로덕션에서 \`<${d.delegatesTo}/>\` 를 렌더`));
  p('');
}
p('**앱을 고쳤으면 지도도 갱신한다** — 안 하면 이 파일이 거짓말을 시작한다:', '');
p('```bash');
p('# flow-debugger 스킬 폴더에서 (scan-prompts.md "RESCAN / PATCH" 참조)');
p(`node scripts/verify-anchors.js <graph.json> "${path.resolve(appRoot)}" --fix <graph.json> --strict`);
p(`node scripts/make-handoff.js <graph.json> "${path.resolve(appRoot)}" --out ${rel(outPath)} --json ${rel(jsonPath)}`);
p('```', '');

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, L.join('\n') + '\n', 'utf8');

const kb = f => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log('READ  -> ' + outPath + '   ' + kb(outPath) + '  (' + L.length + ' lines)');
console.log('LOOKUP-> ' + jsonPath + '   ' + kb(jsonPath));
console.log('  ' + graph.length + ' screens · ' + acts.length + ' actions · AI ' + aiPurposes.length +
            ' · known bugs ' + bugs.length + ' · anchors ✔' + verified + ' ·' + located + ' ~' + st.weak + ' ⚠' + broken);
console.log('\nNEXT: commit BOTH to the app repo and MERGE. A handoff that lives on one machine is not a handoff.');
