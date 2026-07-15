// flow-debugger: when a screen file changes, is it just DRIFT (lines moved) or did the STRUCTURE
// change (a button/screen/nav/server call added or removed)?
//
// This is the distinction /flow-update must make. rebase-anchors follows what EXISTS — a line that
// shifted, a file that moved. It is blind to what is NEW: a button added to a screen has no anchor
// to follow, so rebase reports the screen "clean" while the flow map is now missing a button.
// Guessing that button into existence would be a fabricated node — the exact failure this tool
// forbids. So the honest move is: DETECT that the structure likely changed, and send that screen
// back for a real re-scan (a human confirms first — see the /flow-update command).
//
// How we tell them apart, from code alone: count the STRUCTURAL MARKERS in the file at the map's
// commit vs now. If the number of buttons / navigations / server calls / AI calls, or the set of
// route targets and tables touched, changed at all — the structure moved, re-scan. If every count
// is identical (only whitespace / comments / styles / renamed locals moved) — it is drift, rebase
// is enough.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { checkStale } = require('./fingerprint');

// A user-facing ACTION on a screen almost always shows up as one of these. The lists are broad on
// purpose — a marker this misses is a new button that silently never enters the map, and re-scan is
// human-gated, so the safe bias is to over-detect structure. (Verified against RN/Expo + web idioms.)
const M = {
  // taps, inputs, list callbacks, gesture handlers — and shared action wrappers that take a
  // SEMANTIC prop instead of a literal onPress (this app renders actions through <Action .../>).
  button: new RegExp([
    '\\bon(?:Press|PressIn|PressOut|Click|Change|ChangeText|Submit|LongPress|ValueChange|Toggle|Select|EndEditing|EndReached|Refresh|ScrollEndDrag|MomentumScrollEnd)\\b\\s*=',
    '(?<![\\w.])<(?:Pressable|Button|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Switch|Checkbox|Radio|Slider|RectButton|BorderlessButton|BaseButton|GestureDetector|TapGestureHandler|PanGestureHandler|LongPressGestureHandler)(?=[\\s/>])',
    '\\bGesture\\.(?:Tap|Pan|LongPress|Fling|Pinch|Rotation|Hover|Native|Manual)\\s*\\(',
    '\\bonGestureEvent\\s*=|\\brefreshControl\\s*=',
    '(?<![\\w.])<(?:Action|NavRow|MenuItem|ListRow|ListItem|Cell|Row|Tile|OptionRow)\\b[^>]*?\\b(?:onPress|onTap|onSelect|to|route|screen|href)\\s*=',
  ].join('|'), 'g'),
  // router / react-navigation, aliased hooks, external links.
  nav: new RegExp([
    '\\brouter\\.(?:push|replace|navigate|back)\\b',
    '\\bnavigation\\.(?:navigate|push|replace|goBack)\\b',
    '\\bnavigate\\s*\\(',                                     // const {navigate}=useNavigation()
    '\\buse(?:Router|Navigation|LinkTo)\\s*\\(',
    '<Redirect\\b|\\bhref\\s*=',
    '\\bLinking\\.(?:openURL|sendIntent)\\b|\\bWebBrowser\\.openBrowserAsync\\b',
  ].join('|'), 'g'),
  // db/query chains, edge functions, realtime, auth, http clients, data hooks. `.from(` is only
  // a table read when its arg is a STRING (Array.from takes an iterable) — that discriminates it
  // from the Array/Set/Map built-ins the old bare `.from(`/`.select(` collided with.
  server: new RegExp([
    '\\.\\s*from\\s*\\(\\s*[\'"`]',
    '\\.\\s*rpc\\s*\\(|\\.\\s*functions\\s*\\.\\s*invoke\\s*\\(',
    '\\.\\s*channel\\s*\\(|\\.\\s*subscribe\\s*\\(|\\bnew\\s+(?:WebSocket|EventSource)\\b|\\bio\\s*\\(',
    '\\.\\s*auth\\.\\s*(?:signIn\\w*|signOut|signUp|getUser|getSession|verifyOtp|resetPasswordForEmail)\\s*\\(',
    '\\.\\s*storage\\.\\s*from\\s*\\(',
    '\\bfetch\\s*\\(|\\b\\$fetch\\s*\\(',
    '\\bprisma\\.\\w+\\.\\w+',
    '\\baxios\\.(?:get|post|put|patch|delete|create)\\b|\\b(?:api|http|apiClient|httpClient|request)\\.(?:get|post|put|patch|delete)\\s*\\(|\\bky\\.(?:get|post|put|patch|delete)\\s*\\(',
    '\\buse(?:Query|Mutation|InfiniteQuery|SuspenseQuery|SWR|SWRMutation|SWRInfinite|LazyQuery|Subscription)\\s*\\(',
    '\\.\\s*(?:mutate|mutateAsync|refetch|fetchMore)\\s*\\(|\\bclient\\.(?:query|mutate)\\s*\\(',
  ].join('|'), 'g'),
  ai: new RegExp([
    '\\bmessages\\.(?:create|stream)\\b|\\bchat\\.completions\\b',
    '\\bgenerateContent\\b|\\bembedContent\\b',
    '\\b(?:generateText|streamText|generateObject|streamObject|streamUI)\\s*\\(',
    '\\buse(?:Chat|Completion|Object|Assistant)\\s*\\(',
    '\\bresponses\\.(?:create|stream)\\b|\\breplicate\\.run\\b',
    '\\bcallGemini\\b|\\bcallAI\\b|\\bcallLLM\\b',
    'generativelanguage\\.googleapis\\.com|api\\.(?:openai|anthropic)\\.com',
  ].join('|'), 'g'),
};
// The DISTINCT destinations / tables / edge functions — a button repointed to a new screen, a new
// table touched, or an edge function swapped is structural even when the raw counts match.
const ROUTE_STR = /(?:router\.(?:push|replace|navigate)|navigation\.(?:navigate|push|replace)|href\s*=)\s*[({]?\s*["'`]([^"'`]{1,60})["'`]|pathname\s*:\s*["'`]([^"'`]{1,60})["'`]/g;
const TABLE_STR = /\bfrom\s*\(\s*["'`](\w{2,40})["'`]|\bprisma\.(\w{2,40})\.|\brpc\s*\(\s*["'`]([\w-]{2,40})["'`]|\bfunctions\.invoke\s*\(\s*["'`]([\w-]{2,40})["'`]/g;

// A marker token inside a COMMENT or a plain STRING is not a call. Strip both before counting M
// (this kills the largest false-positive class: a documentary comment mentioning router.push, or an
// href sitting inside an HTML template string). Template literals are left intact — they can hold
// real `${code}`. Route/table extraction runs on comment-stripped-but-string-intact source, since
// those legitimately read a string argument.
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}
function blankStrings(src) {
  return src.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

const count = (src, re) => { re.lastIndex = 0; let n = 0; while (re.exec(src)) n++; return n; };
function setOf(src, re) {
  re.lastIndex = 0; const s = new Set(); let m;
  while ((m = re.exec(src))) { const v = m[1] || m[2] || m[3] || m[4]; if (v) s.add(v); }
  return s;
}
const symDiff = (a, b) => [...a].filter(x => !b.has(x)).concat([...b].filter(x => !a.has(x)));

// -> {markers:{button:{old,now,delta},...}, routesChanged:[], tablesChanged:[], structural:bool, why:[]}
function classifyFile(oldSrc, newSrc) {
  const oldCode = blankStrings(stripComments(oldSrc)), newCode = blankStrings(stripComments(newSrc));
  const oldStr = stripComments(oldSrc), newStr = stripComments(newSrc);
  const markers = {}; const why = [];
  for (const [k, re] of Object.entries(M)) {
    const o = count(oldCode, re), n = count(newCode, re);
    markers[k] = { old: o, now: n, delta: n - o };
    if (o !== n) why.push(`${k} ${o}→${n}`);
  }
  const routesChanged = symDiff(setOf(oldStr, ROUTE_STR), setOf(newStr, ROUTE_STR));
  const tablesChanged = symDiff(setOf(oldStr, TABLE_STR), setOf(newStr, TABLE_STR));
  if (routesChanged.length) why.push(`이동 대상 변경: ${routesChanged.slice(0, 4).join(', ')}`);
  if (tablesChanged.length) why.push(`테이블 변경: ${tablesChanged.slice(0, 4).join(', ')}`);
  const structural = why.length > 0;
  return { markers, routesChanged, tablesChanged, structural, why };
}

// Which routes does a file belong to? (any screen whose renders/actions anchor into it)
function fileToRoutes(graph) {
  const idx = {};
  const add = (raw, route) => {
    if (typeof raw !== 'string') return;
    const f = raw.replace(/\s*\(.*$/, '').replace(/:\d+.*$/, '').trim();
    if (!f) return; (idx[f] = idx[f] || new Set()).add(route);
  };
  for (const s of (graph || [])) {
    add(s.renders, s.route);
    for (const a of (s.actions || [])) { add(a.file, s.route); add(a.impl, s.route); }
  }
  return idx;
}

// The whole picture for /flow-update: per changed screen, drift vs re-scan; plus new & deleted.
function classifyChanges(graph, appRoot, opts) {
  const o = opts || {};
  const fpPath = o.fingerprintPath;
  const fp = fpPath && fs.existsSync(fpPath) ? JSON.parse(fs.readFileSync(fpPath, 'utf8')) : o.fingerprint;
  if (!fp) throw new Error('need a fingerprint (the map must have been built with build.js/make-handoff)');
  const base = fp.git && fp.git.head;
  const stale = checkStale(fp, appRoot);
  const routesOf = fileToRoutes(graph);

  const git = args => { try { return execFileSync('git', args, { cwd: appRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
  const readNow = rel => { try { return fs.readFileSync(path.join(appRoot, rel), 'utf8'); } catch (e) { return null; } };
  const readOld = rel => (base ? git(['show', `${base}:${rel}`]) : null);

  const drift = [], rescan = [], deleted = [];
  for (const rel of stale.changed) {
    const oldSrc = readOld(rel), newSrc = readNow(rel);
    const routes = [...(routesOf[rel] || ['(?)'])];
    if (oldSrc == null || newSrc == null) { rescan.push({ file: rel, routes, why: ['옛 버전을 못 읽어 대조 불가 — 안전하게 재스캔'] }); continue; }
    const c = classifyFile(oldSrc, newSrc);
    (c.structural ? rescan : drift).push({ file: rel, routes, why: c.why, markers: c.markers });
  }
  for (const rel of stale.gone) deleted.push({ file: rel, routes: [...(routesOf[rel] || ['(?)'])] });

  return {
    fresh: !stale.stale,
    builtFrom: base ? String(base).slice(0, 8) : null,
    drift,            // coordinates moved; /flow-update (rebase) handles these
    rescan,           // structure likely changed; these screens need a real re-scan
    deleted,          // anchored file gone; remove those screens
    counts: { drift: drift.length, rescan: rescan.length, deleted: deleted.length },
  };
}

module.exports = { classifyChanges, classifyFile, fileToRoutes };
