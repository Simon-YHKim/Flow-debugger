// flow-debugger: reachability + helper-capability analysis.
//
// Two of the five root causes of a real, badly-wrong map were things NO amount of careful
// reading by a language model was going to fix, because they are not visible in the file the
// model was asked to read. They are visible to a grep. So a script does them, once, and hands
// the answer to every reader.
//
// 1. REACHABILITY — "does a user ever get here?"
//    A scan read `onPress={() => setCaptured(true)}` correctly, saw that it saves nothing, and
//    reported to a non-developer: "your 담기 button is fake, you are losing data." The route is
//    wrapped in DevOnlyRoute and redirects to / in production. Nobody can reach that button.
//    The code was read right and the conclusion was wrong, because "what does this code do" and
//    "can a user reach this code" are different questions and only the first was asked.
//    4 of the run's 21 bug claims were this.
//
// 2. HELPER CAPABILITIES — "what does this innocent-looking call actually do?"
//    A screen contains one line: `createRecord(...)`. Inside, that helper calls Gemini to embed
//    the text. Reading the screen file can never reveal it, so the map said "no AI" for the two
//    screens where the app's audit-logged AI path actually runs. 66 server calls and 7 AI calls
//    went missing this way.
//
// Both produce a JSON the SCAN prompt embeds, so the reader is told rather than expected to
// discover. Deterministic, one pass, no tokens.

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'build', 'coverage',
  '.next', 'out', 'android', 'ios', '.worktrees', 'vendor', '__pycache__']);
const SRC_EXT = /\.(tsx?|jsx?|mjs|cjs|vue|svelte)$/i;

function walk(root, dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, p, out);
    else if (SRC_EXT.test(e.name)) out.push(path.relative(root, p).replace(/\\/g, '/'));
  }
  return out;
}
const readLines = (root, rel) => {
  try { return fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n').split('\n'); }
  catch (e) { return null; }
};

// ---------------------------------------------------------------- gates
// A gate makes a screen unreachable, or reachable only under a condition. If the scan does not
// record it, a "bug" on the other side of it is a lie told to someone who cannot check.
// Only gates that can make a screen INVISIBLE to a normal production user. "Requires login"
// is not one of them — that is normal, it is already a risk marker, and flagging it on 63 of
// 86 screens turns the signal into wallpaper. What we are hunting is the screen a real user
// cannot open at all, because a bug reported there is a false alarm.
const GATE_PATTERNS = [
  [/\bDevOnly\w*\b|\b__DEV__\b|process\.env\.NODE_ENV\s*[!=]==?\s*['"]development['"]/, 'dev-only',
   '개발 전용 — 배포판에서는 열리지 않아요'],
  [/\b(isAdmin|adminOnly|requireAdmin)\b|role\s*===\s*['"]admin['"]/, 'admin',
   '관리자만 열 수 있어요'],
  [/\b(featureFlag|useFeatureFlag|isFeatureEnabled|remoteConfig)\b|\bflags?\.[A-Za-z_$][\w$]*\s*(?:===|!==|\?)/, 'flag',
   '기능 플래그가 켜져야 열려요'],
  [/\brequire(?:Pro|Premium|Tier|Subscription)\b|\b(isPro|isPremium|hasEntitlement)\b\s*(?:\?|&&|\|\||===|!==)/, 'tier',
   '등급/구독이 있어야 열려요'],
];
// …and it only counts as a gate if it GUARDS the screen: an early return / redirect in the
// first frames of the component, not a mention somewhere in the body.
const GUARD_SHAPE = /\b(?:if|when)\s*\([^)]{0,120}\)\s*\{?\s*(?:return|redirect|router\.(?:replace|push))|<\s*(?:DevOnly|Admin|Gated|Paywall)\w*/;

// -> {"/route": {gate, why, evidence}}
// Where does this route's own file live? The anchors point at the components that DO the work
// (often the delegated ones), so the route file — the very place the gate is written — was
// never even opened. 4 of the app's 5 dev-only routes were missed that way, including the one
// the false "you are losing data" report was filed against.
function routeFiles(appRoot, route) {
  const base = String(route || '').replace(/^\/+/, '') || 'index';
  const slug = base.replace(/\[([^\]]+)\]/g, '[$1]');
  const dirs = ['src/app', 'app', 'src/pages', 'pages', 'src/screens', 'src/routes', 'src/views'];
  const exts = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte'];
  const out = [];
  for (const d of dirs) for (const e of exts) {
    for (const cand of [`${d}/${slug}${e}`, `${d}/${slug}/index${e}`]) {
      try { if (fs.statSync(path.join(appRoot, cand)).isFile()) out.push(cand); } catch (err) { /* not there */ }
    }
  }
  return out;
}
function scanGates(appRoot, graph) {
  const out = {};
  for (const s of (graph || [])) {
    // the ROUTE file first — that is where a guard is written — then whatever the anchors name
    const files = routeFiles(appRoot, s.route);
    if (s.renders) { const f = String(s.renders).split(/[\s(]/)[0].split(':')[0]; if (f && !files.includes(f)) files.push(f); }
    for (const a of (s.actions || [])) {
      const f = String(a.file || '').split(/[\s(]/)[0].split(':')[0];
      if (f && !files.includes(f)) files.push(f);
    }
    for (const f of files) {
      const lines = readLines(appRoot, f);
      if (!lines) continue;
      for (const [re, gate, why] of GATE_PATTERNS) {
        // the gate must be in a guard position — a wrapper element or an early return.
        // A mention of __DEV__ inside a logging call is not a gate.
        let li = -1;
        for (let i = 0; i < Math.min(lines.length, 120); i++) {
          if (!re.test(lines[i])) continue;
          const ctx = lines.slice(Math.max(0, i - 1), i + 3).join('\n');
          if (GUARD_SHAPE.test(ctx) || /^\s*(?:export\s+default\s+)?(?:function|const)\b/.test(lines[i])) { li = i; break; }
        }
        if (li < 0) continue;
        out[s.route] = { gate, why, evidence: f + ':' + (li + 1), line: (lines[li] || '').trim().slice(0, 100) };
        break;
      }
      if (out[s.route]) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- helper capabilities
// What a helper REALLY does. `createRecord()` looks like a plain save and calls an embedding
// model three frames down.
const CAP_PATTERNS = [
  [/\.from\(\s*['"]([\w.]+)['"]\s*\)\s*\.\s*(select|insert|update|delete|upsert)/g, (m) => `db:${m[1]}:${m[2]}`],
  [/\.rpc\(\s*['"]([\w.]+)['"]/g, (m) => `rpc:${m[1]}`],
  [/functions\.invoke\(\s*['"]([\w.-]+)['"]/g, (m) => `edge:${m[1]}`],
  [/storage\.from\(\s*['"]([\w.-]+)['"]/g, (m) => `storage:${m[1]}`],
  [/\bauth\.(signIn\w*|signUp|signOut|getSession|getUser|resetPasswordForEmail|updateUser)/g, (m) => `auth:${m[1]}`],
  [/\bfetch\(\s*[`'"]([^`'"]+)[`'"]/g, (m) => `http:${m[1].slice(0, 48)}`],
];
// `classify\w*` / `transcribe\w*` matched ordinary error-classifier functions and marked them
// as AI — a handoff that says a URL cleaner calls a language model is worse than no handoff,
// because the reader stops trusting the whole file. Name the ACTUAL entry points; the call-graph
// propagation below finds everything downstream of them (that is how `createRecord()` is caught).
const AI_PATTERNS = new RegExp(
  '\\b(callGemini|callAdvisor|embedTexts|embedAndStoreRecord|transcribeAudio|generateContent' +
  '|createCompletion|generateText|invokeModel)\\b' +
  '|\\b(openai|anthropic|genai|GoogleGenAI)\\s*\\.' +
  '|chat\\.completions'
);

// Every exported function in the app's non-screen source, with the capabilities its BODY uses.
// -> {fnName: {file, line, apis:[], ai:bool, callees:[]}}
function indexHelpers(appRoot, opts) {
  const o = opts || {};
  const files = walk(appRoot, appRoot, []).filter(f =>
    /^(src\/)?(lib|services?|api|data|db|utils?|hooks|store|features)\//i.test(f) ||
    (/^src\//.test(f) && !/^src\/(app|screens|pages|components|views|routes)\//i.test(f)));
  const idx = {};
  for (const f of files.slice(0, o.maxFiles || 600)) {
    const lines = readLines(appRoot, f);
    if (!lines) continue;
    // crude but sufficient: an exported function's body runs until the next export at col 0
    const starts = [];
    lines.forEach((l, i) => {
      const m = l.match(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/) ||
                l.match(/^export\s+const\s+([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?\(/);
      if (m) starts.push({ name: m[1], line: i + 1 });
    });
    starts.forEach((st, k) => {
      // bound the body: the next export, a top-level close, or 200 lines — whichever comes first.
      // The last export used to swallow the rest of the file and inherit its calls.
      let end = k + 1 < starts.length ? starts[k + 1].line - 1 : lines.length;
      for (let i = st.line; i < Math.min(end, st.line + 200); i++) {
        if (/^}/.test(lines[i] || '')) { end = i + 1; break; }
      }
      end = Math.min(end, st.line + 200);
      const body = lines.slice(st.line - 1, end).join('\n');
      const apis = new Set();
      for (const [re, mk] of CAP_PATTERNS) {
        re.lastIndex = 0;
        let m; while ((m = re.exec(body))) apis.add(mk(m));
      }
      const ai = AI_PATTERNS.test(body);
      // Which other helpers does it call? Propagating through EVERY lowercase call was how
      // `normalizeAnalyticsUrl()` (a URL string cleaner) ended up listed as calling an AI:
      // a name collision with some indexed helper. A callee only counts if this file actually
      // IMPORTS it, or defines it — otherwise it is a different function with the same name.
      const imported = new Set();
      const importRe = /import\s+(?:type\s+)?\{([^}]+)\}|import\s+(\w+)\s+from/g;
      let im;
      const headTxt = lines.slice(0, 60).join('\n');
      while ((im = importRe.exec(headTxt))) {
        (im[1] || im[2] || '').split(',').forEach(x => {
          const n = x.trim().split(/\s+as\s+/).pop().trim();
          if (n) imported.add(n);
        });
      }
      const localNames = new Set(starts.map(x => x.name));
      const callees = [...new Set((body.match(/\b([A-Za-z_$][\w$]{2,})\s*\(/g) || [])
        .map(x => x.replace(/\s*\($/, '')))]
        .filter(x => x !== st.name && (imported.has(x) || localNames.has(x)));
      idx[st.name] = { file: f + ':' + st.line, apis: [...apis], ai, callees: callees.slice(0, 16) };
    });
  }
  // propagate: a helper that calls a helper that hits the DB/AI, hits the DB/AI too.
  // (This is what surfaces `createRecord()` -> embedding model, which no screen file shows.)
  for (let pass = 0; pass < 3; pass++) {
    for (const name of Object.keys(idx)) {
      const h = idx[name];
      for (const c of (h.callees || [])) {
        const t = idx[c];
        if (!t || t === h || !Array.isArray(t.apis)) continue;
        const before = h.apis.length + (h.ai ? 1 : 0);
        t.apis.forEach(a => { if (!h.apis.includes(a)) h.apis.push(a); });
        if (t.ai) h.ai = true;
        if (h.apis.length + (h.ai ? 1 : 0) !== before) h.via = h.via || c;
      }
    }
  }
  // only keep the ones that actually DO something — the rest are noise for a prompt
  const useful = {};
  for (const [k, v] of Object.entries(idx)) if (v.apis.length || v.ai) useful[k] = v;
  return useful;
}

// ---------------------------------------------------------------- production render path
// "which of these two components does the user actually see?" — the question the scan could
// not answer, so it described the dead one. Find the app-wide delegation switch.
// Do NOT take the first plausibly-named function in lib/ — that picked `isCaptureDraftMode()`
// on a real app whose actual switch is `isDeepSpaceUI()`, i.e. it named the wrong thing with
// full confidence, which is the exact failure this module exists to stop. Instead find the
// function that ROUTE FILES actually branch on, and rank by how many of them do.
function detectRenderMode(appRoot) {
  const routes = walk(appRoot, appRoot, []).filter(f => /^(src\/)?(app|pages|routes)\//i.test(f));
  const votes = new Map();       // fnName -> {count, sample}
  for (const f of routes) {
    const lines = readLines(appRoot, f);
    if (!lines) continue;
    const head = lines.slice(0, 60).join('\n');
    // `if (isXxx()) return <Yyy…` / `return isXxx() ? <A/> : <B/>`
    const re = /(?:if\s*\(\s*([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\)\s*\{?\s*return\s*\(?\s*<?\s*([A-Z][\w.]*)|return\s*\(?\s*([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\?\s*<?\s*([A-Z][\w.]*))/g;
    let m;
    while ((m = re.exec(head))) {
      const fn = m[1] || m[3], target = m[2] || m[4];
      if (!fn || !target) continue;
      const v = votes.get(fn) || { count: 0, targets: new Set(), sample: f };
      v.count++; v.targets.add(target);
      votes.set(fn, v);
    }
  }
  if (!votes.size) return null;
  const [fn, v] = [...votes.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  // where is it defined, and what does it default to?
  let file = null, dflt = null;
  for (const f of walk(appRoot, appRoot, []).filter(x => /^(src\/)?(lib|config|utils?|hooks)\//i.test(x))) {
    const lines = readLines(appRoot, f);
    if (!lines) continue;
    const i = lines.findIndex(l => new RegExp('export\\s+(?:function|const)\\s+' + fn + '\\b').test(l));
    if (i < 0) continue;
    file = f + ':' + (i + 1);
    const body = lines.slice(i, i + 14).join('\n');
    const d = body.match(/!==\s*['"]([\w-]+)['"]|===\s*['"]([\w-]+)['"]|\?\?\s*['"]([\w-]+)['"]|\|\|\s*['"]([\w-]+)['"]/);
    if (d) dflt = d.slice(1).find(Boolean);
    break;
  }
  return { fn, file: file || '(정의 위치 미상)', routes: v.count,
    targets: [...v.targets].slice(0, 6),
    note: `라우트 파일 ${v.count}개가 ${fn}() 로 갈라진다 → 사용자가 보는 화면은 ${fn}() 가 고르는 쪽` +
          (dflt ? ` (기본값으로 보이는 값: ${dflt})` : '') };
}

module.exports = { scanGates, indexHelpers, detectRenderMode, walk };
