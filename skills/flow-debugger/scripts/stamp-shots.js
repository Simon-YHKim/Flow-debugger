#!/usr/bin/env node
// flow-debugger: overlay freshly-captured thumbnails INTO a built flow-debugger.html — refreshing
// only the routes you re-shot, preserving every other embedded thumbnail. This is what lets CI
// re-shoot the screens a PR changed and commit the picture back, without a full rebuild.
//
// usage:
//   node stamp-shots.js <flow-debugger.html> <shots-map.json>  [--png|--jpeg]
//     shots-map.json = { "/route": "path/to/shot.png", ... }  (capture-shots.js writes exactly this)
//   paths in the map are resolved relative to the map file.
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (const v of argv) { if (v.startsWith('--')) flags[v.slice(2)] = true; else pos.push(v); }
if (pos.length < 2) { console.error('usage: node stamp-shots.js <flow-debugger.html> <shots-map.json>'); process.exit(2); }
const [htmlPath, mapPath] = pos;

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const mapDir = path.dirname(path.resolve(mapPath));

let html = fs.readFileSync(htmlPath, 'utf8');
const marker = 'const SHOTS = (';
const i = html.indexOf(marker);
if (i < 0) { console.error('SHOTS constant not found — is this a built flow-debugger.html?'); process.exit(2); }
const start = i + marker.length;
const end = html.indexOf(')||{}', start);
if (end < 0) { console.error('SHOTS terminator ")||{}" not found.'); process.exit(2); }

const shots = JSON.parse(html.slice(start, end));   // route -> dataURI (current)
const before = Object.keys(shots).length;

let n = 0;
for (const [route, p] of Object.entries(map)) {
  const fp = path.isAbsolute(p) ? p : path.join(mapDir, p);
  if (!fs.existsSync(fp)) { console.error('missing image, skipped: ' + fp); continue; }
  const buf = fs.readFileSync(fp);
  const ext = (path.extname(fp).slice(1) || 'png').toLowerCase();
  shots[route] = 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + buf.toString('base64');
  n++;
}

html = html.slice(0, start) + JSON.stringify(shots) + html.slice(end);
fs.writeFileSync(htmlPath, html);
console.log('overlaid ' + n + ' fresh thumbnail(s); SHOTS routes ' + before + ' -> ' + Object.keys(shots).length);
