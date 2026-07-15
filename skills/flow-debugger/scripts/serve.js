#!/usr/bin/env node
// flow-watch: serve the flow-debugger over localhost so the page can DETECT code changes.
//
// A file:// page is sandboxed — it can never read your source tree, so refreshing it just re-renders
// the same baked-in snapshot. Served from a tiny Node process (which CAN read the fs), the page asks
// /status on load / focus / file-change and shows a banner when the map has drifted, using the SAME
// classifier /flow-update uses. This is DETECTION ONLY — it tells you what moved (coordinates vs
// structure); the actual update stays the deliberate, human-gated /flow-update. No dependencies:
// Node http + fs only, so it stays as portable as the rest of the plugin.
//
// usage: node serve.js <flow-debugger.html> <graph.json> <appRoot> [--port 8848]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { classifyChanges } = require('./lib/classify-change');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) { const v = argv[i]; if (v.startsWith('--')) flags[v.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; else pos.push(v); }
const [htmlPath, graphPath, appRoot] = pos;
if (!htmlPath || !graphPath || !appRoot) {
  console.error('usage: node serve.js <flow-debugger.html> <graph.json> <appRoot> [--port 8848]');
  process.exit(2);
}
const port = parseInt(flags.port, 10) || 8848;
const fingerprintPath = graphPath.replace(/\.json$/, '.fingerprint.json');

function status() {
  try {
    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    return classifyChanges(graph, appRoot, { fingerprintPath });
  } catch (e) { return { error: String(e.message) }; }
}

// The files the map anchors into — the only files whose change can drift the map. Watch exactly
// those (from the fingerprint) so we notice a code edit without polling the whole tree.
function anchoredFiles() {
  try { return Object.keys(JSON.parse(fs.readFileSync(fingerprintPath, 'utf8')).files || {}); }
  catch (e) { return []; }
}

const sseClients = new Set();
let watchTimer = null;
function pingChanged() {
  if (watchTimer) return;                       // debounce a burst of saves into one event
  watchTimer = setTimeout(() => {
    watchTimer = null;
    for (const res of sseClients) { try { res.write('event: changed\ndata: {}\n\n'); } catch (e) { /* client gone */ } }
  }, 300);
}
for (const rel of anchoredFiles()) {
  try { fs.watch(path.join(appRoot, rel), { persistent: false }, pingChanged); } catch (e) { /* file may be gone; ignore */ }
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(status()));
    return;
  }
  if (url === '/events') {                       // Server-Sent Events: push when an anchored file changes
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write('retry: 2000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  // everything else → the HTML (always re-read from disk so a rebuild shows on refresh)
  fs.readFile(htmlPath, (e, buf) => {
    if (e) { res.writeHead(404); res.end('flow-debugger.html not found: ' + htmlPath); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.error(`포트 ${port} 가 이미 쓰이고 있어요. --port <다른번호> 로 다시 실행하세요.`); process.exit(1); }
  throw e;
});
server.listen(port, () => {
  const s = status();
  console.log(`flow-watch  →  http://localhost:${port}`);
  console.log(`  지도: ${path.basename(graphPath)}  ·  앱: ${appRoot}  ·  앵커한 파일 ${anchoredFiles().length}개 감시 중`);
  if (s.error) console.log(`  (지문 없음/오류: ${s.error} — /flow 로 먼저 빌드하면 상태 배너가 켜집니다)`);
  else console.log(s.fresh ? '  현재: FRESH (코드가 지도와 일치)' : `  현재: 코드 바뀜 — 좌표만 밀림 ${s.counts.drift} · 구조 바뀜 ${s.counts.rescan} · 삭제 ${s.counts.deleted}`);
  console.log('  브라우저에서 위 주소를 열면, 코드가 바뀔 때마다 상단 배너로 알려줘요. 갱신은 /flow-update. (Ctrl+C 로 종료)');
});
