// flow-debugger: apply anchor-correction patches onto a base screenmap.
//
// A patch is a compact per-screen object produced by a framework-aware re-scan:
//   {route, stack?, screenRenders?, actions:[{action, file?, impl?, renders?}]}
// keyed to the base by `route` and, within a screen, by the EXACT `action` string.
// Patches only carry code anchors; every other base field (Korean enrichment,
// risks/checklist/failureModes, glossary tags, `to`, ...) is preserved verbatim.
//
// DETERMINISTIC GUARD: every path:line an agent emits is validated against the
// real source tree (file exists AND line is in range). Anchors that fail are
// DROPPED, never applied ("an empty field beats a wrong one"). This is the safety
// net against a fan-out that shares a wrong premise or hallucinates a path.
//
// usage:
//   node apply-anchors.js <base.json> <patchDir> <appRoot> <out.json>
//     <patchDir>  dir holding patch-*.json (each a JSON array, optionally fenced)
//     <appRoot>   root the anchor paths are relative to (e.g. E:/2ndB)
const fs = require('fs');
const path = require('path');

const a = process.argv.slice(2);
if (a.length < 4) {
  console.error('usage: node apply-anchors.js <base.json> <patchDir> <appRoot> <out.json>');
  process.exit(2);
}
const [basePath, patchDir, appRoot, outPath] = a;

// --- robust JSON-array extraction (mirrors merge-readers.js) ------------------
function extractArray(t) {
  if (Array.isArray(t)) return t;
  if (typeof t !== 'string') return null;
  const m = t.match(/```json\s*([\s\S]*?)```/i) || t.match(/```\s*([\s\S]*?)```/);
  let c = m ? m[1] : null;
  if (!c) { const i = t.indexOf('['), j = t.lastIndexOf(']'); if (i >= 0 && j > i) c = t.slice(i, j + 1); }
  if (!c) return null;
  try { return JSON.parse(c); }
  catch (e) {
    const i = c.indexOf('['), j = c.lastIndexOf(']');
    try { return JSON.parse(c.slice(i, j + 1)); } catch (e2) { return null; }
  }
}

// --- anchor validation: "<relpath>:<line>[ (note)]" exists in appRoot ---------
const lineCountCache = new Map();
function fileLineCount(rel) {
  if (lineCountCache.has(rel)) return lineCountCache.get(rel);
  const abs = path.join(appRoot, rel);
  let n = -1;
  try { if (fs.existsSync(abs)) n = fs.readFileSync(abs, 'utf8').split('\n').length; } catch (e) { n = -1; }
  lineCountCache.set(rel, n);
  return n;
}
// returns cleaned "relpath:line" if valid, else null
function validAnchor(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^\s*([^\s:][^:]*?):(\d+)/);   // first path:line token
  if (!m) return null;
  let rel = m[1].trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const line = parseInt(m[2], 10);
  const lc = fileLineCount(rel);
  if (lc < 0) return { ok: false, reason: 'missing', rel };
  if (line < 1 || line > lc) return { ok: false, reason: 'line', rel, line, lc };
  return { ok: true, value: rel + ':' + line };
}

// --- load base + patches ------------------------------------------------------
const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const byRoute = new Map(base.map(s => [s.route, s]));

const patchFiles = fs.readdirSync(patchDir).filter(f => /^patch-.*\.json$/.test(f)).sort();
const stats = {
  patchFiles: patchFiles.length, patchFail: [],
  screensSeen: 0, screensMatched: 0, screensUnmatched: [],
  actionsSeen: 0, actionsMatched: 0, actionsUnmatched: [],
  fileSet: 0, implSet: 0, rendersSet: 0, screenRendersSet: 0,
  dropped: [],
};
const stacks = new Set();

function applyAnchor(target, key, raw) {
  const v = validAnchor(raw);
  if (!v) return false;            // absent / non-string -> no-op
  if (!v.ok) { stats.dropped.push(`${v.reason}:${raw}`); return false; }
  target[key] = v.value;
  return true;
}

for (const pf of patchFiles) {
  const group = pf.replace(/^patch-|\.json$/g, '');
  const arr = extractArray(fs.readFileSync(path.join(patchDir, pf), 'utf8'));
  if (!Array.isArray(arr)) { stats.patchFail.push(group); continue; }
  for (const ps of arr) {
    stats.screensSeen++;
    if (ps.stack) stacks.add(String(ps.stack).trim());
    const bs = byRoute.get(ps.route);
    if (!bs) { stats.screensUnmatched.push(ps.route); continue; }
    stats.screensMatched++;
    if (applyAnchor(bs, 'renders', ps.screenRenders)) stats.screenRendersSet++;
    // index base actions by exact string, with feature as fallback
    const byAction = new Map();
    const byFeature = new Map();
    for (const ba of (bs.actions || [])) {
      byAction.set(ba.action, ba);
      if (ba.feature && !byFeature.has(ba.feature)) byFeature.set(ba.feature, ba);
    }
    for (const pa of (ps.actions || [])) {
      stats.actionsSeen++;
      const ba = byAction.get(pa.action) || byFeature.get(pa.feature);
      if (!ba) { stats.actionsUnmatched.push(`${ps.route} :: ${pa.action}`); continue; }
      stats.actionsMatched++;
      if (applyAnchor(ba, 'file', pa.file)) stats.fileSet++;
      if (applyAnchor(ba, 'impl', pa.impl)) stats.implSet++;
      if (applyAnchor(ba, 'renders', pa.renders)) stats.rendersSet++;
    }
  }
}

// app-level stack note (dedup) -> attach to output as a sidecar field on nothing;
// stored in stats for the caller to surface. Keep base array shape unchanged.
fs.writeFileSync(outPath, JSON.stringify(base, null, 2), 'utf8');

// --- report -------------------------------------------------------------------
console.log('patch files:', stats.patchFiles, stats.patchFail.length ? '(FAILED: ' + stats.patchFail.join(',') + ')' : '(all parsed)');
console.log('screens:', stats.screensMatched + '/' + stats.screensSeen, 'matched',
  stats.screensUnmatched.length ? '| unmatched routes: ' + stats.screensUnmatched.join(', ') : '');
console.log('actions:', stats.actionsMatched + '/' + stats.actionsSeen, 'matched',
  stats.actionsUnmatched.length ? '| ' + stats.actionsUnmatched.length + ' unmatched' : '');
console.log('anchors set  -> file:', stats.fileSet, '| impl:', stats.implSet,
  '| action.renders:', stats.rendersSet, '| screen.renders:', stats.screenRendersSet);
console.log('anchors DROPPED (invalid path/line):', stats.dropped.length);
if (stats.dropped.length) console.log('  ' + stats.dropped.slice(0, 40).join('\n  '));
if (stats.actionsUnmatched.length) {
  console.log('UNMATCHED ACTIONS (first 30):');
  console.log('  ' + stats.actionsUnmatched.slice(0, 30).join('\n  '));
}
console.log('STACK NOTES (' + stacks.size + '):');
for (const s of stacks) console.log('  - ' + s);
console.log('wrote', outPath);
