// flow-debugger: live-verify a built flow-debugger.html in a real browser.
//
// The build's `new Function` check only proves the script PARSES. This proves the page
// actually runs: no runtime error, no overlapping cards, the panels render, and — the
// thing that matters — the exported bug report really carries the verified code anchors.
// Every "verify PASS" claim in this repo's CHANGELOG used to rest on scripts that lived
// in a temp directory and no longer exist; this one lives with the code.
//
// usage:
//   node verify-html.js <flow-debugger.html> [--template <template.html>] [--shot <out.png>]
// requires playwright (see package.json). If it is not installed the script says so and
// exits 2 — it never silently "passes".
const path = require('path');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const v = argv[i];
  if (v === '--shot') flags.shot = argv[++i];
  else if (v === '--template') flags.template = argv[++i];
  else if (v.startsWith('--')) flags[v.slice(2)] = true;
  else pos.push(v);
}
if (!pos.length) { console.error('usage: node verify-html.js <flow-debugger.html> [--shot out.png]'); process.exit(2); }
const file = path.resolve(pos[0]);

// A leak check belongs on the TEMPLATE, not on a built page: a 2nd-B map legitimately
// contains 2nd-B's own model names (they came from its data). What must never contain them
// is the file every third party ships. This is the check v0.8.1's __APP_NAME__ fix implied
// but never enforced — the AI-harness diagram was hard-coded and leaked far more than a title.
const FOREIGN = ['callGemini', 'gemini-proxy', 'bump_gemini_spend', 'claude-sonnet',
  'text-embedding-004', 'EXPO_PUBLIC_MODEL', 'supabase/functions', '2nd-B', 'deepspace'];
function templateLeaks(tplPath) {
  const src = require('fs').readFileSync(tplPath, 'utf8');
  return FOREIGN.filter(s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(src));
}
if (flags.template) {
  const leaks = templateLeaks(path.resolve(flags.template));
  console.log('template leaks   ' + (leaks.length ? 'FOUND ' + leaks.join(', ') : 'none'));
  if (leaks.length) { console.log('\nFAIL — the template ships another app\'s internals'); process.exit(1); }
}

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('playwright is not installed. Run:  npm install  (in skills/flow-debugger)');
  console.error('or:  NODE_PATH=<your playwright> node verify-html.js ...');
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const errors = [];
  page.on('pageerror', e => {
    // synthetic pointer events in a headless run raise this; it is a test artifact
    if (/setPointerCapture|No active pointer/i.test(String(e.message))) return;
    errors.push(String(e.message));
  });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('file:///' + file.replace(/\\/g, '/'));
  await page.waitForTimeout(900);

  const R = await page.evaluate(() => {
    const out = {};
    out.title = document.title;
    out.nodes = document.querySelectorAll('#nodes .node').length;
    out.chips = document.querySelectorAll('.chips .chip').length;
    out.legend = document.querySelectorAll('.legend span').length;
    out.harnessBtn = (() => { const b = document.getElementById('harnessBtn'); return !b ? 'absent' : (b.style.display === 'none' ? 'hidden' : 'shown'); })();
    out.anchorsChecked = (typeof ANCHORS !== 'undefined') && !!ANCHORS.checked;
    out.anchorStat = (typeof ANCHORS !== 'undefined') ? ANCHORS.stat : null;
    out.harnessDerived = (typeof HARNESS_DERIVED !== 'undefined') ? HARNESS_DERIVED : null;
    out.unit = (typeof UNIT !== 'undefined') ? UNIT : null;

    // overlap: every visible card must own its rectangle
    const els = [...document.querySelectorAll('#nodes .node')].map(e => {
      const r = e.getBoundingClientRect(); return { id: e.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    let overlaps = 0;
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.x < b.x + b.w - 2 && a.x + a.w - 2 > b.x && a.y < b.y + b.h - 2 && a.y + a.h - 2 > b.y) overlaps++;
    }
    out.overlaps = overlaps;
    return out;
  });

  // drive the actual value path: open a screen, file a bug, read the exported report
  let report = '', bugFlow = 'not-run';
  try {
    await page.click('#nodes .node.screen');
    await page.waitForTimeout(250);
    const hasBtn = await page.$('#reportBug');
    if (hasBtn) {
      await page.click('#reportBug');
      await page.waitForTimeout(250);
      // empty report must NOT export
      const empty = await page.inputValue('#bugOut').catch(() => '');
      const gated = /비어 있어요/.test(empty);
      await page.fill('textarea[data-f="symptom"]', '화면이 하얗게만 뜨고 아무것도 안 보여요');
      await page.dispatchEvent('textarea[data-f="symptom"]', 'change');
      await page.waitForTimeout(250);
      report = await page.inputValue('#bugOut').catch(() => '');
      bugFlow = gated ? (report.includes('안 되는') ? 'ok' : 'no-report') : 'NOT-GATED';
    } else bugFlow = 'no-button-on-screen-card';
  } catch (e) { bugFlow = 'error: ' + e.message; }

  // THE test gap that let the flagship feature ship dead: build.js printed "DELEGATION TRAP: 4"
  // while the page's lookup key never matched (a stray NUL vs a space), so delegWarn() returned
  // null for every node — and both the unit test (which calls the library directly) and this
  // script (which only clicked the FIRST screen card) passed. Assert the warning actually fires,
  // end to end, on a route the build says is trapped.
  const deleg = await page.evaluate(() => {
    const D = (typeof ANCHORS !== 'undefined' && ANCHORS.delegation) || {};
    const keys = Object.keys(D);
    if (!keys.length) return { trapped: 0, fired: 0, inReport: null };
    let fired = 0;
    for (const k of keys) {
      const route = k.split(' ')[0];
      const sn = nodes.get('s:' + route);
      if (sn && delegWarn(sn)) { fired++; continue; }
      for (const n of nodes.values())
        if (n.type === 'action' && n.screen && n.screen.route === route && delegWarn(n)) { fired++; break; }
    }
    // and it must reach the EXPORT, which is the only thing a coding agent ever reads
    const route = keys[0].split(' ')[0];
    const sn = nodes.get('s:' + route);
    let inReport = null;
    if (sn) {
      state.bugs = state.bugs || {};
      state.bugs[sn.id] = { symptom: '테스트' };
      inReport = /위임 경고/.test(buildBugReport([sn.id]));
      delete state.bugs[sn.id];
    }
    return { trapped: keys.length, fired, inReport };
  });

  // the harness view has its own layout pass — check it de-overlaps too (it used to have none)
  let harnessOverlaps = null;
  if (R.harnessBtn === 'shown') {
    await page.click('#harnessBtn'); await page.waitForTimeout(700);
    harnessOverlaps = await page.evaluate(() => {
      const els = [...document.querySelectorAll('#nodes .node')].map(e => e.getBoundingClientRect());
      let o = 0;
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.left < b.right - 2 && a.right - 2 > b.left && a.top < b.bottom - 2 && a.bottom - 2 > b.top) o++;
      }
      return o;
    });
    await page.click('#harnessBtn'); await page.waitForTimeout(300);
  }

  // ---- 🗄 서버·데이터 (the second half of "system flow") -----------------------------------------
  // A map whose system view stops at the tag name is a screen map wearing a server's coat. If the
  // app has a backend, this layer must actually draw: screen -> server call -> function -> table.
  let stack = { has: false };
  if (await page.evaluate(() => typeof HAS_STACK !== 'undefined' && HAS_STACK)) {
    await page.evaluate(() => setView('system'));
    await page.click('#sysSeg button[data-s="stack"]');
    await page.waitForTimeout(700);
    stack = await page.evaluate(() => {
      const drawn = t => [...nodes.values()].filter(n => n.type === t && document.querySelector(`[data-id="${CSS.escape(n.id)}"]`)).length;
      const els = [...document.querySelectorAll('#nodes .node')].map(e => e.getBoundingClientRect());
      let o = 0;
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.left < b.right - 2 && a.right - 2 > b.left && a.top < b.bottom - 2 && a.bottom - 2 > b.top) o++;
      }
      // and the panels must EXPLAIN them — a table card that cannot say whether RLS is on is decoration
      const t = [...nodes.values()].find(n => n.type === 'svt');
      const h = [...nodes.values()].find(n => n.type === 'svh');
      let tablePanel = '', handlerPanel = '';
      if (t) { selected = t.id; renderDetail(); tablePanel = document.getElementById('detailBody').innerText; }
      if (h) { selected = h.id; renderDetail(); handlerPanel = document.getElementById('detailBody').innerText; }
      selected = null;
      // what the page KNOWS exists behind the screens — if this is non-empty the view must draw
      const be = (typeof BACKEND !== 'undefined' && BACKEND && BACKEND.counts) ? BACKEND.counts : { handlers: 0, tables: 0 };
      return { has: true, view: sysView, handlers: drawn('svh'), tables: drawn('svt'), calls: drawn('svapi'),
        knownHandlers: be.handlers, knownTables: be.tables,
        edges: document.querySelectorAll('#edges path').length, overlaps: o,
        tableExplained: /행 수준 보안|RLS 없음|RLS/.test(tablePanel), handlerExplained: /코드 위치|로그인 확인/.test(handlerPanel) };
    });
    await page.evaluate(() => { const b = document.querySelector('#sysSeg button[data-s="nav"]'); if (b) b.click(); });
    await page.waitForTimeout(400);
  }

  // ---- 🔀 순서 편집 — driven as a REAL DRAG, not by calling the function ------------------------
  // The flagship feature of v0.11 shipped dead because the unit test called the library and the
  // page's own lookup was broken. So this grabs a screen card with the mouse, drops it on an arrow,
  // and then reads the EXPORT — the only artifact a coding agent ever sees.
  let reorder = { ran: false };
  if (await page.evaluate(() => typeof NAV !== 'undefined' && NAV.length > 2)) {
    const plan = await page.evaluate(() => {
      setView('system');
      const rb = document.getElementById('reorderBtn');
      if (!rb || rb.classList.contains('on')) return null;
      rb.click();                                   // reorderMode on -> drawEdges() fills edgeHit
      return null;
    });
    void plan;
    await page.waitForTimeout(500);
    const geo = await page.evaluate(() => {
      if (!reorderMode || !edgeHit.length) return { err: 'reorder mode did not arm (edgeHit empty)' };
      // a screen that is not either end of the arrow, and is on screen
      for (const h of edgeHit) {
        const c = [...nodes.values()].find(n => n.type === 'screen' && n.id !== h.from && n.id !== h.to
          && document.querySelector(`[data-id="${CSS.escape(n.id)}"]`));
        if (!c) continue;
        const el = document.querySelector(`[data-id="${CSS.escape(c.id)}"]`);
        const r = el.getBoundingClientRect();
        const cx = c.x + (el.offsetWidth / 2), cy = c.y + ((c.h || 60) / 2);   // world centre of the card
        return {
          from: h.from, to: h.to, node: c.id,
          fromRoute: nodes.get(h.from).data.route, toRoute: nodes.get(h.to).data.route, midRoute: c.data.route,
          startX: r.left + r.width / 2, startY: r.top + Math.min(20, r.height / 2),   // grab the card's header
          dx: (h.mx - cx) * view.k, dy: (h.my - cy) * view.k,
        };
      }
      return { err: 'no third screen to splice' };
    });
    if (geo.err) reorder = { ran: false, err: geo.err };
    else {
      await page.mouse.move(geo.startX, geo.startY);
      await page.mouse.down();
      await page.mouse.move(geo.startX + geo.dx * 0.5, geo.startY + geo.dy * 0.5, { steps: 8 });
      await page.mouse.move(geo.startX + geo.dx, geo.startY + geo.dy, { steps: 8 });
      await page.waitForTimeout(150);
      await page.mouse.up();
      await page.waitForTimeout(400);
      reorder = await page.evaluate((g) => {
        const eff = effNav();
        const has = (a, b) => eff.some(e => e.from === a && e.to === b);
        const prompt = buildStackPrompt();
        return {
          ran: true,
          edits: (state.navEdits || []).length,
          spliced: has(g.from, g.node) && has(g.node, g.to),   // A->C->B
          oldGone: !has(g.from, g.to),
          // the export must name the BUTTON to retarget, with its code location — an abstract
          // "reorder the graph" instruction is not something anyone can implement
          promptHasEdit: prompt.includes(g.midRoute) && /버튼|이동/.test(prompt),
          promptHasAnchor: /:\d+/.test(prompt),
          // and it must not decide for the user what it was never told
          promptAsks: /물어봐|의논/.test(prompt),
        };
      }, geo);
      await page.evaluate(() => { clearNavEdits(); const rb = document.getElementById('reorderBtn'); if (rb && rb.classList.contains('on')) rb.click(); });
    }
  }

  if (flags.shot) { await page.screenshot({ path: flags.shot, fullPage: false }); }
  if (!flags['keep-open']) await browser.close();

  const anchorLine = R.anchorStat
    ? `confirmed ${(R.anchorStat.exact + R.anchorStat.near + R.anchorStat.resolved + R.anchorStat.fileonly + R.anchorStat.unchecked)}/${R.anchorStat.total}, weak ${R.anchorStat.weak}, prose ${R.anchorStat.prose}`
    : 'n/a';

  console.log('title            ' + R.title);
  console.log('nodes / chips    ' + R.nodes + ' / ' + R.chips + '   legend items ' + R.legend);
  console.log('unit             ' + R.unit);
  console.log('overlaps         ' + R.overlaps);
  console.log('page errors      ' + errors.length + (errors.length ? '\n  ! ' + errors.slice(0, 5).join('\n  ! ') : ''));
  console.log('anchors verified ' + R.anchorsChecked + '   (' + anchorLine + ')');
  console.log('harness          button=' + R.harnessBtn + ' derived=' + R.harnessDerived);
  console.log('bug flow         ' + bugFlow + '   (empty report must be gated, filled report must carry anchors)');
  console.log('delegation warn  ' + (deleg.trapped ? deleg.fired + '/' + deleg.trapped + ' fired, in report: ' + deleg.inReport : 'no traps in this map'));
  if (harnessOverlaps !== null) console.log('harness overlaps ' + harnessOverlaps);
  console.log('서버·데이터 뷰    ' + (stack.has
    ? `함수 ${stack.handlers} · 테이블 ${stack.tables} · 서버작업 ${stack.calls} · 엣지 ${stack.edges}`
      + ` · 겹침 ${stack.overlaps} · 패널설명 표=${stack.tableExplained} 함수=${stack.handlerExplained}`
    : '이 앱에는 서버 계층이 없음 (정상)'));
  console.log('순서 편집(실드래그) ' + (reorder.ran
    ? `A→C→B ${reorder.spliced} · 기존 A→B 제거 ${reorder.oldGone} · 편집 ${reorder.edits}건`
      + ` · 프롬프트: 버튼지목 ${reorder.promptHasEdit} 좌표 ${reorder.promptHasAnchor} 의논요구 ${reorder.promptAsks}`
    : 'not run — ' + (reorder.err || 'nav graph too small')));
  if (report) {
    console.log('\n--- exported bug report (first 24 lines) ---');
    console.log(report.split('\n').slice(0, 24).join('\n'));
  }

  // A feature that is not asserted here is a feature that can die in the next build with every
  // test still green. That has happened once; it is not allowed to happen to these two.
  // if the page knows there is a backend, the view drawing NOTHING is the whole-layer-dead
  // regression (the way the NUL byte killed delegation). Catch it against the embedded truth.
  const stackBad = stack.has && (stack.overlaps > 0
    || ((stack.knownHandlers + stack.knownTables) > 0 && (stack.handlers + stack.tables) === 0)
    || (stack.tables > 0 && !stack.tableExplained) || (stack.handlers > 0 && !stack.handlerExplained));
  const reorderBad = !!reorder.err
    || (reorder.ran && !(reorder.spliced && reorder.oldGone && reorder.promptHasEdit
      && reorder.promptHasAnchor && reorder.promptAsks));

  const fail = errors.length || R.overlaps || !R.nodes || bugFlow !== 'ok'
    || (deleg.trapped > 0 && (deleg.fired < deleg.trapped || deleg.inReport === false))
    || (harnessOverlaps !== null && harnessOverlaps > 0)
    || stackBad || reorderBad;
  console.log('\n' + (fail ? 'FAIL' : 'PASS'));
  process.exit(fail ? 1 : 0);
})();
