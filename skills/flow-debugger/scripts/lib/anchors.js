// flow-debugger: anchor parsing, resolution and validation.
//
// An ANCHOR is the code coordinate this tool hands a coding agent. It is the single most
// load-bearing datum here: everything else is a picture, but the anchor is the
// instruction. The failure it exists to prevent is the coordinate that is real-but-wrong
// — the agent edits a legacy file production never renders, the build goes green, and
// the screen does not change.
//
// What a scan actually emits (measured against the real 2nd-B map, 668 anchors):
//   "src/a.tsx:198"                                    a clean path:line              (51%)
//   "src/lib/x.ts (submitProfile / validate)"          a file + symbols, NO line      (19%)
//   "Foo.tsx:89 router.push('/x')"                     a bare filename, no directory
//   "loadDomainLevels(userId) — 별 밝기 계산"           prose. Not a coordinate at all. (10%)
// The old validator only understood the first form. The second silently became a "code
// hint" that no editor can jump to; the fourth shipped Korean prose in the file:line slot.
//
// So this module does three things, in order:
//   RESOLVE   pull the real file out of the text; if the line is missing, FIND it by
//             locating the named symbol; if the directory is missing, resolve the
//             basename against the source tree (uniquely, or not at all)
//   VALIDATE  the file exists, stays inside the app root, and the line is in range
//   CONFIRM   the named symbol is actually AT that line — and if it drifted a few lines,
//             snap to where it really is
//
// Anything that survives none of that is DROPPED, never guessed. An empty field beats a
// wrong one: "location unknown" makes an agent search; a wrong line makes it edit.

const fs = require('fs');
const path = require('path');

const SNAP_WINDOW = 12;          // how far a drifted line may be and still be snapped
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'build', 'coverage',
  '.next', 'out', 'android', 'ios', '.worktrees', 'vendor', '__pycache__']);
const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|py|rb|go|java|kt|swift|rs|php|cs|sql|json|ya?ml|html?|css|scss|sh|ps1|toml)$/i;

// ---------------------------------------------------------------- source tree index
// Lazy basename -> [rel paths]. Lets us resolve "DeepSpaceShell.tsx:89" (a real thing
// scans emit) when the basename is unique in the tree, and refuse when it is not.
const treeCache = new Map();
function tree(appRoot) {
  const root = path.resolve(appRoot);
  if (treeCache.has(root)) return treeCache.get(root);
  const byBase = new Map();
  const walk = (dir, rel) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      if (e.name.startsWith('.') && e.name !== '.') { if (SKIP_DIRS.has(e.name)) continue; }
      if (e.isDirectory()) { if (SKIP_DIRS.has(e.name)) continue; walk(path.join(dir, e.name), rel ? rel + '/' + e.name : e.name); }
      else if (CODE_EXT.test(e.name)) {
        const r = rel ? rel + '/' + e.name : e.name;
        if (!byBase.has(e.name)) byBase.set(e.name, []);
        byBase.get(e.name).push(r);
      }
    }
  };
  walk(root, '');
  treeCache.set(root, byBase);
  return byBase;
}

// ---------------------------------------------------------------- file cache
const fileCache = new Map();
function readLines(appRoot, rel) {
  const key = path.resolve(appRoot) + '|' + rel;
  if (fileCache.has(key)) return fileCache.get(key);
  let v = null;
  try {
    const abs = path.join(path.resolve(appRoot), rel);
    if (fs.statSync(abs).isFile()) v = splitLines(fs.readFileSync(abs, 'utf8'));
  } catch (e) { v = null; }
  fileCache.set(key, v);
  return v;
}
// A file ending in "\n" has N lines, not N+1 — `split('\n').length` over-counted by one,
// so an anchor one line past EOF used to validate.
function splitLines(text) {
  const parts = text.replace(/\r\n/g, '\n').split('\n');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts;
}
function countLines(text) { return splitLines(text).length; }

// ---------------------------------------------------------------- parse
const IDENT = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
// A code symbol we can actually look for. A bare lowercase word ("survey", "session") is
// a slug, not an identifier — using it as one produced false "the function is not there"
// verdicts, and a false alarm costs more trust than a missing one.
function isCodeIdent(s) {
  return IDENT.test(s) && (/[a-z][A-Z]/.test(s) || /^[A-Z]/.test(s) || s.includes('.') || s.includes('_') || s.includes('$'));
}
// Symbols from a parenthesised group — ALL-OR-NOTHING. "(setAllRequiredAcks / allRequiredAcksChecked)"
// is a symbol list; "(composes doc via buildIdenDoc→buildPersona)" and "(both fail-open)" are
// prose, and picking the one identifier out of a sentence made us flag a correct anchor as wrong.
function symbolsOf(s) {
  if (!s) return [];
  const parts = String(s).split(/[\/,|]|->|→|·/).map(x => x.trim()).filter(Boolean);
  if (!parts.length) return [];
  const clean = parts.map(x => x.replace(/\(.*$/, '').trim());   // "foo(userId)" -> "foo"
  return clean.every(x => IDENT.test(x)) ? clean : [];
}
// Every file reference inside a free-text anchor, in order.  -> [{path, line, symbols:[]}]
// Parens and brackets are legal INSIDE a path — Expo router groups (`src/app/(auth)/x.tsx`)
// and dynamic segments (`record/[id].tsx`) are everywhere, and excluding them used to chop
// the path down to a leading-slash fragment that then failed the containment check.
function findRefs(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const out = [];
  const re = /([^\s<>"'`,;=]+\.[A-Za-z0-9]{1,6})(?::(\d+))?(?::\d+)?(?:\s+\(([^)]*)\))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const p = m[1]
      .replace(/^[\w$.]+\(/, '')          // "DevOnlyRoute(src/x.tsx" -> "src/x.tsx"
      .replace(/^[([{]+/, '').replace(/[)\]}]+$/, '');
    if (!CODE_EXT.test(p)) continue;                     // "router.push", "Share.share" are not files
    out.push({ path: p, line: m[2] ? parseInt(m[2], 10) : null, symbols: symbolsOf(m[3]) });
  }
  return out;
}
// back-compat: the first strict path:line, or null
function parseAnchor(raw) {
  const r = findRefs(raw).find(x => x.line != null);
  return r ? { path: r.path, line: r.line } : null;
}

// ---------------------------------------------------------------- containment
function relTo(appRoot, p) {
  const norm = String(p).replace(/\\/g, '/').replace(/^\.\//, '');
  const root = path.resolve(appRoot);
  const abs = path.isAbsolute(norm) ? path.resolve(norm) : path.resolve(root, norm);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;   // no ../ escape
  return rel.replace(/\\/g, '/');
}
// Resolve a reference's path to a repo-relative file that exists.
//   -> {rel} | {fail:"outside"|"missing"|"ambiguous"}
function resolveFile(appRoot, p) {
  const hasDir = /[\/\\]/.test(p) || path.isAbsolute(p);
  if (hasDir) {
    const rel = relTo(appRoot, p);
    if (!rel) return { fail: 'outside' };
    return readLines(appRoot, rel) ? { rel } : { fail: 'missing' };
  }
  // bare filename: unique basename in the source tree, or nothing
  const hits = tree(appRoot).get(p) || [];
  if (hits.length === 1) return { rel: hits[0], viaBasename: true };
  return { fail: hits.length ? 'ambiguous' : 'missing' };
}

function symbolRe(sym) {
  const leaf = String(sym).split('.').pop();
  return new RegExp('\\b' + leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
}
function findSymbolLine(lines, syms, near) {
  for (const s of syms) {
    const re = symbolRe(s);
    if (near != null) {                        // prefer the closest occurrence to `near`
      for (let d = 0; d <= SNAP_WINDOW; d++) {
        for (const i of (d === 0 ? [near - 1] : [near - 1 - d, near - 1 + d])) {
          if (i < 0 || i >= lines.length) continue;
          if (re.test(lines[i])) return { line: i + 1, sym: s, dist: d };
        }
      }
      continue;
    }
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return { line: i + 1, sym: s, dist: null };
  }
  return null;
}

// ---------------------------------------------------------------- validate one anchor
// status:
//   exact     line given, the named symbol is on it                     -> trust
//   near      line drifted; snapped to the symbol                       -> trust
//   resolved  no line was given; found it BY the symbol                 -> trust
//   fileonly  the file is real, the line is unknown                     -> useful, honest
//   unchecked line is in range, but there is no symbol to compare with  -> starting point
//   absent    file+line real, the named symbol is NOT there             -> suspect
//   prose     no file reference at all — this is a note, not a location
//   missing / ambiguous / range / outside / unparsable                  -> broken
//
// opts.symbol: extra symbol to check (e.g. the action's `feature` when it is an identifier)
// returns {ok, status, value, rel, line, why, note}
function validateAnchor(raw, appRoot, opts) {
  const o = opts || {};
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return { ok: false, status: 'unparsable', raw: String(raw) };

  const refs = findRefs(raw);
  if (!refs.length) {
    // e.g. "loadDomainLevels(userId) — 사용자 기록을 domain 태그별로 묶어 별 밝기 계산"
    return { ok: false, status: 'prose', raw, note: raw.trim() };
  }
  const ref = refs[0];
  // `symbol` is what the scan DECLARED as the code identifier -> trust any identifier.
  // `feature` is a label and is usually a kebab slug ("consent-gate", "survey"); using one
  // as a symbol produced false "the function is not there" verdicts, and a false alarm on a
  // correct anchor costs more trust than a missed one. So it must look like real code.
  const extra = [];
  if (o.symbol && IDENT.test(String(o.symbol).trim())) extra.push(String(o.symbol).trim());
  else if (o.feature && isCodeIdent(String(o.feature).trim())) extra.push(String(o.feature).trim());
  const syms = ref.symbols.concat(extra.filter(x => !ref.symbols.includes(x)));

  const r = resolveFile(appRoot, ref.path);
  // What we write back onto the anchor so it re-verifies next run. Prefer the symbol the
  // anchor already carried; fall back to the action's identifier. NOT both — repeated
  // repairs would otherwise accrete "(a / b / c)".
  const symTail = ref.symbols.length ? ' (' + ref.symbols.join(' / ') + ')'
                : extra.length ? ' (' + extra[0] + ')' : '';
  if (r.fail) return { ok: false, status: r.fail, raw, rel: ref.path,
    why: r.fail === 'ambiguous' ? '같은 이름의 파일이 여러 개라 어느 것인지 알 수 없어요'
       : r.fail === 'outside' ? '프로젝트 폴더 밖 경로예요' : '그 파일이 없어요' };

  const lines = readLines(appRoot, r.rel);
  const base = { raw, rel: r.rel, extra: refs.length > 1 ? refs.slice(1).map(x => x.path + (x.line ? ':' + x.line : '')) : undefined };

  // no line -> find it by symbol
  if (ref.line == null) {
    const f = syms.length ? findSymbolLine(lines, syms, null) : null;
    if (f) return Object.assign(base, { ok: true, status: 'resolved', line: f.line,
      value: r.rel + ':' + f.line, syms, symTail, why: `줄 번호가 없어 '${f.sym}' 를 찾아 채웠어요` });
    return Object.assign(base, { ok: true, status: 'fileonly', line: null, value: r.rel, syms, symTail,
      why: '파일은 확인했지만 줄 번호는 몰라요' });
  }

  if (ref.line < 1 || ref.line > lines.length) {
    // the line is past EOF, but the symbol may still be findable -> recover instead of drop
    const f = syms.length ? findSymbolLine(lines, syms, null) : null;
    if (f) return Object.assign(base, { ok: true, status: 'resolved', line: f.line,
      value: r.rel + ':' + f.line, syms, symTail, why: `줄 번호(${ref.line})가 파일 길이(${lines.length})를 넘어서 '${f.sym}' 위치로 고쳤어요` });
    return Object.assign(base, { ok: false, status: 'range', line: ref.line,
      why: `줄 ${ref.line}은 파일 길이(${lines.length})를 넘어요` });
  }

  if (!syms.length) {
    // Nothing to compare the line against by name — but we can still tell whether it points
    // at CODE. An anchor on a blank line, an import, or a comment is the classic "the scan
    // gave me the mount point, not the handler" failure the SCAN prompt warns about; sending
    // an agent there is how the wrong file gets edited.
    const txt = (lines[ref.line - 1] || '').trim();
    const weak = !txt ? '빈 줄을 가리켜요'
      : /^(import|export\s+\*|export\s+\{|from\s|require\()/.test(txt) ? 'import 줄을 가리켜요'
      : /^(\/\/|\/\*|\*|#|<!--)/.test(txt) ? '주석 줄을 가리켜요' : null;
    if (weak) return Object.assign(base, { ok: true, status: 'weak', line: ref.line,
      value: r.rel + ':' + ref.line, syms, symTail, why: weak + ' — 실제 로직은 다른 줄일 수 있어요' });
    return Object.assign(base, { ok: true, status: 'unchecked', line: ref.line,
      value: r.rel + ':' + ref.line, syms, symTail, why: '파일과 줄은 확인했어요(대조할 함수 이름이 없어요)' });
  }

  const onLine = syms.find(s => symbolRe(s).test(lines[ref.line - 1] || ''));
  if (onLine) return Object.assign(base, { ok: true, status: 'exact', line: ref.line,
    value: r.rel + ':' + ref.line, syms, symTail, why: `그 줄에 '${onLine}' 가 실제로 있어요` });

  const f = o.snap === false ? null : findSymbolLine(lines, syms, ref.line);
  if (f && f.dist != null) return Object.assign(base, { ok: true, status: 'near', line: f.line,
    value: r.rel + ':' + f.line, snapped: f.line, syms, symTail,
    why: `줄이 ${Math.abs(f.line - ref.line)}줄 어긋나 '${f.sym}' 실제 위치로 고쳤어요` });

  return Object.assign(base, { ok: true, status: 'absent', line: ref.line, value: r.rel + ':' + ref.line, syms, symTail,
    why: `그 줄에 '${syms[0]}' 가 없어요 — 위치가 틀렸을 수 있어요` });
}

const TRUSTED = new Set(['exact', 'near', 'resolved', 'fileonly', 'unchecked']);
const WEAK = new Set(['weak']);
const SUSPECT = new Set(['absent', 'weak']);

// ---------------------------------------------------------------- delegation lint
// THE failure this whole tool exists to prevent: a screen file that conditionally hands
// off to another component ("if (isDeepSpaceUI()) return <XxxDesignScreen/>", a Platform
// switch, an experiment flag). The anchor into that file is REAL — file exists, line is in
// range — and completely useless: the agent edits a body production never renders, the
// build is green, and the screen does not change.
//
// So: if an anchored file delegates, and nothing on that screen carries a `renders`
// pointing at the real component, say so. This cannot be caught by validating the anchor;
// only by reading what the anchored file does.
// Two things had to be right here, and the obvious regex got both wrong:
//   1. `[^)]*` cannot cross the nested parens of the commonest form — `if (isDeepSpaceUI())
//      return <XxxScreen/>` — so the detector found NOTHING on the very codebase it was
//      written for. The condition is matched lazily now.
//   2. Matching any `if (...) return <X/>` flags every loading guard (`if (loading) return
//      <View/>`). A false alarm on a correct anchor costs more trust than a missed one, so
//      the condition must smell like a UI-VARIANT switch, and the target must be a real
//      component rather than a layout primitive.
//   3. Real code writes the hand-off both as JSX (`return <XxxScreen/>`) and as a call
//      (`return XxxScreen();`). Requiring the `<` missed half of them.
const DELEGATE_RE = /if\s*\((.{0,160}?)\)\s*\{?\s*return\s*\(?\s*<?\s*([A-Z][\w.]*)|return\s*\(?\s*([\w.$()]+)\s*\?\s*<?\s*([A-Z][\w.]*)/g;
// a variant switch, not an early-out: isXxxUI(), Platform.OS, a feature flag, an experiment
const VARIANT_COND = /is[A-Z]\w*\s*\(|Platform\s*\.|__DEV__|\bflag|\bvariant|\bexperiment|\bfeature|\bUI\b|\btheme|\bnewUi|\benableNew/i;
// returning one of these is a spinner / empty state, not a hand-off to another screen body
const PRIMITIVE = new Set(['View', 'Text', 'Fragment', 'ScrollView', 'SafeAreaView', 'ActivityIndicator',
  'Spinner', 'Loader', 'Loading', 'Skeleton', 'Suspense', 'ErrorBoundary', 'Redirect', 'Navigate',
  'Modal', 'Portal', 'Slot', 'Stack', 'Tabs', 'Image', 'Pressable', 'Div', 'Span', 'Null']);
const delegCache = new Map();
function delegatesTo(appRoot, rel) {
  if (delegCache.has(rel)) return delegCache.get(rel);
  const lines = readLines(appRoot, rel);
  let hit = null;
  if (lines) {
    const head = lines.slice(0, 400).join('\n');
    let m; DELEGATE_RE.lastIndex = 0;
    while ((m = DELEGATE_RE.exec(head))) {
      const cond = m[1] || m[3] || '';
      const target = m[2] || m[4] || '';
      if (!target || PRIMITIVE.has(target)) continue;
      if (!/^[A-Z][a-z0-9]/.test(target)) continue;      // PascalCase component, not SCREAMING_CONST
      if (!VARIANT_COND.test(cond)) continue;
      hit = target; break;
    }
  }
  delegCache.set(rel, hit);
  return hit;
}
// -> [{route, action?, file, delegatesTo}] for anchors that land in a delegating file
//    while no `renders` is recorded for them
function lintDelegation(graph, appRoot) {
  const out = [];
  for (const s of (graph || [])) {
    const screenRenders = s.renders ? validateAnchor(s.renders, appRoot, {}) : null;
    const screenHasRenders = !!(screenRenders && screenRenders.ok);
    for (const a of (s.actions || [])) {
      const raw = a.impl || a.file;
      if (!raw) continue;
      const v = validateAnchor(raw, appRoot, { symbol: a.symbol, feature: a.feature });
      if (!v || !v.ok || !v.rel) continue;
      const target = delegatesTo(appRoot, v.rel);
      if (!target) continue;
      const actionHasRenders = !!(a.renders && (validateAnchor(a.renders, appRoot, {}) || {}).ok);
      if (actionHasRenders || screenHasRenders) continue;
      out.push({ route: s.route, action: a.action, file: v.rel, delegatesTo: target });
    }
  }
  return out;
}

// ---------------------------------------------------------------- whole graph
function validateGraph(graph, appRoot, opts) {
  const o = opts || {};
  const findings = [], index = {};
  const stat = { total: 0, ok: 0, exact: 0, near: 0, resolved: 0, fileonly: 0, unchecked: 0, weak: 0,
                 absent: 0, prose: 0, missing: 0, ambiguous: 0, range: 0, outside: 0, unparsable: 0 };
  const check = (raw, ctx, symbol) => {
    if (raw == null || raw === '') return;
    stat.total++;
    const v = validateAnchor(raw, appRoot, { symbol, snap: o.snap !== false });
    findings.push(Object.assign({}, ctx, v));
    if (v.ok) stat.ok++;
    stat[v.status] = (stat[v.status] || 0) + 1;
    index[raw] = { status: v.status, why: v.why || '', value: v.value || '' };
  };
  for (const s of (graph || [])) {
    check(s.renders, { route: s.route, field: 'renders', kind: 'screen' }, null);
    for (const a of (s.actions || [])) {
      check(a.file,    { route: s.route, action: a.action, field: 'file',    kind: 'action' }, { symbol: a.symbol, feature: a.feature });
      check(a.impl,    { route: s.route, action: a.action, field: 'impl',    kind: 'action' }, { symbol: a.symbol, feature: a.feature });
      check(a.renders, { route: s.route, action: a.action, field: 'renders', kind: 'action' }, null);
    }
  }
  return { findings, index, stat };
}

// Rewrite a graph in place with the verdicts:
//   trusted    -> replaced with the resolved/snapped "rel:line" (or "rel" when line-less)
//   prose      -> moved OUT of the anchor field into `<field>Note` (it is an explanation,
//                 not a location — showing it as a code hint is what made the export lie)
//   broken     -> deleted
function applyVerdicts(graph, appRoot, opts) {
  const o = opts || {};
  const res = { fixed: [], moved: [], dropped: [] };
  const fix = (obj, field, ctx, sym) => {
    const raw = obj[field];
    if (raw == null || raw === '') return;
    const s = sym || {};
    const v = validateAnchor(raw, appRoot, { symbol: s.symbol, feature: s.feature, snap: o.snap !== false });
    if (!v) return;
    if (v.ok) {
      // keep the symbol on the anchor ("src/x.ts:198 (handleSubmit)"): the format round-trips
      // through findRefs, so the NEXT verify can still confirm the line points at the function
      // instead of degrading to "unchecked". A repair that erases its own evidence is not a repair.
      const out = v.value + (v.symTail || '');
      if (out !== raw) res.fixed.push(Object.assign({ field, from: raw, to: out, status: v.status }, ctx));
      obj[field] = out;
      return;
    }
    if (v.status === 'prose') {
      obj[field + 'Note'] = v.note;                  // keep the information, lose the false precision
      delete obj[field];
      res.moved.push(Object.assign({ field, text: v.note }, ctx));
      return;
    }
    delete obj[field];
    res.dropped.push(Object.assign({ field, raw, status: v.status, why: v.why }, ctx));
  };
  for (const s of (graph || [])) {
    fix(s, 'renders', { route: s.route, kind: 'screen' }, null);
    for (const a of (s.actions || [])) {
      fix(a, 'file',    { route: s.route, action: a.action, kind: 'action' }, { symbol: a.symbol, feature: a.feature });
      fix(a, 'impl',    { route: s.route, action: a.action, kind: 'action' }, { symbol: a.symbol, feature: a.feature });
      fix(a, 'renders', { route: s.route, action: a.action, kind: 'action' }, null);
    }
  }
  return res;
}

module.exports = {
  findRefs, parseAnchor, relTo, resolveFile, validateAnchor, validateGraph, applyVerdicts,
  lintDelegation, delegatesTo,
  countLines, symbolsOf, isCodeIdent, TRUSTED, SUSPECT, WEAK, SNAP_WINDOW,
};
