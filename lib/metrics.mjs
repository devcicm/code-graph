// code-graph · lib/metrics.mjs
// Ciencia de datos sobre el grafo + git: estados, riesgo explicable, módulos naturales
// (propagación de etiquetas), acoplamiento por co-cambio, trazas de símbolos, hallazgos y salud.
import { r2 as _r2, pctRank, robustZ, slope, gini, wilson, association, confidence, FIX_RE } from './stats.mjs';
const DAY = 864e5;
const stem = (n) => (n.label || n.id).replace(/\.[^.]+$/, '');
const short = (n) => { const p = n.id.split('/'); return p.length > 1 ? `${p[p.length - 2]}/${stem(n)}` : stem(n); };
const modName = (n) => { const s = stem(n); return s === 'index' ? (n.id.split('/').slice(-2, -1)[0] || 'raíz') : s; };
const r2 = (x) => Math.round(x * 100) / 100;
const WEIGHTS = { fanIn: 0.28, churn: 0.26, cycle: 0.16, untested: 0.14, owner: 0.1, size: 0.06, dup: 0.08 };

// Tope del radio de impacto: en proyectos enormes con cadenas profundas el cierre transitivo crece como N²; más allá de esto se informa «≥ tope».
const IMPACT_CAP = 2500;
export function buildWorld(graph, hist, status = new Map(), opts = {}) {
  const now = opts.now ?? Date.now();
  const nodes = graph.nodes.map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = graph.edges.map((e) => ({ ...e }));
  const files = nodes.filter((n) => n.kind === 'file');
  const code = files.filter((n) => !n.isTest);
  const authors = hist ? hist.authors.map((a) => a.name) : [];
  const aIdx = new Map(authors.map((a, i) => [a, i]));
  const nCommits = hist ? hist.commits.length : 0;

  // ───── git por archivo ─────
  for (const n of files) {
    const st = status.get(n.id);
    if (!hist) { n.git = null; continue; }
    const rec = hist.files.get(n.id);
    if (!rec) { n.git = { tracked: false, commits: 0, c30: 0, c90: 0, c365: 0, add: 0, del: 0, first: null, last: null, lastT: null, authors: [], owner: null, ownerShare: 0, busFactor: 0, born: nCommits, idx: [], grow: [], status: st || 'untracked' }; continue; }
    const total = rec.commitIdx.length || 1;
    const list = [...rec.authors].map(([name, c]) => ({ a: aIdx.get(name), commits: c, share: r2(c / total) })).sort((x, y) => y.commits - x.commits);
    let cum = 0, k = 0; for (const x of list) { cum += x.share; k++; if (cum >= 0.7) break; }
    const since = (d) => rec.dates.filter((t) => t >= now - d * DAY).length;
    n.git = { tracked: true, commits: rec.commitIdx.length, c30: since(30), c90: since(90), c365: since(365), add: rec.add, del: rec.del,
      first: rec.firstDate, last: rec.lastDate, lastT: rec.dates[rec.dates.length - 1], authors: list, owner: list[0]?.a ?? null, ownerShare: list[0]?.share ?? 0,
      busFactor: k, born: rec.born, idx: rec.commitIdx.slice(-40), grow: rec.net, status: st || 'clean', renamedFrom: rec.renamedFrom };
  }

  // ───── co-cambio (acoplamiento temporal) ─────
  const coChange = [], pairs = new Map();
  if (hist) {
    for (const c of hist.commits) {
      const ids = [...c.recs].filter((r) => r.alive && byId.has(r.path)).map((r) => r.path).sort();
      if (ids.length < 2 || ids.length > 25) continue;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const k = ids[i] + '\u0000' + ids[j]; pairs.set(k, (pairs.get(k) || 0) + 1); }
    }
    const linked = new Set(); for (const e of edges) { if (e.external) continue; linked.add(e.source + '\u0000' + e.target); linked.add(e.target + '\u0000' + e.source); }
    for (const [k, count] of pairs) {
      const [a, b] = k.split('\u0000'); const ca = byId.get(a).git.commits, cb = byId.get(b).git.commits;
      const strength = r2(count / Math.max(1, Math.min(ca, cb)));
      if (count >= 2 && strength >= 0.5) coChange.push({ a, b, count, strength, ...association(count, ca, cb, Math.max(1, nCommits)), hidden: !linked.has(k) && !linked.has(b + '\u0000' + a) && !byId.get(a).isTest && !byId.get(b).isTest && !byId.get(a).aux && !byId.get(b).aux && !byId.get(a).gen && !byId.get(b).gen });
    }
    coChange.sort((x, y) => y.count * y.strength - x.count * x.strength); coChange.length = Math.min(coChange.length, 60);
  }

  // ───── módulos naturales ─────
  const communities = detectCommunities(code, edges, coChange, byId);
  for (const n of code) n.community = communities.of.get(n.id) ?? -1;
  for (const n of files.filter((x) => x.isTest)) { // una prueba pertenece al módulo de lo que prueba
    const target = edges.find((e) => e.source === n.id && !e.external && byId.get(e.target) && !byId.get(e.target).isTest);
    n.community = target ? (communities.of.get(target.target) ?? -1) : -1;
  }
  for (const n of nodes.filter((x) => x.kind === 'external')) n.community = -1;

  // ───── cobertura: directa (una prueba lo importa) o indirecta (se llega desde una prueba) ─────
  const fwd = new Map(); for (const e of edges) { if (e.external || e.kind === 'relation') continue; (fwd.get(e.source) || fwd.set(e.source, []).get(e.source)).push(e.target); }
  const depth = new Map(), q = []; for (const n of files) if (n.isTest) { depth.set(n.id, 0); q.push(n.id); }
  for (let h = 0; h < q.length; h++) for (const t of fwd.get(q[h]) || []) if (!depth.has(t)) { depth.set(t, depth.get(q[h]) + 1); q.push(t); }
  for (const n of files) n.coverage = n.isTest ? 'prueba' : n.tested ? 'directa' : depth.has(n.id) ? 'indirecta' : 'ninguna';

  // ───── estadística por archivo: correcciones, tendencia, percentiles, atípicos ─────
  if (hist) {
    const fixes = new Map(); for (const c of hist.commits) if (FIX_RE.test(c.msg || '')) for (const r of c.recs) fixes.set(r.path, (fixes.get(r.path) || 0) + 1);
    for (const n of files) { const g = n.git; if (!g || !g.tracked) continue; g.fixes = fixes.get(n.id) || 0; g.fixRate = wilson(g.fixes, g.commits); g.confidence = confidence(g.commits);
      const rec = hist.files.get(n.id), months = new Array(6).fill(0); for (const t of rec.dates) { const m = Math.floor((now - t) / (30 * DAY)); if (m >= 0 && m < 6) months[5 - m]++; }
      g.months = months; const sl = slope(months); g.trend = sl > 0.25 ? 'subiendo' : sl < -0.25 ? 'bajando' : 'estable'; }
  }
  {
    const col = (f) => code.map(f), churn = col((n) => n.git?.c90 || 0), locs = col((n) => n.loc || 0), fin = col((n) => n.fanIn), cm = col((n) => n.git?.commits || 0);
    for (const n of code) n.pct = { churn: pctRank(churn, n.git?.c90 || 0), loc: pctRank(locs, n.loc || 0), fanIn: pctRank(fin, n.fanIn), commits: pctRank(cm, n.git?.commits || 0) };
    for (const n of code) { const z = { churn: robustZ(churn, n.git?.c90 || 0), loc: robustZ(locs, n.loc || 0), fanIn: robustZ(fin, n.fanIn) }; n.outlier = Object.entries(z).filter(([, v]) => v > 3.5).map(([k]) => k); }
  }
  // radio de impacto: cierre transitivo de quién depende de cada archivo (recursión sobre el grafo)
  {
    const rev = new Map(); for (const e of edges) { if (e.external || e.fromTest || e.kind === 'relation') continue; (rev.get(e.target) || rev.set(e.target, []).get(e.target)).push(e.source); }
    const CAP = files.length > 3000 ? 800 : IMPACT_CAP;
    for (const n of files) {
      const seen = new Map([[n.id, 0]]), q = [n.id], lv = [];
      let capped = false;
      for (let h = 0; h < q.length && !capped; h++) { const id = q[h], d = seen.get(id); for (const src of rev.get(id) || []) if (!seen.has(src)) { if (seen.size >= CAP) { capped = true; break; } seen.set(src, d + 1); q.push(src); lv[d] = (lv[d] || 0) + 1; } }
      const ids = [...seen.keys()].slice(1), direct = lv[0] || 0, prod = ids.filter((i) => !byId.get(i).isTest);
      n.impact = { capped, direct, total: ids.length, prod: prod.length, depth: lv.length, levels: lv.map((x) => x || 0), ids: ids.slice(0, files.length > 400 ? 30 : 300) };
    }
  }

  // ───── duplicación: costo de cada grupo de clones (co-cambio, autores) ─────
  const dupGroups = scoreDuplicates(opts.dupes, byId, pairs, !!hist);

  // ───── instabilidad, riesgo, estado ─────
  const maxIn = Math.max(4, ...code.map((n) => n.fanIn)), maxC90 = Math.max(4, ...code.map((n) => n.git?.c90 || 0));
  const w = { ...WEIGHTS }; if (!hist) { delete w.churn; delete w.owner; } if (!opts.dupes) delete w.dup;
  const wsum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const n of files) {
    const tot = n.fanIn + n.fanOut; n.instability = tot ? r2(n.fanOut / tot) : 0;
    const g = n.git;
    // estado de ciclo de vida
    let state = 'estable';
    if (n.isTest) state = g ? lifecycle(n, g, now) : 'estable';
    else state = g ? lifecycle(n, g, now) : n.role === 'orphan' ? 'huérfano' : 'estable';
    n.state = state;
    // banderas
    const fl = [];
    if (n.cycle) fl.push('ciclo'); if (n.role === 'orphan') fl.push('huérfano'); if (n.role === 'hub') fl.push('hub');
    if (!n.isTest && n.fanIn >= 2 && n.coverage === 'ninguna') fl.push('sin-pruebas');
    if (n.dup && n.dup.sev === 'costosa') fl.push('duplicado');
    if (g && g.busFactor === 1 && g.commits >= 3) fl.push('propietario-único');
    if (g && g.c90 >= 3 && n.fanIn >= 2) fl.push('hotspot');
    if (g && ['modified', 'untracked', 'added'].includes(g.status)) fl.push('sin-commit');
    if (n.gen) fl.push('generado'); if (n.aux) fl.push('ejemplo'); if (n.dyn) fl.push('reflexión'); if (n.rec) fl.push('recursión');
    n.flags = fl;
    // riesgo explicable
    if (n.isTest || n.gen || n.aux) { n.risk = { score: 0, level: 'bajo', parts: {} }; continue; }
    const fi = Math.min(1, n.fanIn / maxIn);
    const parts = {
      fanIn: fi, churn: g ? Math.min(1, g.c90 / maxC90) : 0, cycle: n.cycle ? 1 : 0,
      untested: n.coverage === 'ninguna' && n.fanIn >= 1 ? 0.5 + 0.5 * fi : n.coverage === 'indirecta' && n.fanIn >= 1 ? 0.25 * fi : 0,
      owner: g && g.busFactor === 1 && g.commits >= 3 ? 1 : 0, size: Math.min(1, (n.loc || 0) / 300),
      dup: n.dup ? Math.min(1, n.dup.pct * (n.dup.sev === 'costosa' ? 1.6 : 0.6)) : 0,
    };
    let score = 0; for (const k in w) score += w[k] * parts[k]; score = Math.round((100 * score) / wsum);
    for (const k in parts) parts[k] = r2(parts[k]);
    n.risk = { score, level: score >= 55 ? 'alto' : score >= 30 ? 'medio' : 'bajo', parts, weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, r2(v / wsum)])) };
  }

  // ───── carpetas y acoplamiento entre carpetas ─────
  const folderMap = new Map();
  for (const n of code) {
    const f = folderMap.get(n.dir) || folderMap.set(n.dir, { dir: n.dir, files: 0, lines: 0, risk: 0, hot: 0, c90: 0, owners: new Map() }).get(n.dir);
    f.files++; f.lines += n.loc || 0; f.risk += n.risk.score; f.c90 += n.git?.c90 || 0; if (n.state === 'caliente') f.hot++;
    if (n.git?.owner != null) f.owners.set(n.git.owner, (f.owners.get(n.git.owner) || 0) + 1);
  }
  const folders = [...folderMap.values()].map((f) => ({ dir: f.dir, files: f.files, lines: f.lines, risk: Math.round(f.risk / f.files), hot: f.hot, c90: f.c90, owner: [...f.owners].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }));
  const cpl = new Map();
  for (const e of edges) {
    if (e.external || e.fromTest || e.kind === 'relation') continue;
    const a = byId.get(e.source), b = byId.get(e.target); if (!a || !b || a.dir === b.dir) continue;
    const k = a.dir + '\u0000' + b.dir; cpl.set(k, (cpl.get(k) || 0) + 1);
  }
  const coupling = [...cpl].map(([k, count]) => { const [from, to] = k.split('\u0000'); return { from, to, count }; }).sort((a, b) => b.count - a.count);

  // ───── símbolos y trazas ─────
  const symbols = buildSymbols(files, edges);
  suggestExtraction(dupGroups, byId, coupling);

  // ───── línea de tiempo ─────
  const timeline = [];
  if (hist) {
    let alive = 0, loc = 0;
    for (const c of hist.commits) {
      alive += c.added.size - c.removed.size; loc += c.add - c.del;
      const touched = [...c.recs].filter((r) => r.alive && byId.has(r.path)).map((r) => r.path);
      timeline.push({ i: c.i, h: c.hash.slice(0, 7), a: aIdx.get(c.author), d: c.date, t: c.t, m: c.msg, add: c.add, del: c.del, files: touched, added: [...c.added].filter((r) => r.alive).map((r) => r.path), nf: alive, loc: Math.max(0, loc) });
    }
  }

  const world = {
    meta: { root: graph.meta.root, generated: new Date(now).toISOString(), tool: 'code-graph/0.2', externals: graph.meta.externals, languages: graph.meta.languages, langInfo: graph.meta.langInfo,
      git: hist ? { available: true, branch: hist.info.branch, head: hist.info.head.slice(0, 7), commits: nCommits, first: timeline[0]?.d, last: timeline[timeline.length - 1]?.d, uncommitted: [...status.values()].length } : { available: false } },
    nodes, edges, cycles: graph.cycles, warnings: graph.warnings, authors, timeline, coChange,
    communities: communities.list, folders, coupling, symbols,
    dupes: opts.dupes ? { groups: dupGroups, constants: opts.dupes.constants, names: opts.dupes.names, stats: opts.dupes.stats } : null,
  };
  world.insights = buildInsights(world, byId, now);
  world.health = buildHealth(world);
  return world;
}

function lifecycle(n, g, now) {
  if (g.status === 'modified' || g.status === 'added') return 'modificado';
  if (g.status === 'untracked' || (g.first && now - Date.parse(g.first) < 14 * DAY)) return 'nuevo';
  if (g.c30 >= 3 || g.c90 >= 6) return 'caliente';
  if (n.role === 'orphan') return 'huérfano';
  const age = now - g.lastT;
  return age > 180 * DAY ? 'dormido' : age > 60 * DAY ? 'estable' : 'activo';
}

// ───────────── módulos: propagación de etiquetas con peso inverso al grado ─────────────
function detectCommunities(code, edges, coChange, byId) {
  const idx = new Map(code.map((n, i) => [n.id, i])), adj = code.map(() => new Map());
  const add = (a, b, w) => { adj[a].set(b, (adj[a].get(b) || 0) + w); adj[b].set(a, (adj[b].get(a) || 0) + w); };
  for (const e of edges) {
    if (e.external || e.fromTest || !idx.has(e.source) || !idx.has(e.target) || e.source === e.target) continue;
    const hub = Math.max(byId.get(e.source).fanIn, byId.get(e.target).fanIn);
    const base = e.kind === 'relation' ? 1.6 : 1 + Math.min(e.refs, 5) * 0.15;
    add(idx.get(e.source), idx.get(e.target), base / Math.log2(2 + hub));
  }
  for (const c of coChange) if (idx.has(c.a) && idx.has(c.b)) add(idx.get(c.a), idx.get(c.b), c.strength * 1.5);
  const label = code.map((_, i) => i), order = code.map((_, i) => i).sort((a, b) => adj[b].size - adj[a].size || a - b);
  for (let it = 0; it < 30; it++) {
    let changed = false;
    for (const i of order) {
      const score = new Map(); for (const [j, w] of adj[i]) score.set(label[j], (score.get(label[j]) || 0) + w);
      if (!score.size) continue;
      let best = label[i], bw = score.get(label[i]) ?? -1;
      for (const [l, ws] of [...score].sort((a, b) => a[0] - b[0])) if (ws > bw + 1e-9) { best = l; bw = ws; }
      if (best !== label[i]) { label[i] = best; changed = true; }
    }
    if (!changed) break;
  }
  // los nodos sin vecinos quedan solos; el resto con una sola pieza se une a su mejor vecino
  const sizes = new Map(); label.forEach((l) => sizes.set(l, (sizes.get(l) || 0) + 1));
  code.forEach((_, i) => { if (sizes.get(label[i]) === 1 && adj[i].size) { const best = [...adj[i]].sort((a, b) => b[1] - a[1])[0][0]; label[i] = label[best]; } });
  const groups = new Map(); label.forEach((l, i) => (groups.get(l) || groups.set(l, []).get(l)).push(i));
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
  const of = new Map(), list = [];
  ordered.forEach((members, ci) => {
    const set = new Set(members); let inside = 0, outside = 0;
    for (const i of members) { of.set(code[i].id, ci); for (const [j, w] of adj[i]) (set.has(j) ? (inside += w / 2) : (outside += w)); }
    const lead = members.map((i) => code[i]).sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut))[0];
    list.push({ id: ci, name: members.length > 1 ? `${modName(lead)} +${members.length - 1}` : modName(lead), size: members.length, cohesion: inside + outside ? r2(inside / (inside + outside)) : 1, lead: lead.id, files: members.map((i) => code[i].id) });
  });
  return { of, list };
}

// ───────────── símbolos: de la definición a quien lo usa (atravesando barrels) ─────────────
function buildSymbols(files, edges) {
  const into = new Map();
  for (const e of edges) { if (e.external || e.kind === 'relation') continue; (into.get(e.target) || into.set(e.target, []).get(e.target)).push(e); }
  const byId = new Map(files.map((n) => [n.id, n]));
  const usesOf = (file, name, via, seen) => {
    const k = file + '#' + name; if (seen.has(k)) return []; seen.add(k);
    const out = [];
    for (const e of into.get(file) || []) {
      if (e.kind === 'reexport') {
        if (e.symbols.some((s) => s.name === name || s.name === '*')) out.push(...usesOf(e.source, name, via.concat(e.source), seen));
      } else if (e.kind === 'dynamic') out.push({ file: e.source, count: 1, via, how: 'dinámico', test: !!byId.get(e.source)?.isTest });
      else {
        const s = e.symbols.find((x) => x.name === name);
        if (s) out.push({ file: e.source, count: s.count, via, how: e.kind, local: s.local, test: !!byId.get(e.source)?.isTest });
        else { const ns = e.symbols.find((x) => x.name === '*'); const m = ns?.members?.find((x) => x.name === name); if (m) out.push({ file: e.source, count: m.count, via, how: 'namespace', test: !!byId.get(e.source)?.isTest }); }
      }
    }
    return out;
  };
  const out = [];
  for (const n of files) for (const d of n.defs || []) {
    if (!d.exported) continue;
    const uses = usesOf(n.id, d.name, [], new Set());
    out.push({ id: `${n.id}#${d.name}`, file: n.id, name: d.name, kind: d.kind, line: d.line, uses, total: uses.filter((u) => !u.test).reduce((s, u) => s + u.count, 0) });
  }
  return out;
}

// ───────────── hallazgos: lo que conviene decidir ─────────────
function buildInsights(w, byId, now) {
  const out = [], push = (x) => out.push({ id: 'i' + out.length, ...x });
  const code = w.nodes.filter((n) => n.kind === 'file' && !n.isTest && !n.gen && !n.aux);
  const nm = (id) => short(byId.get(id));
  const owner = (n) => (n.git?.owner != null ? w.authors[n.git.owner] : null);
  const hasBus = code.find((n) => /(^|\/)(bus|events?)\b/i.test(n.id) || /bus|event/i.test(n.label));

  for (const comp of w.cycles) {
    const inner = w.edges.filter((e) => !e.fromTest && !e.external && e.kind !== 'relation' && e.kind !== 'dynamic' && comp.includes(e.source) && comp.includes(e.target));
    const weakest = [...inner].sort((a, b) => a.refs - b.refs || a.symbols.length - b.symbols.length)[0];
    const syms = weakest?.symbols.map((s) => s.name).join(', ');
    push({ sev: 'alta', kind: 'ciclo', title: `Ciclo entre ${comp.map(nm).join(' y ')}`, nodes: comp,
      detail: `Se importan entre sí${weakest ? `. La dependencia más débil es ${nm(weakest.source)} → ${nm(weakest.target)} (${syms}, ${weakest.refs} uso${weakest.refs === 1 ? '' : 's'})` : ''}.`,
      action: weakest ? `Mueve ${syms} a un módulo aparte${hasBus ? ` o avisa con un evento por ${hasBus.label} en lugar de importar` : ''}.` : 'Extrae lo compartido a un tercer módulo.' });
  }
  for (const n of [...code].filter((x) => x.flags.includes('hotspot')).sort((a, b) => b.risk.score - a.risk.score).slice(0, 4)) {
    const bits = [`${n.git.c90} cambios en 90 días`, `lo importan ${n.fanIn} archivos`, n.tested ? 'tiene pruebas' : 'sin pruebas', n.git.busFactor === 1 ? `solo lo toca ${owner(n)}` : `${n.git.busFactor} autores principales`];
    push({ sev: n.risk.score >= 55 ? 'alta' : 'media', kind: 'hotspot', title: `${short(n)} cambia mucho y otros dependen de él`, nodes: [n.id], detail: bits.join(' · ') + '.',
      action: n.tested ? 'Revisa si conviene dividirlo: cada cambio aquí puede afectar a sus dependientes.' : 'Agrega pruebas antes del próximo cambio; es el lugar donde más puede romperse algo.' });
  }
  const untested = code.filter((n) => n.fanIn >= 2 && n.coverage === 'ninguna' && !n.flags.includes('hotspot'));
  if (untested.length) push({ sev: 'media', kind: 'pruebas', title: `${untested.length} módulo${untested.length > 1 ? 's' : ''} muy usado${untested.length > 1 ? 's' : ''} sin ninguna prueba`, nodes: untested.map((n) => n.id),
    detail: untested.map((n) => `${short(n)} (${n.fanIn})`).join(', ') + '. Ninguna prueba los toca, ni directa ni indirectamente.', action: 'Empieza por el que más archivos importan.' });
  for (const c of w.coChange.filter((x) => x.hidden).slice(0, 4)) {
    const a = byId.get(c.a), b = byId.get(c.b);
    push({ sev: c.strength >= 0.8 ? 'alta' : 'media', kind: 'acoplamiento', title: `${short(a)} y ${short(b)} cambian juntos sin importarse`, nodes: [c.a, c.b],
      detail: `Aparecieron juntos en ${c.count} commits (${Math.round(c.strength * 100)}% de los cambios del menos tocado) pero no hay ningún import entre ellos.`,
      action: 'Hay una regla compartida que no está escrita en el código. Considera una constante o un módulo común.' });
  }
  for (const n of code.filter((x) => x.flags.includes('propietario-único') && !x.flags.includes('hotspot') && x.git.commits >= 4 && (x.loc || 0) >= 40)) {
    push({ sev: 'media', kind: 'dueño', title: `Solo ${owner(n)} conoce ${short(n)}`, nodes: [n.id], detail: `${n.git.commits} commits y ${Math.round(n.git.ownerShare * 100)}% de ellos del mismo autor.`, action: 'Pide una revisión cruzada o documenta su comportamiento.' });
  }
  for (const n of code.filter((x) => x.role === 'orphan')) {
    const days = n.git?.lastT ? Math.round((now - n.git.lastT) / DAY) : null;
    push({ sev: 'info', kind: 'huérfano', title: `${short(n)} no está conectado`, nodes: [n.id], detail: `Nadie lo importa${days != null ? ` y no cambia desde hace ${days} días` : ''}.`, action: 'Candidato a eliminar si no se usa fuera del código (scripts, configuración).' });
  }
  const dead = w.symbols.filter((s) => !s.total && !s.uses.some((u) => !u.test) && byId.get(s.file).role !== 'entry' && byId.get(s.file).role !== 'orphan' && !byId.get(s.file).isTest && !byId.get(s.file).aux && !byId.get(s.file).gen);
  const lib = dead.length > 0.3 * w.symbols.filter((x) => !byId.get(x.file).isTest).length;
  if (dead.length) push({ sev: 'info', kind: 'exports', title: lib ? `${dead.length} exports no se usan dentro del proyecto (parece una librería: pueden ser su API pública)` : `${dead.length} export${dead.length > 1 ? 's' : ''} sin uso`, nodes: [...new Set(dead.map((d) => d.file))], detail: dead.slice(0, 6).map((d) => `${stem(byId.get(d.file))}.${d.name}`).join(', ') + (dead.length > 6 ? '…' : '') + '.', action: 'Quita el export o bórralo si ya no hace falta.' });
  const gens = w.nodes.filter((n) => n.kind === 'file' && n.gen);
  if (gens.length) push({ sev: 'info', kind: 'generado', title: `${gens.length} archivo${gens.length > 1 ? 's' : ''} generado${gens.length > 1 ? 's' : ''} (no se editan a mano)`, nodes: gens.map((n) => n.id), detail: gens.slice(0, 4).map((n) => `${short(n)}: ${n.gen}`).join(' · ') + '.', action: 'Se excluyen del riesgo y de los rankings. Cambia el generador o su plantilla, no el archivo.' });
  const dyns = code.filter((n) => n.dyn);
  if (dyns.length) push({ sev: 'info', kind: 'reflexión', title: `${dyns.length} archivo${dyns.length > 1 ? 's usan' : ' usa'} reflexión o carga dinámica`, nodes: dyns.map((n) => n.id), detail: dyns.slice(0, 4).map((n) => `${short(n)} (${[...new Set(n.dyn.map((d) => d.what))].join(', ')})`).join(' · ') + '.', action: 'El grafo no ve esas dependencias: el impacto real puede ser mayor al mostrado.' });
  const recs = code.filter((n) => n.rec);
  if (recs.length) push({ sev: 'info', kind: 'recursión', title: `${recs.length} archivo${recs.length > 1 ? 's' : ''} con funciones recursivas`, nodes: recs.map((n) => n.id), detail: recs.slice(0, 4).map((n) => `${short(n)}: ${n.rec.map((r) => r.kind === 'mutua' ? r.names.join('⇄') : r.names[0] + '()').join(', ')}`).join(' · ') + '.', action: 'Verifica el caso base y la profundidad máxima con entradas grandes.' });
  const wip = code.concat(w.nodes.filter((n) => n.isTest)).filter((n) => n.flags.includes('sin-commit'));
  if (wip.length) push({ sev: 'info', kind: 'trabajo', title: `${wip.length} archivo${wip.length > 1 ? 's' : ''} con cambios sin commit`, nodes: wip.map((n) => n.id), detail: wip.map((n) => `${stem(n)} (${n.git.status === 'untracked' ? 'nuevo' : 'modificado'})`).join(', ') + '.' });
  dupInsights(w, byId, push, nm);
  const order = { alta: 0, media: 1, info: 2 }; out.sort((a, b) => order[a.sev] - order[b.sev]);
  return out;
}

function buildHealth(w) {
  const code = w.nodes.filter((n) => n.kind === 'file' && !n.isTest && !n.gen && !n.aux), parts = [];
  const add = (label, count, each, cap) => { if (count) parts.push({ label, count, penalty: Math.min(cap, count * each) }); };
  add('ciclos de dependencia', w.cycles.length, 12, 30);
  add('acoplamiento oculto', w.coChange.filter((c) => c.hidden).length, 4, 12);
  add('módulos muy usados sin pruebas', code.filter((n) => n.fanIn >= 2 && n.coverage === 'ninguna').length, 2, 8);
  add('archivos de riesgo alto', code.filter((n) => n.risk.level === 'alto').length, 3, 12);
  add('hotspots con un solo autor', code.filter((n) => n.flags.includes('hotspot') && n.flags.includes('propietario-único')).length, 3, 9);
  add('archivos huérfanos', code.filter((n) => n.role === 'orphan').length, 2, 6);
  if (w.dupes) { add('duplicación que se paga', w.dupes.groups.filter((g) => g.sev === 'costosa').length, 5, 15); add('constantes mágicas repetidas', w.dupes.constants.filter((c) => c.sev === 'media').length, 2, 6); }
  const score = Math.max(0, Math.round(100 - parts.reduce((s, p) => s + p.penalty, 0)));
  return { score, grade: score >= 75 ? 'sana' : score >= 50 ? 'atención' : 'frágil', parts };
}

// ───────────── duplicación: costo, severidad y sugerencias ─────────────
function scoreDuplicates(d, byId, pairs, hasGit) {
  if (!d) return [];
  const groups = d.groups.filter((g) => g.units.every((u) => byId.has(u.file))).map((g) => {
    const files = [...new Set(g.units.map((u) => u.file))];
    let co = 0, coN = 0;
    if (hasGit) for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
      const [a, b] = files[i] < files[j] ? [files[i], files[j]] : [files[j], files[i]];
      const n = pairs.get(a + '\u0000' + b) || 0, m = Math.min(byId.get(a).git?.commits || 0, byId.get(b).git?.commits || 0);
      if (m && n / m > co) { co = r2(n / m); coN = n; }
    }
    const owners = [...new Set(files.map((f) => byId.get(f).git?.owner).filter((x) => x != null))];
    const sameFile = files.length === 1, copies = g.units.length;
    const sev = g.test ? 'inofensiva' : hasGit && co >= 0.5 && coN >= 2 ? 'costosa' : 'latente';
    let score = 8 * Math.sqrt(g.lines * (copies - 1)) * (1 + 2 * co) * (owners.length > 1 ? 1.25 : 1) * (g.test ? 0.3 : 1) * (sameFile ? 0.7 : 1);
    return { ...g, files, copies, coRate: co, coCount: coN, owners, sameFile, sev, score: Math.min(100, Math.round(score)) };
  }).sort((a, b) => b.score - a.score);
  groups.forEach((g, i) => (g.id = 'd' + i));
  // % duplicado por archivo (unión de rangos de líneas)
  const per = new Map();
  for (const g of groups) for (const u of g.units) { const r = per.get(u.file) || per.set(u.file, { ranges: [], groups: new Set(), sev: 'latente', cost: 0 }).get(u.file); r.ranges.push([u.start, u.end]); r.groups.add(g.id); if (g.sev === 'costosa') r.sev = 'costosa'; r.cost = Math.max(r.cost, g.score); }
  for (const [file, r] of per) {
    r.ranges.sort((a, b) => a[0] - b[0]); let lines = 0, cur = null;
    for (const [a, b] of r.ranges) { if (cur && a <= cur[1]) cur[1] = Math.max(cur[1], b); else { if (cur) lines += cur[1] - cur[0] + 1; cur = [a, b]; } }
    if (cur) lines += cur[1] - cur[0] + 1;
    const n = byId.get(file); n.dup = { lines, pct: r2(Math.min(1, lines / Math.max(1, n.loc || lines))), groups: [...r.groups], sev: r.sev, cost: r.cost };
  }
  for (const c of d.constants) c.sev = c.files >= 3 && c.count >= 4 ? 'media' : 'info';
  return groups;
}

function suggestExtraction(groups, byId, coupling) {
  const dirs = [...new Set([...byId.values()].filter((n) => n.kind === 'file').map((n) => n.dir))];
  const shared = dirs.filter((d) => /(^|\/)(utils?|shared|common|lib|helpers)$/i.test(d)).sort((a, b) => a.length - b.length)[0];
  for (const g of groups) {
    if (g.sameFile) { g.suggest = { kind: 'local', text: `Extrae una función local en ${g.files[0].split('/').pop()} y llámala desde cada copia.` }; continue; }
    const parts = g.files.map((f) => f.split('/').slice(0, -1)); let lca = [];
    for (let i = 0; i < Math.min(...parts.map((p) => p.length)); i++) { if (parts.every((p) => p[i] === parts[0][i])) lca.push(parts[0][i]); else break; }
    const lcaDir = lca.join('/');
    const sameDir = new Set(g.files.map((f) => byId.get(f).dir)).size === 1;
    const dir = sameDir ? byId.get(g.files[0]).dir : (shared && (!lcaDir || shared.startsWith(lcaDir)) ? shared : lcaDir || shared || '.');
    const ext = g.files[0].match(/\.[^.]+$/)?.[0] || '.mjs', nm = g.name === '(anónima)' ? 'compartido' : g.name;
    const warn = []; for (const f of g.files) { const x = byId.get(f).dir; if (x !== dir && coupling.some((c) => c.from === dir && c.to === x)) warn.push(`${dir} ya depende de ${x}: importarlo desde ahí crearía una dependencia circular`); }
    g.suggest = { kind: 'module', dir, file: `${dir ? dir + '/' : ''}${nm}${ext}`, name: nm, warn: [...new Set(warn)],
      text: `Mueve ${nm}() a ${dir ? dir + '/' : ''}${nm}${ext} y importa desde ${g.files.length} archivo${g.files.length > 1 ? 's' : ''}.${g.type === 'similar' ? ' Las copias difieren un poco: unifica primero las diferencias como parámetros.' : g.type === 'parametrizado' ? ' Solo cambian los nombres: se puede extraer tal cual.' : ' Son idénticas: extracción directa.'}` };
  }
}

function dupInsights(w, byId, push, nm) {
  const d = w.dupes; if (!d) return;
  const who = (g) => g.owners.map((o) => w.authors[o]).filter(Boolean);
  for (const g of d.groups.filter((x) => x.sev === 'costosa').slice(0, 5)) {
    push({ sev: g.score >= 60 ? 'alta' : 'media', kind: 'duplicación', group: g.id, title: `${g.name}() está copiada en ${g.files.length} archivos y las copias cambian juntas`, nodes: g.files,
      detail: `${g.copies} copias de ~${g.lines} líneas (${g.type}${g.type === 'similar' ? ', ' + Math.round(g.sim * 100) + '% parecidas' : ''}). Aparecieron juntas en ${g.coCount} commits (${Math.round(g.coRate * 100)}% de los cambios del menos tocado)${who(g).length > 1 ? '; las tocan ' + who(g).join(' y ') : ''}.`,
      action: g.suggest?.text + (g.suggest?.warn?.length ? ' Ojo: ' + g.suggest.warn.join('; ') + '.' : '') });
  }
  const lat = d.groups.filter((x) => x.sev === 'latente');
  if (lat.length) push({ sev: 'info', kind: 'duplicación', group: lat[0].id, title: `${lat.length} grupo${lat.length > 1 ? 's' : ''} de código parecido que hoy no cambia junto`, nodes: [...new Set(lat.flatMap((g) => g.files))],
    detail: lat.slice(0, 4).map((g) => `${g.name}() ×${g.copies}`).join(', ') + '. Por ahora no cuestan: se editan por separado.', action: 'Déjalas así hasta que una tercera copia o un cambio conjunto justifique extraer.' });
  for (const c of d.constants.slice(0, 4)) {
    push({ sev: c.sev === 'media' ? 'media' : 'info', kind: 'constante', title: `${c.kind === 'num' ? c.value : '"' + c.value + '"'} se repite ${c.count} veces en ${c.files} archivos`, nodes: [...new Set(c.at.map((a) => a.file))],
      detail: c.at.slice(0, 5).map((a) => `${a.file.split('/').pop()}:${a.line}`).join(', ') + (c.at.length > 5 ? '…' : '') + '.',
      action: c.existing ? `Ya existe ${c.existing.name} en ${c.existing.file.split('/').pop()}: úsala en lugar del literal.` : 'Defínela una vez con nombre y reemplaza los literales.' });
  }
  const homo = d.names.slice(0, 2);
  for (const h of homo) push({ sev: 'info', kind: 'homónimo', title: `${h.name}() existe en ${new Set(h.units.map((u) => u.file)).size} archivos`, nodes: [...new Set(h.units.map((u) => u.file))],
    detail: h.units.map((u) => `${u.file.split('/').pop()}:${u.start}`).join(', ') + '.', action: 'Comprueba si hacen lo mismo con otro nombre o si el nombre confunde.' });
}
