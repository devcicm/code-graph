/* ───────────────────────── core.js · estado, utilidades, datos ───────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const DAY = 864e5;
const stem = (n) => n.label.replace(/\.[^.]+$/, '');
const short = (n) => { const p = n.id.split('/'); return p.length > 1 ? `${p[p.length - 2]}/${stem(n)}` : stem(n); };
const fmtD = (iso) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const safe = (f, d) => { try { return f(); } catch { return d; } };
function ago(t) {
  const d = Math.round((S.now - t) / DAY);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : d < 30 ? `hace ${d} días` : d < 365 ? `hace ${Math.round(d / 30)} meses` : `hace ${(d / 365).toFixed(1)} años`;
}
const Bus = { h: {}, on(e, f) { (this.h[e] ||= []).push(f); }, emit(e, a) { (this.h[e] || []).forEach((f) => f(a)); } };

/* ───── color ───── */
const hex = (h) => { h = h.trim().replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const shade = (c, f) => c.map((v) => clamp(v * f, 0, 255));
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const T = {}; // tokens del tema para el canvas
function readTheme() {
  const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
  for (const k of ['bg', 'stage', 'panel', 'ink', 'muted', 'line', 'accent', 'warn', 'ok', 'amber', 'ground']) T[k] = hex(g('--' + k));
  T.groundEdge = hex(g('--ground-edge')); T.pal = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => hex(g('--c' + i)));
  T.st = {}; for (const k of Object.keys(STATE_META)) { const v = g('--st-' + k); if (v) T.st[k] = hex(v); }
  T.risk4 = [0, 1, 2, 3].map((i) => g('--risk' + i)); T.risk4 = T.risk4.every(Boolean) ? T.risk4.map(hex) : null;
  T.dark = (T.stage[0] + T.stage[1] + T.stage[2]) / 3 < 110; T.mono = g('--mono'); T.sans = g('--sans');
  Bus.emit('theme');
}

/* ───── tamaño de texto (comodidad) ───── */
const TEXT_SIZES = { normal: 1, grande: 1.2, enorme: 1.4 };
let TEXT_KEY = (() => { try { return localStorage.getItem('codegraph:text') || 'normal'; } catch { return 'normal'; } })();
if (!TEXT_SIZES[TEXT_KEY]) TEXT_KEY = 'normal';
const TS = () => TEXT_SIZES[TEXT_KEY];
function setTextSize(key) {
  if (!TEXT_SIZES[key]) return; TEXT_KEY = key; try { localStorage.setItem('codegraph:text', key); } catch {}
  document.documentElement.style.setProperty('--ts', TEXT_SIZES[key]); Bus.emit('theme');
}

/* ───── estado global ───── */
const S = {
  world: null, nodes: [], N: {}, edges: [], out: new Map(), inn: new Map(), adj: new Map(), now: Date.now(),
  mode: 'city', prevMode: null, mix: 1, lens: { color: 'folder', size: 'lines' }, group: 'module',
  layers: { streets: true, all: false, tunnels: true, dupes: true, cycles: true, labels: true, anim: false, aggregate: true },
  sel: null, hover: null, selEdge: null, focusSet: null, focusLabel: '', trace: null, path: null,
  tl: null, playing: false, tab: 'summary', codeMode: 'view', codeLayer: 'author', insightFilter: 'todos',
  extra: { edges: [], notes: {}, suggestNotes: [], actions: [] }, maxima: {}, dirIdx: new Map(), live: !!LIVE,
};

const STATE_META = {
  modificado: { label: 'Modificado', col: 'amber', hint: 'Tiene cambios sin commit' }, nuevo: { label: 'Nuevo', col: 'ok', hint: 'Sin commit o creado hace menos de 14 días' },
  caliente: { label: 'Caliente', col: 'warn', hint: '3+ cambios en 30 días o 6+ en 90' }, activo: { label: 'Activo', col: 'accent', hint: 'Cambió en los últimos 60 días' },
  estable: { label: 'Estable', col: 'c1', hint: 'Sin cambios hace 60 a 180 días' }, dormido: { label: 'Dormido', col: 'c7', hint: 'Sin cambios hace más de 180 días' },
  'huérfano': { label: 'Huérfano', col: 'muted', hint: 'Nadie lo importa ni importa nada del proyecto' },
};
const stateColor = (st) => { if (T.st && T.st[st]) return T.st[st]; const m = STATE_META[st]; if (!m) return T.muted; return m.col.startsWith('c') ? T.pal[+m.col[1]] : T[m.col]; };
const authorColor = (i) => (i == null ? T.muted : T.pal[i % 8]);
const dirColor = (dir) => T.pal[(S.dirIdx.get(dir) ?? 0) % 8];
const ramp = (t, stops) => { t = clamp(t, 0, 1) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t)); return mixc(stops[i], stops[i + 1], t - i); };
const riskColor = (score) => ramp(score / 100, T.risk4 || [T.dark ? [58, 150, 170] : [60, 150, 170], T.amber, T.warn, T.dark ? [255, 80, 90] : [200, 40, 50]]);
const heatColor = (v) => (v <= 0 ? mixc(T.stage, T.muted, 0.45) : ramp(v, [mixc(T.stage, T.amber, 0.45), T.amber, T.warn, T.dark ? [255, 80, 90] : [200, 40, 50]]));
const COV_META = { directa: 'Con prueba directa', indirecta: 'Cubierto indirectamente', ninguna: 'Sin pruebas', prueba: 'Archivo de prueba' };
const covColor = (c) => (c === 'directa' ? T.ok : c === 'indirecta' ? mixc(T.ok, T.muted, 0.55) : c === 'prueba' ? T.accent : T.warn);

const dupColor = (n) => (!n.dup ? mixc(T.stage, T.muted, 0.4) : n.dup.sev === 'costosa' ? ramp(0.45 + 0.55 * n.dup.pct, [T.amber, T.warn, T.dark ? [255, 80, 90] : [200, 40, 50]]) : mixc(T.stage, T.amber, 0.35 + 0.5 * n.dup.pct));
const langList = () => Object.keys(S.world.meta.languages || {}).sort((a, b) => (S.world.meta.languages[b] - S.world.meta.languages[a]));
const langColor = (l) => { const i = langList().indexOf(l); return i < 0 ? T.muted : T.pal[i % 8]; };
function colorOf(n) {
  const c = colorOf0(n), sat = Look.s.ui.sat; if (sat === 1) return c; const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; return c.map((v) => l + (v - l) * sat);
}
function colorOf0(n) {
  switch (S.lens.color) {
    case 'state': return stateColor(n.state);
    case 'risk': return n.isTest ? mixc(T.stage, T.muted, 0.5) : riskColor(n.risk.score);
    case 'heat': return heatColor((n.git?.c90 || 0) / (S.maxima.c90 || 1));
    case 'author': return authorColor(n.git?.owner);
    case 'module': return n.community >= 0 ? T.pal[n.community % 8] : T.muted;
    case 'tests': return covColor(n.coverage);
    case 'lang': return langColor(n.lang);
    case 'dup': return dupColor(n);
    case 'impact': return n.isTest ? mixc(T.stage, T.muted, 0.4) : heatColor((n.impact?.total || 0) / (S.maxima.impact || 1));
    default: return dirColor(n.dir);
  }
}
function legendItems() {
  const L = S.lens.color, sw = (c) => css(c);
  if (L === 'folder') return [...S.dirIdx.keys()].map((d) => [sw(dirColor(d)), d]);
  if (L === 'lang') return langList().map((l) => [sw(langColor(l)), `${S.world.meta.langInfo?.[l]?.name || l} (${S.world.meta.languages[l]})`]);
  if (L === 'state') return Object.entries(STATE_META).map(([k, m]) => [sw(stateColor(k)), `${m.label}`]);
  if (L === 'risk') return [[sw(riskColor(10)), 'Bajo (0–30)'], [sw(riskColor(45)), 'Medio (30–55)'], [sw(riskColor(80)), 'Alto (55+)']];
  if (L === 'heat') return [[sw(heatColor(0)), 'Sin cambios'], [sw(heatColor(0.4)), 'Pocos'], [sw(heatColor(1)), 'Muchos (90 días)']];
  if (L === 'author') return S.world.authors.map((a, i) => [sw(authorColor(i)), a]).concat([[sw(T.muted), 'Sin historial']]);
  if (L === 'module') return S.world.communities.filter((c) => c.size > 0).map((c) => [sw(T.pal[c.id % 8]), `${c.name} (${c.size})`]);
  if (L === 'impact') return [[sw(heatColor(0)), 'Nadie depende de él'], [sw(heatColor(0.4)), 'Afecta a pocos'], [sw(heatColor(1)), 'Afecta a muchos (directos e indirectos)']];
  if (L === 'dup') return [[sw(dupColor({})), 'Sin duplicación'], [sw(dupColor({ dup: { sev: 'latente', pct: 0.5 } })), 'Parecido, cambia por separado'], [sw(dupColor({ dup: { sev: 'costosa', pct: 0.6 } })), 'Copias que cambian juntas']];
  return Object.entries(COV_META).map(([k, v]) => [sw(covColor(k)), v]);
}

/* ───── acceso a datos: servidor local o instantánea incrustada ───── */
const Backend = LIVE ? {
  live: true,
  async j(path, opt = {}) {
    const r = await fetch(path, { ...opt, headers: { 'x-cg-token': LIVE.token, 'content-type': 'application/json' } });
    const b = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(b.error || r.status), { status: r.status, body: b }); return b;
  },
  world() { return this.j('/api/world'); },
  file(id) { return this.j('/api/file?path=' + encodeURIComponent(id)); },
  save(id, text, mtimeMs) { return this.j('/api/file', { method: 'PUT', body: JSON.stringify({ path: id, text, mtimeMs }) }); },
  blame(id) { return this.j('/api/blame?path=' + encodeURIComponent(id)); },
  diff(id) { return this.j('/api/diff?path=' + encodeURIComponent(id)).then((r) => r.diff); },
  search(q) { return this.j('/api/search?q=' + encodeURIComponent(q)); },
  saveOverrides(o) { return this.j('/api/overrides', { method: 'POST', body: JSON.stringify(o) }); },
  watch(cb) { try { const es = new EventSource('/api/events?token=' + LIVE.token); es.addEventListener('world', cb); } catch {} },
} : {
  live: false,
  async file(id) { const f = S.world.files?.[id]; if (!f) throw new Error('El contenido de este archivo no viene en la vista estática.'); return { text: f.text }; },
  async blame(id) { return S.world.files?.[id]?.blame || null; },
  async diff(id) { return S.world.files?.[id]?.diff || ''; },
  async search(q) {
    const out = [], ql = q.toLowerCase();
    for (const [id, f] of Object.entries(S.world.files || {})) { const ls = f.text.split('\n'); for (let i = 0; i < ls.length && out.length < 80; i++) { const c = ls[i].toLowerCase().indexOf(ql); if (c >= 0) out.push({ file: id, line: i + 1, col: c, text: ls[i].trim().slice(0, 160) }); } }
    return out;
  },
  async saveOverrides() { return null; },
};

/* ───── notas y relaciones propuestas (se guardan en el navegador; en vivo también en el proyecto) ───── */
const storeKey = () => 'codegraph:' + (S.world?.meta?.root || 'x');
function saveExtra() { safe(() => localStorage.setItem(storeKey(), JSON.stringify(S.extra))); }
function loadExtra() { const v = safe(() => JSON.parse(localStorage.getItem(storeKey()) || 'null')); S.extra = Object.assign({ edges: [], notes: {}, suggestNotes: [], actions: [] }, v || {}); }

/* ───── carga del mundo y estructuras derivadas ───── */
function rebuildEdges() {
  const w = S.world;
  S.edges = w.edges.filter((e) => !e.external && S.N[e.source] && S.N[e.target]).concat(S.extra.edges.filter((e) => e.status !== 'rejected' && S.N[e.source] && S.N[e.target]));
  S.out = new Map(); S.inn = new Map(); S.adj = new Map();
  const push = (m, k, e) => { let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(e); };
  for (const e of S.edges) {
    push(S.out, e.source, e); push(S.inn, e.target, e);
    if (e.kind !== 'relation' && !e.fromTest) { push(S.adj, e.source, e.target); push(S.adj, e.target, e.source); }
  }
}
function setWorld(w, keep = false) {
  S.world = w; S.now = Date.parse(w.meta.generated) || Date.now();
  S.nodes = w.nodes.filter((n) => n.kind === 'file'); S.N = Object.fromEntries(S.nodes.map((n) => [n.id, n]));
  S.dirIdx = new Map([...new Set(S.nodes.filter((n) => !n.isTest || true).map((n) => n.dir))].sort().map((d, i) => [d, i]));
  const code = S.nodes.filter((n) => !n.isTest);
  S.maxima = { loc: Math.max(1, ...S.nodes.map((n) => n.loc || 0)), fanIn: Math.max(1, ...code.map((n) => n.fanIn)), c90: Math.max(1, ...code.map((n) => n.git?.c90 || 0)), risk: Math.max(1, ...code.map((n) => n.risk.score)), dup: Math.max(1, ...code.map((n) => n.dup?.lines || 0)), impact: Math.max(1, ...code.map((n) => n.impact?.total || 0)) };
  if (!keep) loadExtra();
  for (const [id, note] of Object.entries(S.extra.notes)) if (S.N[id]) S.N[id].note = note;
  rebuildEdges();
  if (S.sel && !S.N[S.sel]) S.sel = null;
  if (S.tl != null && S.tl >= w.timeline.length) S.tl = null;
  Bus.emit('world', keep);
}

async function boot() {
  readTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => setTimeout(readTheme, 30));
  let w = LIVE ? await Backend.world().catch((e) => { console.error(e); return null; }) : WORLD;
  initUI(); initRender(); Nav.init(); initExplore(); initSets();
  if (!w || !w.nodes?.length) { $('#empty').hidden = false; return; }
  setWorld(w);
  if (LIVE) Backend.watch(async () => { try { const nw = await Backend.world(); setWorld(nw, true); toast('Proyecto actualizado'); } catch {} });
}
