// flow-debugger: merge fan-out reader outputs into one screen array.
// Accepts a workflow result file: either a top-level array of {text} entries,
// or an object {result:[{text}, ...]}. Each text holds a JSON array (optionally
// fenced). usage: node merge-readers.js <workflow-output.json> <out.json> [--allow-partial]
//
// It also SHAPE-CHECKS what the readers returned, because everything downstream
// (Korean labels, risk markers, the bug report's file:line) is built on this array and a
// reader that quietly returned prose, or an `ai` as a bare string, used to sail through
// the whole pipeline: merge exit 0, build "JS OK", and a map with blank AI cards and an
// empty-state that blames the user's group filter.
const fs = require('fs');
const argv = process.argv.slice(2);
const allowPartial = argv.includes('--allow-partial');
const a = argv.filter(x => !x.startsWith('--'));
if (a.length < 2) { console.error('usage: node merge-readers.js <workflow-output.json> <out.json> [--allow-partial]'); process.exit(2); }

const obj = JSON.parse(fs.readFileSync(a[0], 'utf8'));
const readers = Array.isArray(obj) ? obj : (obj.result || []);

function extract(t) {
  if (Array.isArray(t)) return t;
  if (typeof t !== 'string') return null;
  let m = t.match(/```json\s*([\s\S]*?)```/i) || t.match(/```\s*([\s\S]*?)```/);
  let c = m ? m[1] : null;
  if (!c) { const i = t.indexOf('['), j = t.lastIndexOf(']'); if (i >= 0 && j > i) c = t.slice(i, j + 1); }
  if (!c) return null;
  try { return JSON.parse(c); }
  catch (e) {
    const i = c.indexOf('['), j = c.lastIndexOf(']');
    try { return JSON.parse(c.slice(i, j + 1)); } catch (e2) { return null; }
  }
}

let screens = [];
const report = [], failed = [];
for (const r of readers) {
  const t = (r && r.text !== undefined) ? r.text : r;
  const arr = extract(t);
  const g = (r && r.group) ? r.group : '?';
  if (Array.isArray(arr)) { screens = screens.concat(arr); report.push(g + ':' + arr.length); }
  else { report.push(g + ':FAIL'); failed.push(g); }
}

// --- shape check ---------------------------------------------------------------
const problems = [], warn = [];
const seen = new Map();
screens.forEach((s, i) => {
  if (!s || typeof s !== 'object' || Array.isArray(s)) { problems.push(`#${i}: not a screen object`); return; }
  if (!s.route) problems.push(`#${i}: no "route" (the primary key — the node cannot be built)`);
  if (s.route && seen.has(s.route)) problems.push(`duplicate route "${s.route}" (#${seen.get(s.route)} and #${i})`);
  if (s.route) seen.set(s.route, i);
  if (!s.group) warn.push(`${s.route || '#' + i}: no "group" (it will land in one unnamed column)`);
  if (!Array.isArray(s.actions)) { warn.push(`${s.route || '#' + i}: no "actions" array`); return; }
  s.actions.forEach(act => {
    if (!act || typeof act !== 'object') { problems.push(`${s.route}: an action is not an object`); return; }
    if (!act.action) problems.push(`${s.route}: an action has no "action" label`);
    if (act.apis != null && !Array.isArray(act.apis)) problems.push(`${s.route} :: ${act.action}: "apis" must be an array`);
    // the single most common silent corruption: ai as a bare string. The SCAN example
    // only ever showed `"ai":null`, so a reader guesses `"ai":"capture_classify"`, the
    // node id becomes ai:undefined, and a blank AI card ships.
    if (act.ai != null && typeof act.ai !== 'object')
      problems.push(`${s.route} :: ${act.action}: "ai" must be {purpose,model,via} or null — got ${JSON.stringify(act.ai)}`);
    if (act.ai && typeof act.ai === 'object' && !act.ai.purpose)
      problems.push(`${s.route} :: ${act.action}: "ai" has no "purpose"`);
  });
});

console.log(report.join(' | '));
if (warn.length) {
  console.warn('warnings (' + warn.length + '):');
  warn.slice(0, 15).forEach(w => console.warn('  · ' + w));
}
if (problems.length) {
  console.error('SCHEMA PROBLEMS (' + problems.length + '):');
  problems.slice(0, 25).forEach(p => console.error('  ! ' + p));
  console.error('fix the reader output and re-run — these corrupt the map silently downstream.');
  process.exit(1);
}
if (failed.length && !allowPartial) {
  console.error('READER(S) FAILED to return JSON: ' + failed.join(', '));
  console.error('the merged map would be missing those screens. Re-run them, or pass --allow-partial.');
  process.exit(1);
}
if (!screens.length) {
  console.error('merged 0 screens — nothing to build. (An empty map opens as "no screens", which reads like a filter problem.)');
  process.exit(1);
}

fs.writeFileSync(a[1], JSON.stringify(screens, null, 2), 'utf8');
console.log('merged ' + screens.length + ' screens, ' +
  screens.reduce((n, s) => n + ((s.actions || []).length), 0) + ' actions -> ' + a[1]);
