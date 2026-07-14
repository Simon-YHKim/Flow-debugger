// flow-debugger: what is BEHIND the screen.
//
// The map used to stop at the tag. A screen calls `edge:gemini-proxy` — and then nothing. What
// that function does, which tables it writes, whether an RLS policy will refuse it: invisible.
// So "system flow" was really "screen flow with the server's name written on a card".
//
// This walks the server side and links it up, so one graph runs:
//
//     화면 → 동작 → [edge:send-mail] → 그 함수가 하는 일 → [db:orders:insert] → orders 테이블 → RLS
//
// GENERALITY: no product's layout is assumed. Server handlers are found wherever the ecosystem
// puts them (Supabase edge functions, Next route handlers, Express/Fastify routers, Cloud/Lambda
// functions), and the schema wherever it lives (SQL migrations, Prisma, Drizzle).
const fs = require('fs');
const path = require('path');

const SKIP = new Set(['node_modules', '.git', '.expo', 'dist', 'build', 'coverage', '.next', 'out',
  'android', 'ios', '.worktrees', 'vendor', '__pycache__']);

function walk(root, dir, out, depth) {
  if ((depth || 0) > 8) return out;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, p, out, (depth || 0) + 1);
    else out.push(path.relative(root, p).replace(/\\/g, '/'));
  }
  return out;
}
const read = (root, rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return null; } };

// Where a server handler lives, across the common ecosystems.
const HANDLER_DIR = [
  [/^supabase\/functions\/([^/]+)\/index\.tsx?$/i, m => ({ kind: 'edge', name: m[1] })],
  [/^(?:src\/)?app\/api\/(.+)\/route\.[tj]sx?$/i, m => ({ kind: 'route', name: '/api/' + m[1] })],
  [/^(?:src\/)?pages\/api\/(.+)\.[tj]sx?$/i, m => ({ kind: 'route', name: '/api/' + m[1] })],
  [/^(?:src\/)?(?:server|api|backend)\/(?:routes?|handlers?|controllers?)\/(.+)\.[tj]s$/i, m => ({ kind: 'route', name: m[1] })],
  [/^functions\/([^/]+)\/index\.[tj]s$/i, m => ({ kind: 'fn', name: m[1] })],
  [/^netlify\/functions\/([^/]+)\.[tj]s$/i, m => ({ kind: 'fn', name: m[1] })],
];

// What a handler touches. Same recognisers as the client, plus server-only shapes.
const TOUCH = [
  [/\bfrom\(\s*['"]([\w.]+)['"]\s*\)\s*\.\s*(select|insert|update|delete|upsert)/g, m => ({ table: m[1], op: m[2] })],
  [/\bprisma\.(\w+)\.(findMany|findUnique|findFirst|create|createMany|update|updateMany|upsert|delete|deleteMany|count)/g,
    m => ({ table: m[1], op: m[2] })],
  [/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|SELECT[\s\S]{0,80}?FROM)\s+["'`]?(\w+)/gi, m => ({ table: m[1], op: 'sql' })],
  [/\brpc\(\s*['"]([\w.]+)['"]/g, m => ({ rpc: m[1] })],
];
const CALLS_OUT = /\bfetch\(\s*[`'"]([^`'"]{4,60})/g;
// `SELECT ... FROM if (...)` is control flow, not a table. A schema list with a table called
// "if" in it is the kind of small wrongness that makes a reader distrust the rest of the map.
const SQL_NOISE = new Set(['if', 'case', 'when', 'select', 'where', 'and', 'or', 'not', 'null',
  'true', 'false', 'set', 'values', 'exists', 'only', 'table']);

function indexHandlers(appRoot) {
  const files = walk(appRoot, appRoot, [], 0);
  const out = {};
  for (const f of files) {
    let hit = null;
    for (const [re, mk] of HANDLER_DIR) { const m = f.match(re); if (m) { hit = mk(m); break; } }
    if (!hit) continue;
    const src = read(appRoot, f);
    if (!src) continue;
    const tables = new Map(), rpcs = new Set(), outbound = new Set();
    for (const [re, mk] of TOUCH) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(src))) {
        const r = mk(m);
        if (r.table && !SQL_NOISE.has(String(r.table).toLowerCase())) { const k = r.table; const s = tables.get(k) || new Set(); s.add(r.op); tables.set(k, s); }
        if (r.rpc) rpcs.add(r.rpc);
      }
    }
    CALLS_OUT.lastIndex = 0; let m2;
    while ((m2 = CALLS_OUT.exec(src))) {
      const u = m2[1];
      if (/^https?:\/\//.test(u)) { try { outbound.add(new URL(u).host); } catch (e) { /* template literal */ } }
    }
    // an auth guard on the way in is the difference between "anyone" and "signed-in users"
    const guarded = /\b(getUser|verifyJwt|requireAuth|authorization|Authorization|jwt|session)\b/.test(src);
    out[hit.name] = {
      kind: hit.kind, file: f + ':1', lines: src.split('\n').length,
      tables: Object.fromEntries([...tables].map(([k, v]) => [k, [...v]])),
      rpcs: [...rpcs], outbound: [...outbound], guarded,
    };
  }
  return out;
}

// The schema, wherever it lives. We want table names, and — because it is the single most common
// reason a call fails in a way the client cannot explain — whether RLS is on.
function indexSchema(appRoot) {
  const files = walk(appRoot, appRoot, [], 0);
  const tables = {};
  const sql = files.filter(f => /\.sql$/i.test(f) && /(migration|schema|sql)/i.test(f));
  for (const f of sql) {
    const src = read(appRoot, f); if (!src) continue;
    let m;
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["`]?(\w+)["`]?/gi;
    while ((m = createRe.exec(src))) {
      if (!SQL_NOISE.has(m[1].toLowerCase())) tables[m[1]] = tables[m[1]] || { definedIn: f, rls: false, policies: [] };
    }
    const rlsRe = /alter\s+table\s+(?:public\.)?["`]?(\w+)["`]?\s+enable\s+row\s+level\s+security/gi;
    while ((m = rlsRe.exec(src))) { tables[m[1]] = tables[m[1]] || { definedIn: f, policies: [] }; tables[m[1]].rls = true; }
    const polRe = /create\s+policy\s+["`']?([^"'`\n]+)["`']?\s+on\s+(?:public\.)?["`]?(\w+)["`]?/gi;
    while ((m = polRe.exec(src))) {
      tables[m[2]] = tables[m[2]] || { definedIn: f, rls: true, policies: [] };
      tables[m[2]].policies.push(m[1].trim().slice(0, 60));
    }
  }
  // Prisma / Drizzle
  const prisma = files.find(f => /prisma\/schema\.prisma$/i.test(f));
  if (prisma) {
    const src = read(appRoot, prisma) || '';
    let m; const re = /^model\s+(\w+)\s*\{/gm;
    while ((m = re.exec(src))) tables[m[1]] = tables[m[1]] || { definedIn: prisma, rls: false, policies: [] };
  }
  for (const f of files.filter(x => /(drizzle|schema)\.[tj]s$/i.test(x))) {
    const src = read(appRoot, f) || '';
    let m; const re = /\b(?:pgTable|mysqlTable|sqliteTable)\(\s*['"](\w+)['"]/g;
    while ((m = re.exec(src))) tables[m[1]] = tables[m[1]] || { definedIn: f, rls: false, policies: [] };
  }
  return tables;
}

// Link the client's api tags to what we just found.
//   edge:gemini-proxy  -> handlers["gemini-proxy"]
//   db:orders:insert   -> tables["orders"]
//   rest:POST:/api/x   -> handlers["/api/x"]
function scanBackend(appRoot, graph) {
  const handlers = indexHandlers(appRoot);
  const tables = indexSchema(appRoot);
  const tags = new Set();
  (graph || []).forEach(s => (s.actions || []).forEach(a => (a.apis || []).forEach(t => tags.add(t))));

  const links = {};   // tag -> {handler?, table?, op?}
  for (const tag of tags) {
    const [kind, ...rest] = String(tag).split(':');
    if (kind === 'edge' || kind === 'fn') {
      const h = rest[0]; if (handlers[h]) links[tag] = { handler: h };
    } else if (kind === 'db') {
      const t = rest[0]; links[tag] = { table: t, op: rest[1] || '', known: !!tables[t] };
    } else if (kind === 'rpc') {
      const r = rest[0];
      const owner = Object.entries(handlers).find(([, v]) => (v.rpcs || []).includes(r));
      links[tag] = { rpc: r, handler: owner ? owner[0] : null };
    } else if (kind === 'rest' || kind === 'http') {
      const p = rest.slice(1).join(':');
      const h = Object.keys(handlers).find(x => p.includes(x));
      if (h) links[tag] = { handler: h };
    }
  }
  return { handlers, tables, links,
    counts: { handlers: Object.keys(handlers).length, tables: Object.keys(tables).length, linked: Object.keys(links).length } };
}

module.exports = { scanBackend, indexHandlers, indexSchema };
