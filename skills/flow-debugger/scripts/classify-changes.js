#!/usr/bin/env node
// flow-debugger: after the code changes, WHICH screens just drifted (cheap rebase) and WHICH likely
// changed structure (need a real re-scan)? This is what /flow-update reads before asking the human
// what to do — so nobody blindly rebases a screen that actually grew a new button.
//
// usage: node classify-changes.js <graph.json> <appRoot> [--json <out.json>]
const fs = require('fs');
const { classifyChanges } = require('./lib/classify-change');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) { const v = argv[i]; if (v.startsWith('--')) flags[v.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; else pos.push(v); }
const [graphPath, appRoot] = pos;
if (!graphPath || !appRoot) { console.error('usage: node classify-changes.js <graph.json> <appRoot> [--json out.json]'); process.exit(2); }

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const fingerprintPath = graphPath.replace(/\.json$/, '.fingerprint.json');
let r;
try { r = classifyChanges(graph, appRoot, { fingerprintPath }); }
catch (e) { console.error(String(e.message)); process.exit(2); }

if (flags.json && flags.json !== true) fs.writeFileSync(flags.json, JSON.stringify(r, null, 2), 'utf8');

if (r.fresh) {
  console.log('FRESH — 지도가 만들어진 뒤 앵커한 파일이 하나도 안 바뀌었어요. 할 일 없음.');
  process.exit(0);
}

const routes = arr => [...new Set(arr.flatMap(x => x.routes))].join(', ');
console.log(`지도 기준 커밋: ${r.builtFrom}`);
console.log(`바뀐 화면 분류 — 좌표만 밀림 ${r.counts.drift} · 구조 바뀜(재스캔 권장) ${r.counts.rescan} · 화면 삭제 ${r.counts.deleted}\n`);

if (r.rescan.length) {
  console.log('■ 구조가 바뀐 것 같아요 — 이 화면들은 다시 스캔하세요 (새 버튼·이동·서버호출은 좌표 이사로는 못 잡아요):');
  for (const x of r.rescan) console.log(`   · ${x.routes.join(', ')}  [${x.file}]\n       근거: ${x.why.join(' / ')}`);
  console.log('');
}
if (r.drift.length) {
  console.log('■ 좌표만 밀렸어요 — 재스캔 없이 자동으로 옮기면 됩니다 (rebase):');
  for (const x of r.drift) console.log(`   · ${x.routes.join(', ')}  [${x.file}]`);
  console.log('');
}
if (r.deleted.length) {
  console.log('■ 앵커한 파일이 사라졌어요 — 이 화면들은 지도에서 빼야 할 수 있어요:');
  for (const x of r.deleted) console.log(`   · ${x.routes.join(', ')}  [${x.file}]`);
  console.log('');
}

console.log('다음: /flow-update 가 이 분류를 사람에게 보여주고 "재스캔할까 / 좌표만 옮길까"를 물어본 뒤 진행합니다.');
process.exit(r.rescan.length ? 1 : 0);   // exit 1 when a re-scan is recommended, so CI/callers notice
