// flow-debugger: turn a {route: imagePath} map into {route: dataURI} for
// self-contained screenshot thumbnails. Paths in the map are relative to the
// map file. usage: node embed-shots.js <map.json> <out.json>
const fs = require('fs');
const path = require('path');
const a = process.argv.slice(2);
if (a.length < 2) { console.error('usage: node embed-shots.js <map.json {route:imagePath}> <out.json>'); process.exit(2); }

const map = JSON.parse(fs.readFileSync(a[0], 'utf8'));
const base = path.dirname(path.resolve(a[0]));
const out = {};
let n = 0, total = 0;
for (const [route, p] of Object.entries(map)) {
  const fp = path.isAbsolute(p) ? p : path.join(base, p);
  if (!fs.existsSync(fp)) { console.error('missing image: ' + fp); continue; }
  const buf = fs.readFileSync(fp);
  const ext = (path.extname(fp).slice(1) || 'png').toLowerCase();
  out[route] = 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + buf.toString('base64');
  n++; total += buf.length;
}
fs.writeFileSync(a[1], JSON.stringify(out), 'utf8');
console.log('embedded ' + n + ' shots (' + Math.round(total / 1024) + ' KB raw) -> ' + a[1]);
