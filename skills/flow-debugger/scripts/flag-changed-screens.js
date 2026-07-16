#!/usr/bin/env node
// flow-debugger: which SCREENS changed since the map/picture was made — and show it ON the chart.
//
// The map ships a fingerprint (sha of every anchored file at build time). This recomputes those
// hashes against the working tree, maps each changed file back to the screen(s) it backs, and
// writes a STALE constant the flow-debugger HTML reads to badge those cards ("⚠ 바뀜"). So a
// non-developer opening the chart SEES which screens no longer match their picture — without
// running anything or reading a CI log.
//
// usage:
//   node flag-changed-screens.js <graph.json|flow-map.json> <appRoot> [--stamp <html>] [--quiet]
//     --stamp <html>   splice/inject the STALE constant into a built flow-debugger.html
//   (no --stamp)       just print which screens changed
//
// The hash MUST match the one the fingerprint shipped with (see lib/fingerprint / check-flow-map-fresh):
//   sha256(content, CRLF-normalised) -> first 16 hex.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const v = argv[i];
  if (v.startsWith('--')) { const k = v.slice(2); flags[k] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; }
  else pos.push(v);
}
if (pos.length < 2) { console.error('usage: node flag-changed-screens.js <graph.json> <appRoot> [--stamp <html>]'); process.exit(2); }
const [graphPath, appRoot] = pos;

const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const fileOf = a => String(a || '').split(':')[0].replace(/\\/g, '/').trim();

// fingerprint lives beside the graph
const fpPath = graphPath.replace(/\.json$/, '') + '.fingerprint.json';
if (!fs.existsSync(fpPath)) { console.error('NO FINGERPRINT: ' + fpPath + ' — build the map first (build.js writes it).'); process.exit(2); }
const fp = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
const files = (fp && fp.files) || {};

// what changed / went away under the map
const changed = new Set(), gone = new Set();
for (const [rel, was] of Object.entries(files)) {
  let now;
  try { now = sha(fs.readFileSync(path.join(appRoot, rel), 'utf8').replace(/\r\n/g, '\n')); }
  catch (e) { gone.add(rel.replace(/\\/g, '/')); continue; }
  if (now !== was) changed.add(rel.replace(/\\/g, '/'));
}

// map changed/gone files -> screens
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const screens = Array.isArray(graph) ? graph : (graph.screens || []);
const STALE = {};
for (const s of screens) {
  const r = s.route; if (!r) continue;
  const anchorFiles = [s.rendersInProduction, s.renders]
    .concat((s.actions || []).flatMap(a => [a.file, a.impl]))
    .map(fileOf).filter(Boolean);
  const hit = [...new Set(anchorFiles.filter(f => changed.has(f) || gone.has(f)))];
  if (hit.length) STALE[r] = { files: hit, kind: gone.size && hit.some(f => gone.has(f)) ? 'gone' : 'code' };
}

const nStale = Object.keys(STALE).length;
if (!flags.quiet) {
  if (!changed.size && !gone.size) console.log('FRESH — 앵커한 ' + Object.keys(files).length + '개 파일이 지도 그대로. 바뀐 화면 없음.');
  else {
    console.log('CHANGED FILES: ' + changed.size + ' · GONE: ' + gone.size);
    console.log('STALE SCREENS (' + nStale + '): ' + Object.keys(STALE).slice(0, 30).join(' ') + (nStale > 30 ? ' …' : ''));
  }
}

// stamp the built HTML so the chart badges these screens
if (flags.stamp && flags.stamp !== true) {
  const htmlPath = String(flags.stamp);
  let html = fs.readFileSync(htmlPath, 'utf8');
  const json = JSON.stringify(STALE);
  const marker = 'const STALE = (';
  const i = html.indexOf(marker);
  if (i >= 0) {
    // built from a STALE-aware template: replace the object between "const STALE = (" and ")||{}"
    const start = i + marker.length;
    const end = html.indexOf(')||{}', start);
    if (end < 0) { console.error('STALE marker found but ")||{}" terminator missing — is this a built flow-debugger.html?'); process.exit(2); }
    html = html.slice(0, start) + json + html.slice(end);
  } else {
    // older HTML built before this feature: inject the constant right after the SHOTS declaration.
    const sm = 'const SHOTS = (';
    const si = html.indexOf(sm);
    if (si < 0) { console.error('neither STALE nor SHOTS constant found — cannot stamp this file.'); process.exit(2); }
    const send = html.indexOf(')||{}', si + sm.length);
    if (send < 0) { console.error('SHOTS terminator ")||{}" not found.'); process.exit(2); }
    const at = send + ')||{}'.length + 1; // just past "const SHOTS = (...)||{};"
    html = html.slice(0, at) + '\nconst STALE = (' + json + ')||{};' + html.slice(at);
    console.log('note: injected STALE constant into a pre-feature HTML. For badges to RENDER, the page also needs the STALE-aware card code — rebuild with /flow, or this file was patched separately.');
  }
  fs.writeFileSync(htmlPath, html);
  console.log('stamped ' + nStale + ' stale screen(s) into ' + htmlPath);
}

process.exit(0);
