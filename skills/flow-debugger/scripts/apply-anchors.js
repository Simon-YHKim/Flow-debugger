// flow-debugger: apply anchor-correction patches onto a base screenmap.
//
// A patch is a compact per-screen object produced by the framework-aware RESCAN
// (references/scan-prompts.md -> "RESCAN / PATCH"):
//   {route, stack?, screenRenders?, actions:[{action, feature?, file?, impl?, renders?}]}
// keyed to the base by `route` and, within a screen, by the `action` string.
// Patches only carry code anchors; every other base field (Korean enrichment,
// risks/checklist/failureModes, glossary tags, `to`, ...) is preserved verbatim.
//
// DETERMINISTIC GUARD (scripts/lib/anchors.js): every path:line is parsed, kept inside
// the app root, checked to exist, checked to be in range, and — when the action names a
// real identifier (`feature`) — checked to actually point AT that symbol. Drifted lines
// are snapped to the symbol; anything that fails is DROPPED, never applied.
// An empty field beats a wrong one: a bad anchor makes a coding agent "fix" a file
// production never renders, the build goes green, and the screen does not change.
//
// usage:
//   node apply-anchors.js <base.json> <patchDir> <appRoot> <out.json> [--no-snap]
//     <patchDir>  dir holding patch-*.json (each a JSON array, optionally fenced)
//     <appRoot>   root the anchor paths are relative to (e.g. E:/2ndB)
//
// Side effect: if any patch carries a `stack` line, it is written to
// "<out>.stack.txt" so build.js picks it up automatically. (It used to be printed
// to the console and thrown away, so every exported prompt shipped without [앱 스택].)
const fs = require('fs');
const path = require('path');
const A = require('./lib/anchors');

const argv = process.argv.slice(2);
const snap = !argv.includes('--no-snap');
const a = argv.filter(x => !x.startsWith('--'));
if (a.length < 4) {
  console.error('usage: node apply-anchors.js <base.json> <patchDir> <appRoot> <out.json> [--no-snap]');
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

// --- action key matching -------------------------------------------------------
// The patch is keyed by the action STRING. A re-scan that rephrases one word ("Sign in"
// -> "Sign In") used to silently drop that action's anchors. Match in three passes:
// exact -> normalized (case/space/punctuation-insensitive) -> feature name.
const norm = s => String(s || '').toLowerCase().replace(/[\s_\-·．.,!?()[\]"'`]+/g, '');

const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const byRoute = new Map(base.map(s => [s.route, s]));

const patchFiles = fs.readdirSync(patchDir).filter(f => /^patch-.*\.json$/.test(f)).sort();
const stats = {
  patchFiles: patchFiles.length, patchFail: [],
  screensSeen: 0, screensMatched: 0, screensUnmatched: [],
  actionsSeen: 0, actionsMatched: 0, actionsUnmatched: [],
  matchExact: 0, matchNorm: 0, matchFeature: 0,
  fileSet: 0, implSet: 0, rendersSet: 0, screenRendersSet: 0,
  snapped: [], dropped: [],
};
const stacks = new Set();

function applyAnchor(target, key, raw, ctx, symbol) {
  if (raw == null || raw === '') return false;              // absent -> no-op
  const v = A.validateAnchor(raw, appRoot, { symbol, snap });
  if (!v.ok) { stats.dropped.push(`[${v.reason}] ${ctx} .${key} = ${raw}`); return false; }
  if (v.snapped) stats.snapped.push(`${ctx} .${key}  ${raw} -> ${v.value}`);
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
    if (applyAnchor(bs, 'renders', ps.screenRenders, ps.route, null)) stats.screenRendersSet++;

    const byAction = new Map(), byNorm = new Map(), byFeature = new Map();
    for (const ba of (bs.actions || [])) {
      byAction.set(ba.action, ba);
      if (!byNorm.has(norm(ba.action))) byNorm.set(norm(ba.action), ba);
      if (ba.feature && !byFeature.has(ba.feature)) byFeature.set(ba.feature, ba);
    }
    for (const pa of (ps.actions || [])) {
      stats.actionsSeen++;
      let ba = byAction.get(pa.action);
      if (ba) stats.matchExact++;
      if (!ba) { ba = byNorm.get(norm(pa.action)); if (ba) stats.matchNorm++; }
      if (!ba && pa.feature) { ba = byFeature.get(pa.feature); if (ba) stats.matchFeature++; }
      if (!ba) { stats.actionsUnmatched.push(`${ps.route} :: ${pa.action}`); continue; }
      stats.actionsMatched++;
      const ctx = `${ps.route} :: ${ba.action}`;
      const sym = pa.feature || ba.feature;
      if (applyAnchor(ba, 'file', pa.file, ctx, sym)) stats.fileSet++;
      if (applyAnchor(ba, 'impl', pa.impl, ctx, sym)) stats.implSet++;
      if (applyAnchor(ba, 'renders', pa.renders, ctx, null)) stats.rendersSet++;
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(base, null, 2), 'utf8');

// The app-level stack line is what gives a coding agent the framework + render
// mechanism before it touches anything. Persist it next to the graph so build.js
// finds it — printing it was a dead end.
if (stacks.size) {
  const stackPath = outPath.replace(/\.json$/, '') + '.stack.txt';
  fs.writeFileSync(stackPath, [...stacks].join(' ') + '\n', 'utf8');
  console.log('stack note -> ' + stackPath + '  (' + stacks.size + ' source' + (stacks.size > 1 ? 's, merged' : '') + ')');
}

// --- report -------------------------------------------------------------------
console.log('patch files:', stats.patchFiles, stats.patchFail.length ? '(FAILED: ' + stats.patchFail.join(',') + ')' : '(all parsed)');
console.log('screens:', stats.screensMatched + '/' + stats.screensSeen, 'matched',
  stats.screensUnmatched.length ? '| unmatched routes: ' + stats.screensUnmatched.join(', ') : '');
console.log('actions:', stats.actionsMatched + '/' + stats.actionsSeen, 'matched',
  `(exact ${stats.matchExact} · normalized ${stats.matchNorm} · by-feature ${stats.matchFeature})`,
  stats.actionsUnmatched.length ? '| ' + stats.actionsUnmatched.length + ' unmatched' : '');
console.log('anchors set  -> file:', stats.fileSet, '| impl:', stats.implSet,
  '| action.renders:', stats.rendersSet, '| screen.renders:', stats.screenRendersSet);
console.log('anchors SNAPPED to the real symbol line:', stats.snapped.length);
if (stats.snapped.length) console.log('  ' + stats.snapped.slice(0, 20).join('\n  '));
console.log('anchors DROPPED (invalid path/line/outside root):', stats.dropped.length);
if (stats.dropped.length) console.log('  ' + stats.dropped.slice(0, 40).join('\n  '));
if (stats.actionsUnmatched.length) {
  console.log('UNMATCHED ACTIONS (first 30):');
  console.log('  ' + stats.actionsUnmatched.slice(0, 30).join('\n  '));
}
console.log('wrote', outPath);
console.log('next: node verify-anchors.js ' + outPath + ' ' + appRoot + ' --strict');
