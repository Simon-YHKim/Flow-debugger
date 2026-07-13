// flow-debugger: capture one screenshot per route from a locally-running web build.
//
// The thumbnails are how a non-developer recognises a screen — and until now nothing in
// this repo produced them. `embed-shots.js` consumed a `shots-map.json` that a human had
// to make by hand, by a process that was never written down. This is that process.
//
// usage:
//   node capture-shots.js <graph.json> <baseUrl> <outDir>
//        [--base-path /app] [--wait 1200] [--width 390] [--height 844]
//        [--auth-url <url> --email <id> --password <pw>]
//        [--only /route,/route2] [--limit 20]
//
// writes  <outDir>/<slug>.png ...  and  <outDir>/shots-map.json  ({route: pngPath})
// then:   node embed-shots.js <outDir>/shots-map.json Output/shots.json
//
// Routes with dynamic segments (/record/[id], /:id) are skipped — there is no id to use.
// See references/capture-shots.md.
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const v = argv[i];
  if (v.startsWith('--')) { const k = v.slice(2); flags[k] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; }
  else pos.push(v);
}
if (pos.length < 3) {
  console.error('usage: node capture-shots.js <graph.json> <baseUrl> <outDir> [--base-path /app] [--auth-url U --email E --password P] [--wait ms] [--width w] [--height h] [--only /a,/b] [--limit N]');
  process.exit(2);
}
const [graphPath, baseUrl, outDir] = pos;
const basePath = (flags['base-path'] && flags['base-path'] !== true) ? String(flags['base-path']).replace(/\/$/, '') : '';
const wait = parseInt(flags.wait, 10) || 1200;
const width = parseInt(flags.width, 10) || 390;
const height = parseInt(flags.height, 10) || 844;

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('playwright is not installed. Run  npm install  in skills/flow-debugger.'); process.exit(2); }

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const only = (flags.only && flags.only !== true) ? String(flags.only).split(',').map(s => s.trim()) : null;
const isDynamic = r => /\[[^\]]+\]|:\w+|\*/.test(r);

let routes = [...new Set(graph.map(s => s.route).filter(Boolean))];
const skipped = routes.filter(isDynamic);
routes = routes.filter(r => !isDynamic(r));
if (only) routes = routes.filter(r => only.includes(r));
if (flags.limit) routes = routes.slice(0, parseInt(flags.limit, 10));

const slug = r => (r === '/' ? 'index' : r.replace(/^\/+/, '').replace(/[^\w.-]+/g, '_')) || 'index';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});           // an app error is the app's business, not ours

  if (flags['auth-url'] && flags.email) {
    console.log('signing in ...');
    await page.goto(String(flags['auth-url']));
    await page.waitForTimeout(wait);
    const type = async (sels, val) => { for (const s of sels) { const el = await page.$(s); if (el) { await el.fill(String(val)); return true; } } return false; };
    await type(['input[type=email]', 'input[name=email]', 'input[placeholder*="메일"]', 'input[placeholder*="mail"]'], flags.email);
    await type(['input[type=password]', 'input[name=password]', 'input[placeholder*="비밀"]'], flags.password || '');
    for (const s of ['button[type=submit]', 'button:has-text("로그인")', 'button:has-text("Sign in")']) {
      const b = await page.$(s); if (b) { await b.click().catch(() => {}); break; }
    }
    await page.waitForTimeout(wait * 2);
    console.log('  -> ' + page.url());
  }

  const map = {}; const fail = [];
  for (const r of routes) {
    const url = baseUrl.replace(/\/$/, '') + basePath + (r === '/' ? '/' : r);
    const file = path.join(outDir, slug(r) + '.png');
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      if (resp && resp.status() >= 400) throw new Error('HTTP ' + resp.status());
      await page.waitForTimeout(wait);
      await page.screenshot({ path: file });
      map[r] = file;
      process.stdout.write('.');
    } catch (e) { fail.push(r + ' (' + e.message.split('\n')[0] + ')'); process.stdout.write('x'); }
  }
  await browser.close();

  const mapPath = path.join(outDir, 'shots-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf8');
  console.log('\n\ncaptured ' + Object.keys(map).length + '/' + routes.length + ' routes -> ' + mapPath);
  if (skipped.length) console.log('skipped ' + skipped.length + ' dynamic route(s): ' + skipped.slice(0, 8).join(', ') + (skipped.length > 8 ? ' …' : ''));
  if (fail.length) {
    console.log('FAILED ' + fail.length + ' (they fall back to the type icon — that is fine):');
    fail.slice(0, 15).forEach(f => console.log('  · ' + f));
  }
  console.log('\nnext: node embed-shots.js "' + mapPath + '" Output/shots.json');
})();
