// code-graph · lib/bridges.mjs — puentes entre lenguajes por HTTP: rutas del servidor ↔ llamadas del cliente.
// Heurístico: compara método + ruta normalizada. Devuelve aristas kind:'bridge'.

const METHODS = 'get|post|put|delete|patch';
const norm = (u) => {
  let p = u.replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/[?#].*$/, '');
  p = p.replace(/\$\{[^}]*\}|\{[^}]*\}|<[^>]*>|:\w+|\[[^\]]*\]/g, ':p').replace(/\/+/g, '/').replace(/^\/|\/$/g, '').toLowerCase();
  return p;
};
const line = (raw, idx) => raw.slice(0, idx).split('\n').length;

function routesOf(raw, lang, id) {
  const out = [], add = (m, method, path, idx) => path && out.push({ method: method.toUpperCase(), path: norm(path), line: line(raw, idx) });
  let m;
  for (const x of raw.matchAll(new RegExp(`\\b(?:app|router|server|api)\\.(${METHODS})\\(\\s*['"\`]([^'"\`]+)`, 'gi'))) add(x, x[1], x[2], x.index);          // Express
  for (const x of raw.matchAll(new RegExp(`@\\w+\\.(?:route|${METHODS})\\(\\s*['"]([^'"]+)['"](?:[^)]*methods=\\[['"](\\w+))?`, 'gi'))) add(x, x[2] || (/\.(\w+)\(/.exec(x[0])[1] === 'route' ? 'GET' : /\.(\w+)\(/.exec(x[0])[1]), x[1], x.index); // Flask/FastAPI
  for (const x of raw.matchAll(/\bMap(Get|Post|Put|Delete|Patch)\(\s*"([^"]+)"/g)) add(x, x[1], x[2], x.index);                                           // ASP.NET minimal
  for (const x of raw.matchAll(/@(Get|Post|Put|Delete|Patch)Mapping\(\s*(?:value\s*=\s*)?"([^"]+)"/g)) add(x, x[1], x[2], x.index);                         // Spring
  for (const x of raw.matchAll(/\b(?:HandleFunc|Handle)\(\s*"(?:[A-Z]+\s+)?([^"]+)"/g)) add(x, 'ANY', x[1], x.index);                                       // Go net/http
  for (const x of raw.matchAll(/\.(GET|POST|PUT|DELETE|PATCH)\(\s*"([^"]+)"/g)) add(x, x[1], x[2], x.index);                                               // gin/echo
  if (lang === 'csharp') {                                                                                                                                 // controladores
    const cls = raw.match(/class\s+(\w+?)Controller\b/), base = raw.match(/\[Route\(\s*"([^"]+)"/);
    if (cls) {
      const prefix = (base ? base[1] : cls[1]).replace(/\[controller\]/i, cls[1]);
      for (const x of raw.matchAll(/\[Http(Get|Post|Put|Delete|Patch)(?:\(\s*"([^"]*)"\s*\))?\]/g)) add(x, x[1], x[2] ? `${prefix}/${x[2]}` : prefix, x.index);
    }
  }
  if (lang === 'java') { const base = raw.match(/@RequestMapping\(\s*(?:value\s*=\s*)?"([^"]+)"/); if (base) for (const r of out) if (!r.path.startsWith(norm(base[1]))) r.path = norm(base[1] + '/' + r.path); }
  return out;
}
function callsOf(raw) {
  const out = [], add = (method, url, idx) => url && /\//.test(url) && out.push({ method: method.toUpperCase(), path: norm(url), line: line(raw, idx), url });
  for (const x of raw.matchAll(/\bfetch\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*\{[^}]*method:\s*['"](\w+))?/g)) add(x[2] || 'GET', x[1], x.index);
  for (const x of raw.matchAll(new RegExp(`\\b(?:axios|http|\\$http|api|client|requests|httpx)\\.(${METHODS})\\(\\s*f?['"\`]([^'"\`]+)`, 'gi'))) add(x[1], x[2], x.index);
  for (const x of raw.matchAll(/\.(Get|Post|Put|Delete|Patch)(?:Async|FromJsonAsync)\(\s*\$?"([^"]+)"/g)) add(x[1], x[2], x.index);
  for (const x of raw.matchAll(/\bhttp\.(Get|Post)\(\s*"([^"]+)"/g)) add(x[1], x[2], x.index);
  return out;
}
const segMatch = (a, b) => { const x = a.split('/'), y = b.split('/'); return x.length === y.length && x.every((s, i) => s === y[i] || s === ':p' || y[i] === ':p'); };

/** files: [{id, lang, raw, isTest}] → [{source(cliente), target(servidor), method, path, line}] */
export function findBridges(files) {
  const routes = [], calls = [];
  for (const f of files) {
    if (f.isTest) continue;
    for (const r of routesOf(f.raw, f.lang, f.id)) routes.push({ ...r, file: f.id });
    for (const c of callsOf(f.raw)) calls.push({ ...c, file: f.id });
  }
  const out = [], seen = new Set();
  for (const c of calls) {
    const cands = routes.filter((r) => r.file !== c.file && (r.method === 'ANY' || r.method === c.method) && (segMatch(r.path, c.path) || (c.path.split('/').length > r.path.split('/').length && c.path.endsWith('/' + r.path) && r.path.split('/').length >= 2)));
    const best = cands.sort((a, b) => b.path.split('/').length - a.path.split('/').length)[0]; if (!best) continue;
    const key = `${c.file}→${best.file}|${c.method} ${best.path}`; if (seen.has(key)) continue; seen.add(key);
    out.push({ source: c.file, target: best.file, method: c.method, path: '/' + best.path, line: c.line, routeLine: best.line });
  }
  return out;
}
