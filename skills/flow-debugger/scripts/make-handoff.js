// flow-debugger: turn the verified map into a HANDOFF a fresh session can read.
//
// The interactive HTML is for a human. This is for the next agent (or the next you): one
// git-persistent markdown file that hands over the app's real structure — what the screens
// are, what each one actually calls, WHICH FILE PRODUCTION RENDERS, which routes a user can
// never reach, which innocent-looking helper calls an AI three frames down, and where every
// verified code coordinate is.
//
// It exists because a fresh session starts with nothing, and the two most expensive mistakes
// it makes are the two this file prevents:
//   · editing `src/app/x.tsx` when production renders `src/screens/deepspace/X.tsx`
//     (build green, screen unchanged)
//   · "fixing" a bug on a route that is wrapped in DevOnlyRoute and never opens
//
// Written to the TARGET repo (not this one), committed, and merged — a handoff that only
// lives on one machine is not a handoff.
//
// usage:
//   node make-handoff.js <graph.json> <appRoot> [--out <repo>/docs/FLOW-HANDOFF.md]
//                        [--prescan prescan.json] [--glossary glossary.ko.json]
//                        [--html docs/flow-debugger.html] [--name "2nd-B"]
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
  console.error('usage: node make-handoff.js <graph.json> <appRoot> [--out docs/FLOW-HANDOFF.md] [--prescan p.json] [--glossary g.json] [--html docs/flow-debugger.html] [--name App]');
  process.exit(2);
}
const [graphPath, appRoot] = pos;
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const rd = (p, d) => { try { return p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d; } catch (e) { return d; } };
const glossary = rd(flags.glossary, {});
const GAPI = glossary.apis || {}, GAI = glossary.ai || {};

const sideStack = graphPath.replace(/\.json$/, '.stack.txt');
const stack = fs.existsSync(sideStack) ? fs.readFileSync(sideStack, 'utf8').trim() : '';
const appName = (flags.name && flags.name !== true) ? flags.name : (() => {
  const p = graphPath.replace(/\.json$/, '.appname.txt');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '앱';
})();

const prescan = rd(flags.prescan, null) || {
  render: R.detectRenderMode(appRoot),
  helpers: R.indexHelpers(appRoot),
  gates: R.scanGates(appRoot, graph),
};
const audit = A.validateGraph(graph, appRoot, { snap: false });
const deleg = A.lintDelegation(graph, appRoot);
const st = audit.stat;
const verified = st.exact + st.near + st.resolved;
const located = st.unchecked + st.fileonly;

const outPath = (flags.out && flags.out !== true) ? flags.out : 'FLOW-HANDOFF.md';
const htmlRel = (flags.html && flags.html !== true) ? flags.html : null;

// ---------------------------------------------------------------- helpers
const ko = s => s.titleKo || s.title || s.route;
const actKo = a => a.actionKo || a.action;
const apiKo = t => (GAPI[t] && GAPI[t].ko) || t;
const mark = raw => {
  const v = audit.index[raw];
  if (!v) return '';
  if (['exact', 'near', 'resolved'].includes(v.status)) return '✔';
  if (['unchecked', 'fileonly'].includes(v.status)) return '·';
  if (v.status === 'weak') return '~';
  return '⚠';
};
const groups = [...new Set(graph.map(s => s.group))];
const groupKo = g => (graph.find(s => s.group === g && s.groupKo) || {}).groupKo || g;
const totalActions = graph.reduce((n, s) => n + (s.actions || []).length, 0);

const apiTags = new Map(); const aiMap = new Map(); const risk = {};
graph.forEach(s => (s.actions || []).forEach(a => {
  (a.apis || []).forEach(t => apiTags.set(t, (apiTags.get(t) || 0) + 1));
  if (a.ai && a.ai.purpose && !aiMap.has(a.ai.purpose)) aiMap.set(a.ai.purpose, a.ai);
  (a.risks || []).forEach(r => risk[r] = (risk[r] || 0) + 1);
}));
const RISK_KO = { network: '인터넷 필요', auth: '로그인 필요', ai: 'AI(가끔 틀림)', cost: '비용 발생',
  external: '외부 서비스 의존', gate: '기본 꺼짐/권한', weakpoint: '조용한 실패 위험', bug: '알려진 약점' };

// ---------------------------------------------------------------- build
const L = [];
const p = (...x) => L.push(...x);

p(`# ${appName} — 구조 핸드오프 (flow-debugger)`, '');
p(`> **새 세션은 이 파일 하나로 앱 구조를 파악한다.**`);
p(`> 여기 있는 모든 코드 좌표는 **실제 소스트리와 대조·검증**된 것이다(빌드 때 자동 생성).`);
p(`> 자동 생성: \`node scripts/make-handoff.js\` — 손으로 고치지 말고 재생성할 것.`, '');
p(`규모: **${graph.length}개 화면 · ${totalActions}개 동작 · 서버/데이터 ${apiTags.size}종 · AI ${aiMap.size}종**  `);
p(`코드 좌표 신뢰도: **✔ 함수까지 대조 ${verified}** · **· 파일·줄만 확인 ${located}** · ⚠ ${st.total - verified - located}`, '');

// paths in the wake-up block must be REPO-RELATIVE — the next session may not be on this machine
const relOut = (() => {
  const r = path.relative(path.resolve(appRoot), path.resolve(outPath)).replace(/\\/g, '/');
  return r.startsWith('..') ? path.basename(outPath) : r;
})();
p('## 0. 새 세션 시작하는 법 (그대로 붙여넣기)', '');
p('```bash');
p(`git pull origin main`);
p(`cat ${relOut}          # 이 파일 — 앱 구조 파악`);
if (htmlRel) p(`# 클릭해서 보는 흐름도(선택): ${htmlRel}`);
p('```', '');
p(`그리고 에이전트에게: **"\`${relOut}\` 읽고 구조 파악한 다음 이어서 작업해"**`, '');

// ---- the two mistakes
p('## 1. 이 앱에서 새 세션이 가장 많이 저지르는 실수 두 가지', '');
if (prescan.render) {
  p(`### ① 프로덕션이 렌더하지 않는 파일을 고친다`, '');
  p(`**\`${prescan.render.fn}()\`** (\`${prescan.render.file}\`) 가 어느 UI를 그릴지 고른다`
    + (prescan.render.routes ? ` — 라우트 파일 ${prescan.render.routes}개가 이걸로 갈라진다.` : '.'));
  p('');
  p(`**사용자가 보는 화면은 이 함수가 고르는 쪽이다.** 라우트 파일의 다른 본문은 프로덕션에서`);
  p(`렌더되지 않는다 — 거기를 고치면 **빌드는 초록인데 화면은 그대로**다.`);
  p(`아래 화면 표의 \`프로덕션 렌더 파일\` 열을 보고 그 파일을 고쳐라.`, '');
} else {
  p('### ① (렌더 위임 없음 — 라우트 파일이 화면을 직접 그린다)', '');
}
const gateList = Object.entries(prescan.gates || {});
p(`### ② 사용자가 열 수도 없는 화면의 "버그"를 고친다`, '');
if (!gateList.length) p('감지된 게이트 없음 — 모든 화면이 프로덕션에서 열린다.', '');
else {
  p(`아래 **${gateList.length}개 화면은 게이트 뒤에 있어** 일반 사용자가 못 연다.`);
  p(`여기서 발견한 문제는 **실제 사용자에게는 보이지 않는다.** 고치기 전에 그 사실부터 확인할 것.`, '');
  p('| 화면 | 게이트 | 근거 |', '|---|---|---|');
  gateList.forEach(([r, g]) => p(`| \`${r}\` | ${g.gate} | \`${g.evidence}\` |`));
  p('');
}
const aiHelpers = Object.entries(prescan.helpers || {}).filter(([, v]) => v.ai);
if (aiHelpers.length) {
  p('### ③ 겉보기와 다른 헬퍼 (화면 코드만 읽으면 절대 안 보인다)', '');
  p(`화면에 아래 함수 호출이 한 줄 있으면, 그 안에서 **AI를 부른다.** (총 ${aiHelpers.length}개)`, '');
  p('| 함수 | 위치 | 안에서 하는 일 |', '|---|---|---|');
  aiHelpers.slice(0, 24).forEach(([k, v]) =>
    p(`| \`${k}()\` | \`${v.file}\` | AI${v.apis.length ? ' + ' + v.apis.slice(0, 3).join(', ') : ''} |`));
  if (aiHelpers.length > 24) p(`| … | | 나머지 ${aiHelpers.length - 24}개 |`);
  p('');
}

if (stack) { p('## 2. 스택', '', stack, ''); }

// ---- screens
p('## 3. 화면 인벤토리', '');
groups.forEach(g => {
  const list = graph.filter(s => s.group === g);
  p(`### ${groupKo(g)}  \`${g}\`  (${list.length})`, '');
  p('| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |', '|---|---|---|---|---|');
  list.forEach(s => {
    const gt = (prescan.gates || {})[s.route];
    p(`| ${ko(s)} | \`${s.route}\` | ${(s.actions || []).length} | ${s.renders ? '`' + s.renders + '` ' + mark(s.renders) : '—'} | ${gt ? '🔒 ' + gt.gate : ''} |`);
  });
  p('');
});

// ---- nav graph
const NAV = [];
graph.forEach(s => (s.actions || []).forEach(a => { if (a.to && graph.some(x => x.route === a.to)) NAV.push([s, a, a.to]); }));
if (NAV.length) {
  p('## 4. 화면 이동 그래프', '', '```mermaid', 'flowchart LR');
  const id = new Map(); let i = 0;
  const mid = r => { if (!id.has(r)) id.set(r, 'S' + (++i)); return id.get(r); };
  const seen = new Set();
  NAV.forEach(([s, a, to]) => {
    const k = s.route + '>' + to; if (seen.has(k)) return; seen.add(k);
    const q = t => String(t).replace(/["|]/g, "'");
    const tScreen = graph.find(x => x.route === to);
    p(`  ${mid(s.route)}["${q(ko(s))}"] -->|${q(actKo(a))}| ${mid(to)}["${q(tScreen ? ko(tScreen) : to)}"]`);
  });
  p('```', '');
}

// ---- capabilities
p('## 5. 서버·데이터 작업', '');
const kinds = {};
[...apiTags.keys()].forEach(t => { const k = t.split(':')[0]; (kinds[k] = kinds[k] || []).push(t); });
Object.keys(kinds).sort().forEach(k => {
  p(`**${k}** (${kinds[k].length})  ` + kinds[k].map(t => `\`${t}\``).join(' · '), '');
});
if (aiMap.size) {
  p('## 6. AI 기능', '', '| 목적 | 모델 | 경유 | 쉬운 이름 |', '|---|---|---|---|');
  for (const [k, ai] of aiMap) p(`| \`${k}\` | ${ai.model || '—'} | ${ai.via || '—'} | ${(GAI[k] && GAI[k].ko) || ''} |`);
  p('');
}

// ---- verified anchors: the payload
p('## 7. 검증된 코드 좌표 (화면 → 동작 → file:line)', '');
p('마크: **✔** 파일·줄·**함수까지** 대조 완료 · **·** 파일·줄은 실재(대조할 함수명 없음) · **⚠** 못 믿음', '');
graph.forEach(s => {
  const acts = (s.actions || []).filter(a => a.file || a.impl);
  if (!acts.length) return;
  p(`<details><summary><b>${ko(s)}</b> <code>${s.route}</code> — 동작 ${acts.length}</summary>`, '');
  p('| 동작 | 코드 위치 | 실제 로직 | 의존 |', '|---|---|---|---|');
  acts.forEach(a => {
    const dep = [(a.apis || []).map(t => apiKo(t)).join(', '), a.ai ? 'AI:' + a.ai.purpose : ''].filter(Boolean).join(' / ');
    p(`| ${actKo(a)} | ${a.file ? '`' + a.file + '` ' + mark(a.file) : '—'} | ${a.impl ? '`' + a.impl + '` ' + mark(a.impl) : '—'} | ${dep || '—'} |`);
  });
  p('', '</details>', '');
});

// ---- risks
p('## 8. 위험 프로필', '');
Object.entries(risk).sort((a, b) => b[1] - a[1]).forEach(([r, n]) => p(`- **${RISK_KO[r] || r}** — ${n}개 동작`));
p('');

// ---- trust
p('## 9. 이 맵의 신뢰도', '');
p('| | 수 | 뜻 |', '|---|---|---|');
p(`| ✔ VERIFIED | ${verified} | 그 줄에 그 함수가 실제로 있음 |`);
p(`| · LOCATED | ${located} | 파일·줄은 실재. **대조할 함수명이 없어 그 줄이 맞는지는 확인 못 함** |`);
p(`| ~ CAUTION | ${st.weak} | 빈 줄 / import / 주석 / 맨 JSX 렌더 줄 |`);
p(`| ⚠ 못 믿음 | ${st.absent + st.prose + st.missing + st.ambiguous + st.range + st.outside + st.unparsable} | 대조 실패 |`);
p(`| 위임 트랩 | ${deleg.length} | 앵커가 가리키는 파일이 프로덕션에선 다른 걸 그림 |`);
p('');
if (deleg.length) {
  p('**위임 트랩 — 이 좌표를 고쳐도 화면은 안 바뀐다:**', '');
  deleg.slice(0, 10).forEach(d => p(`- \`${d.route}\` :: ${d.action} → \`${d.file}\` 는 프로덕션에서 \`<${d.delegatesTo}/>\` 를 렌더`));
  p('');
}

p('## 10. 이 맵 갱신하는 법', '');
p('앱을 고쳤으면 맵도 다시 만든다(안 그러면 이 파일이 거짓말을 시작한다):', '');
p('```bash');
p('# flow-debugger 스킬 폴더에서');
p(`node scripts/prescan.js "${path.resolve(appRoot)}" --graph <graph.json>`);
p(`node scripts/verify-anchors.js <graph.json> "${path.resolve(appRoot)}" --fix <graph.json> --strict`);
p(`node scripts/build.js assets/flow-debugger.template.html <graph.json> <glossary.json> <out.html> --app-root "${path.resolve(appRoot)}"`);
p(`node scripts/make-handoff.js <graph.json> "${path.resolve(appRoot)}" --out ${outPath.replace(/\\/g, '/')}`);
p('```', '');
p('앵커가 많이 틀어졌으면 그 화면만 **RESCAN** 한다 — `references/scan-prompts.md` "RESCAN / PATCH".', '');

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, L.join('\n') + '\n', 'utf8');

const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log('handoff -> ' + outPath + '  (' + kb + ' KB)');
console.log('  screens ' + graph.length + ' · actions ' + totalActions +
            ' · anchors ✔' + verified + ' ·' + located + ' ~' + st.weak +
            ' · gates ' + Object.keys(prescan.gates || {}).length + ' · delegation traps ' + deleg.length);
console.log('\nNEXT: commit it to the app repo and MERGE — a handoff that lives on one machine is not a handoff.');
