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
//        [--only /route,/route2] [--limit 20] [--jpeg [quality=72]]
//        [--auto-motion [threshold=0.01]]   # AUTO: probe 2 frames/screen; moving screens become GIFs
//        [--motion /route,/route2]          # force these routes to GIF (with --frames/--frame-gap/--gif-width)
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

  // --jpeg [quality]: emit small JPEGs instead of PNGs. Thumbnails are embedded base64 in the HTML,
  // which gets committed; JPEG keeps that file (and every git blob of it) an order of magnitude
  // smaller — the right default for CI that commits refreshed shots on every change.
  const jpeg = !!flags.jpeg;
  const quality = (flags.jpeg && flags.jpeg !== true) ? parseInt(flags.jpeg, 10) : 72;
  const ext = jpeg ? '.jpg' : '.png';

  // --motion <routes>: some screens can't be told in one frame (loading→loaded, star fields,
  // carousels). For those, grab several frames over time and encode ONE animated GIF (pure JS) that
  // plays in the card <img>. GIFs are heavy, so it's opt-in per route; every other route stays a still.
  const motionSet = (flags.motion && flags.motion !== true) ? String(flags.motion).split(',').map(s => s.trim()).filter(Boolean) : [];
  const mFrames = parseInt(flags.frames, 10) || 8;
  const mGap = parseInt(flags['frame-gap'], 10) || 350;
  const gifWidth = parseInt(flags['gif-width'], 10) || 240;
  // --auto-motion [threshold]: probe two frames per screen and, if enough pixels moved, it's a
  // DYNAMIC screen → capture a GIF automatically — no hand-maintained route list. --motion still
  // force-GIFs specific routes. Default threshold 0.01 (1% of pixels moved).
  const autoMotion = ('auto-motion' in flags) && flags['auto-motion'] !== false;
  const motionThreshold = (typeof flags['auto-motion'] === 'string') ? (parseFloat(flags['auto-motion']) || 0.01) : 0.01;
  let gif = null;
  if (motionSet.length || autoMotion) { try { gif = require('./lib/gif'); } catch (e) { console.error('motion needs gifenc+pngjs (npm install in skills/flow-debugger) — falling back to stills.'); } }

  const map = {}; const fail = [];
  for (const r of routes) {
    const url = baseUrl.replace(/\/$/, '') + basePath + (r === '/' ? '/' : r);
    const forced = !!gif && motionSet.includes(r);
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      if (resp && resp.status() >= 400) throw new Error('HTTP ' + resp.status());
      await page.waitForTimeout(wait);
      // still vs GIF: forced routes → GIF; with --auto-motion, probe two frames and diff to decide.
      let a = null, b = null, isMotion = forced;
      if (gif && (forced || autoMotion)) {
        a = await page.screenshot({ type: 'png' });
        await page.waitForTimeout(mGap);
        b = await page.screenshot({ type: 'png' });
        if (!forced) isMotion = gif.frameDiff(a, b) >= motionThreshold;
      }
      if (isMotion) {
        const frames = [a, b];
        for (let i = 2; i < mFrames; i++) { await page.waitForTimeout(mGap); frames.push(await page.screenshot({ type: 'png' })); }
        const file = path.join(outDir, slug(r) + '.gif');
        fs.writeFileSync(file, gif.encodeGif(frames, { width: gifWidth, delay: mGap }));
        map[r] = file; process.stdout.write('g');
      } else {
        const file = path.join(outDir, slug(r) + ext);
        if (a && !jpeg) fs.writeFileSync(file, a);      // reuse the motion-probe PNG as the still
        else await page.screenshot(jpeg ? { path: file, type: 'jpeg', quality } : { path: file });
        map[r] = file; process.stdout.write('.');
      }
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
