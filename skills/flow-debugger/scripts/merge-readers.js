// flow-debugger: merge fan-out reader outputs into one screen array.
// Accepts a workflow result file: either a top-level array of {text} entries,
// or an object {result:[{text}, ...]}. Each text holds a JSON array (optionally
// fenced). usage: node merge-readers.js <workflow-output.json> <out.json>
const fs = require('fs');
const a = process.argv.slice(2);
if (a.length < 2) { console.error('usage: node merge-readers.js <workflow-output.json> <out.json>'); process.exit(2); }

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
const report = [];
for (const r of readers) {
  const t = (r && r.text !== undefined) ? r.text : r;
  const arr = extract(t);
  if (Array.isArray(arr)) { screens = screens.concat(arr); report.push((r && r.group ? r.group : '?') + ':' + arr.length); }
  else report.push((r && r.group ? r.group : '?') + ':FAIL');
}
fs.writeFileSync(a[1], JSON.stringify(screens, null, 2), 'utf8');
console.log(report.join(' | '));
console.log('merged ' + screens.length + ' screens -> ' + a[1]);
