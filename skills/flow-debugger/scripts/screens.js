#!/usr/bin/env node
// flow-debugger: audit EVERY screen's identity — the one a user actually reaches.
//
// Answers, for all screens at once, the question the login confusion raised: which file does this
// screen REALLY render from, does its URL delegate there, which other screens share that file, and
// can a user even reach it? So you never again edit a legacy body the app doesn't render.
//
// usage: node screens.js <graph.json|flow-map.json> [--json out.json]
const fs = require('fs');
const { identities } = require('./lib/screens-identity');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) { const v = argv[i]; if (v.startsWith('--')) flags[v.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; else pos.push(v); }
if (!pos[0]) { console.error('usage: node screens.js <graph.json|flow-map.json> [--json out.json]'); process.exit(2); }

const raw = JSON.parse(fs.readFileSync(pos[0], 'utf8'));
const screens = Array.isArray(raw) ? raw : (raw.screens || []);
const ids = identities(screens);
if (flags.json && flags.json !== true) fs.writeFileSync(flags.json, JSON.stringify(ids, null, 2), 'utf8');

const short = f => (f ? f.replace(/^src\//, '') : '(?)');
const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);

console.log('화면 신원 — 각 화면이 실제로 그리는(사용자가 보는) 파일\n');
console.log(pad('route', 22) + pad('실제 렌더 (사용자가 보는 화면)', 42) + '표시');
console.log('─'.repeat(72));
for (const r of ids.sort((a, b) => a.route.localeCompare(b.route))) {
  const marks = (r.delegates ? '🔀' : '  ') + (r.sharesWith.length ? '📎' + (r.sharesWith.length + 1) : '  ')
    + (r.reach !== 'ok' ? ' ⛔' : '') + (!r.real ? ' ⚠' : '');
  console.log(pad(r.route, 22) + pad(short(r.real), 42) + marks);
}

const deleg = ids.filter(x => x.delegates), shared = ids.filter(x => x.sharesWith.length);
const hidden = ids.filter(x => x.reach !== 'ok'), noreal = ids.filter(x => !x.real);
console.log('\n🔀 위임 ' + deleg.length + ' (주소는 src/app, 실제 렌더는 딴 파일) · 📎 파일 공유 ' + shared.length
  + ' · ⛔ 사용자 도달 불가 ' + hidden.length + ' · ⚠ 실제 렌더 불명 ' + noreal.length);

// The shared files, grouped — so you see "these N screens live in one file" at a glance.
const byFile = {};
for (const r of ids) if (r.realFile && r.sharesWith.length) (byFile[r.realFile] = byFile[r.realFile] || []).push(r);
const groups = Object.entries(byFile).sort((a, b) => b[1].length - a[1].length);
if (groups.length) {
  console.log('\n한 파일에 여러 화면 (이 파일을 고치면 아래 화면들이 함께 영향):');
  for (const [f, rs] of groups) {
    console.log('  ' + short(f) + '  (' + rs.length + '화면)');
    for (const r of rs.sort((a, b) => (a.rangeStart || 0) - (b.rangeStart || 0))) {
      console.log('     줄 ' + pad((r.rangeStart || '?') + '~' + (r.rangeEnd === Infinity ? '끝' : (r.rangeEnd || '?')), 12) + r.route + '  ' + r.title);
    }
  }
}
if (hidden.length) console.log('\n⛔ 사용자가 접할 수 없는 화면 (개발/관리자 전용): ' + hidden.map(x => x.route).join(', '));
if (noreal.length) console.log('⚠ 실제 렌더 파일을 못 찾은 화면 (재스캔 권장): ' + noreal.map(x => x.route).join(', '));
