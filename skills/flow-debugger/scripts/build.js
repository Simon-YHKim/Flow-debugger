// flow-debugger: inject data JSON into the HTML template -> one self-contained file.
// usage:
//   node build.js <template.html> <graph.json> [glossary.json] [shots.json] <out.html>
// glossary/shots are optional; a missing file becomes {}.
const fs = require('fs');
const a = process.argv.slice(2);
let tpl, graph, glossary, shots, out;
if (a.length >= 5) { [tpl, graph, glossary, shots, out] = a; }
else if (a.length === 4) { [tpl, graph, glossary, out] = a; }
else if (a.length === 3) { [tpl, graph, out] = a; }
else { console.error('usage: node build.js <template.html> <graph.json> [glossary.json] [shots.json] <out.html>'); process.exit(2); }

const rd = (p, def) => { try { return p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : def; } catch (e) { return def; } };

let html = fs.readFileSync(tpl, 'utf8');
html = html.replace('__GRAPH_JSON__', fs.readFileSync(graph, 'utf8'));
html = html.replace('__GLOSSARY_JSON__', rd(glossary, '{}'));
html = html.replace('__SHOTS_JSON__', rd(shots, '{}'));

for (const t of ['__GRAPH_JSON__', '__GLOSSARY_JSON__', '__SHOTS_JSON__']) {
  if (html.includes(t)) { console.error('token not replaced: ' + t); process.exit(1); }
}
fs.writeFileSync(out, html, 'utf8');

// self-verify the embedded script parses (catches data that breaks the page)
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (m) { try { new Function(m[1]); } catch (e) { console.error('JS SYNTAX ERROR: ' + e.message); process.exit(1); } }
console.log('built ' + out + ' (' + (html.length / 1048576).toFixed(2) + ' MB), JS OK');
