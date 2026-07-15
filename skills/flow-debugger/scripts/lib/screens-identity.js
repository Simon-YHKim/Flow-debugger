// flow-debugger: the IDENTITY of every screen — the one a user actually reaches.
//
// The invariant this exists to hold: a screen node must represent **the screen a user can actually
// see in production**, never the legacy body a delegating route file happens to still contain, and
// never a screen hidden behind a dev-only gate. In the reference app 47 of 86 routes delegate (the
// URL lives in src/app but production renders a deep-space component elsewhere) and 36 share a file
// with other screens (17 in one file) — so "which screen is this, really?" is the dominant question.
//
// For each screen it computes:
//   real        the production render file:line — WHAT THE USER SEES (the canonical identity)
//   delegates   the URL is in src/app but the real render is a different file
//   sharesWith  other routes whose real render is the SAME file (a shared multi-screen file)
//   range       this screen's line span inside that (possibly shared) file — lets flow-watch
//               attribute a change to the ONE screen it fell in, not every screen in the file
//   reach       'ok' | 'dev-only' | 'gated' — a dev-only screen is NOT a screen a user reaches

const fileOf = r => (r ? String(r).replace(/\s*\(.*$/, '').replace(/:.*$/, '').trim() : null);
const lineOf = r => { const m = r && String(r).match(/:(\d+)/); return m ? +m[1] : null; };

// The render a user actually sees: the production component if the map recorded one, else the best
// action anchor (a screen file, not a lib helper).
function realOf(s) {
  // scan graph uses `renders`; the handoff flow-map.json renames it `rendersInProduction`
  if (s.rendersInProduction) return s.rendersInProduction;
  if (s.renders) return s.renders;
  for (const a of (s.actions || [])) { const f = a.file || a.impl; if (f && !/^src\/lib\//.test(f)) return f; }
  const a0 = (s.actions || [])[0]; return (a0 && (a0.file || a0.impl)) || null;
}

function reachOf(s) {
  const g = s.gate && (s.gate.gate || s.gate);
  if (!g) return 'ok';
  if (/dev/i.test(String(g))) return 'dev-only';
  if (/admin/i.test(String(g))) return 'admin-only';
  return 'gated';
}

// -> [{route,title,real,realFile,realLine,delegates,sharesWith:[route],rangeStart,rangeEnd,reach,warnings:[]}]
function identities(graph) {
  const rows = (graph || []).map(s => {
    const real = realOf(s);
    return {
      route: s.route, title: s.title || s.titleKo || s.route,
      real, realFile: fileOf(real), realLine: lineOf(real),
      reach: reachOf(s), delegates: false, sharesWith: [], rangeStart: null, rangeEnd: null, warnings: [],
    };
  });
  const byFile = {};
  for (const r of rows) if (r.realFile) (byFile[r.realFile] = byFile[r.realFile] || []).push(r);

  for (const r of rows) {
    const group = byFile[r.realFile] || [r];
    r.sharesWith = group.filter(x => x.route !== r.route).map(x => x.route);
    // line-range inside the (shared) file: from this screen's start to the next screen's start
    const sorted = group.filter(x => x.realLine != null).sort((a, b) => a.realLine - b.realLine);
    const i = sorted.findIndex(x => x.route === r.route);
    if (i >= 0) { r.rangeStart = sorted[i].realLine; r.rangeEnd = (i + 1 < sorted.length) ? sorted[i + 1].realLine - 1 : Infinity; }
    // delegation: the route (URL) is under src/app, but the real render is a different file
    r.delegates = !!(r.realFile && !/^src\/app\//.test(r.realFile));
    // invariant checks — surface anything that means the node might NOT be the reachable screen
    if (!r.real) r.warnings.push('실제 렌더 파일을 못 찾음 — 이 화면이 무엇을 그리는지 불명확');
    if (r.reach === 'dev-only') r.warnings.push('개발 전용 — 사용자가 접할 수 없는 화면');
    if (r.reach === 'admin-only') r.warnings.push('관리자 전용 — 일반 사용자가 접할 수 없는 화면');
  }
  return rows;
}

// Given the changed line numbers in a shared file, which screens do those lines belong to? Used by
// flow-watch so editing lines 141–370 of a 3-screen auth file flags ONLY /sign-in, not all three.
function screensForLines(idsInFile, changedLines) {
  const hit = new Set();
  for (const ln of changedLines) {
    let owner = null;
    for (const r of idsInFile) {
      if (r.rangeStart == null) continue;
      if (ln >= r.rangeStart && ln <= r.rangeEnd) { owner = r.route; break; }
    }
    if (owner) hit.add(owner);
    else hit.add('*');   // a line before the first screen (imports/helpers) → can't localise
  }
  return [...hit];
}

module.exports = { identities, realOf, reachOf, fileOf, lineOf, screensForLines };
