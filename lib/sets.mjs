// code-graph · lib/sets.mjs — conjuntos de archivos y sus cruces (Venn / UpSet). Puro: sin DOM ni Node.
// Un conjunto se identifica con una clave («dir:src/api», «mod:2», «risk:alto»…). resolve() devuelve los ids de archivo.

const files = (w) => w.nodes.filter((n) => n.kind === 'file');
const prod = (w) => files(w).filter((n) => !n.isTest);
const stem = (n) => (n.label || n.id).replace(/\.[^.]+$/, '');
const AUTHOR_MIN = 0.2;

function reverseAdj(w) { const m = new Map(); for (const e of w.edges) { if (e.external || e.kind === 'relation' || e.fromTest) continue; (m.get(e.target) || m.set(e.target, []).get(e.target)).push(e.source); } return m; }
function forwardAdj(w) { const m = new Map(); for (const e of w.edges) { if (e.external || e.kind === 'relation' || e.fromTest) continue; (m.get(e.source) || m.set(e.source, []).get(e.source)).push(e.target); } return m; }
function closure(adj, start, cap = 5000) { const seen = new Set([start]), q = [start]; for (let h = 0; h < q.length && seen.size < cap; h++) for (const x of adj.get(q[h]) || []) if (!seen.has(x)) { seen.add(x); q.push(x); } seen.delete(start); return seen; }

/** ids de archivo de un conjunto (Set) */
export function resolve(w, key) {
  const [kind, ...rest] = key.split(':'), arg = rest.join(':'), F = files(w), P = prod(w), out = new Set();
  const add = (n) => out.add(n.id);
  switch (kind) {
    case 'dir': for (const n of P) if (n.dir === arg || n.dir.startsWith(arg + '/')) add(n); break;
    case 'mod': { const c = w.communities?.[+arg]; if (c) for (const id of c.files) out.add(id); break; }
    case 'author': for (const n of P) if (n.git?.authors?.some((a) => a.a === +arg && a.share >= AUTHOR_MIN)) add(n); break;
    case 'lang': for (const n of P) if (n.lang === arg) add(n); break;
    case 'state': for (const n of P) if (n.state === arg) add(n); break;
    case 'risk': for (const n of P) if (n.risk?.level === arg) add(n); break;
    case 'cov': for (const n of P) if (n.coverage === arg) add(n); break;
    case 'flag': for (const n of P) if (n.flags?.includes(arg)) add(n); break;
    case 'role': for (const n of P) if (n.role === arg) add(n); break;
    case 'tag': for (const n of F) if (n.tags?.includes(arg)) add(n); break;
    case 'pkg': for (const e of w.edges) if (e.external && e.target === 'pkg:' + arg) out.add(e.source); break;
    case 'deps': { const s = closure(forwardAdj(w), arg); for (const id of s) out.add(id); break; }
    case 'reach': { const s = closure(reverseAdj(w), arg); for (const id of s) out.add(id); break; }
    case 'saved': { const l = w.customSets?.[arg]; if (l) for (const id of l) out.add(id); break; }
    case 'hot': for (const n of P) if ((n.git?.c90 || 0) >= 3) add(n); break;
    case 'many': for (const n of P) if (n.fanIn >= 3) add(n); break;
    default: break;
  }
  return out;
}

/** catálogo agrupado para elegir conjuntos; cada elemento trae su tamaño */
export function catalog(w) {
  const P = prod(w), groups = [], push = (group, items) => { items = items.filter((i) => i.n > 0).sort((a, b) => b.n - a.n); if (items.length) groups.push({ group, items }); };
  const item = (key, label) => ({ key, label, n: resolve(w, key).size });
  const dirs = new Map(); for (const n of P) { const parts = n.dir.split('/'); for (let i = 1; i <= parts.length; i++) { const d = parts.slice(0, i).join('/'); dirs.set(d, (dirs.get(d) || 0) + 1); } }
  push('Carpetas', [...dirs].filter(([d, c]) => c >= 2 && d !== '(raíz)' && d !== '(externo)').slice(0, 60).map(([d]) => item('dir:' + d, d)));
  push('Módulos detectados', (w.communities || []).filter((c) => c.size >= 2).map((c) => item('mod:' + c.id, c.name)));
  push('Autores', (w.authors || []).map((a, i) => item('author:' + i, a)));
  push('Lenguajes', Object.keys(w.meta?.languages || {}).map((l) => item('lang:' + l, w.meta.langInfo?.[l]?.name || l)));
  push('Riesgo y pruebas', [item('risk:alto', 'Riesgo alto'), item('risk:medio', 'Riesgo medio'), item('cov:ninguna', 'Sin pruebas'), item('cov:directa', 'Con prueba directa'), item('cov:indirecta', 'Cubierto indirectamente'), item('many', 'Muchos dependientes (≥3)'), item('hot', 'Cambia seguido (≥3 en 90 d)')]);
  push('Banderas', [...new Set(P.flatMap((n) => n.flags || []))].map((f) => item('flag:' + f, f)));
  push('Estados', [...new Set(P.map((n) => n.state))].map((s) => item('state:' + s, s)));
  const pk = new Map(); for (const e of w.edges) if (e.external) { const p = e.target.slice(4); (pk.get(p) || pk.set(p, new Set()).get(p)).add(e.source); }
  push('Paquetes externos', [...pk].filter(([, s]) => s.size >= 2).map(([p, s]) => ({ key: 'pkg:' + p, label: p, n: s.size })));
  push('Mis conjuntos', Object.keys(w.customSets || {}).map((k) => item('saved:' + k, '★ ' + k)));
  const tg = new Set(files(w).flatMap((n) => n.tags || [])); push('Etiquetas @set', [...tg].map((t) => item('tag:' + t, t)));
  return groups;
}
export const labelOf = (w, key) => {
  const [k, ...r] = key.split(':'), a = r.join(':'), byId = new Map(w.nodes.map((n) => [n.id, n]));
  return { dir: a, mod: w.communities?.[+a]?.name || 'módulo ' + a, author: w.authors?.[+a] || 'autor', lang: w.meta?.langInfo?.[a]?.name || a, state: 'estado ' + a, risk: 'riesgo ' + a, cov: a === 'ninguna' ? 'sin pruebas' : 'prueba ' + a, flag: a, role: a, tag: '@set ' + a, saved: '★ ' + a, pkg: a, hot: 'cambia seguido', many: 'muchos dependientes', deps: 'de qué depende ' + (byId.get(a) ? stem(byId.get(a)) : a), reach: 'a quién afecta ' + (byId.get(a) ? stem(byId.get(a)) : a) }[k] || key;
};

/** regiones: máscara → ids. sets = [{key, ids:Set}] (máx. 6) */
export function regions(sets) {
  const m = new Map(), all = new Set(); sets.forEach((s) => s.ids.forEach((id) => all.add(id)));
  for (const id of all) { let mask = 0; sets.forEach((s, i) => { if (s.ids.has(id)) mask |= 1 << i; }); (m.get(mask) || m.set(mask, []).get(mask)).push(id); }
  return { byMask: m, union: all.size, regions: [...m].map(([mask, ids]) => ({ mask, ids, n: ids.length, in: sets.map((_, i) => !!(mask & (1 << i))) })).sort((a, b) => b.n - a.n) };
}

// ───────────── geometría del Venn con área proporcional ─────────────
const lens = (d, r1, r2) => {
  if (d >= r1 + r2) return 0; if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)), b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  return a + b - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
};
/** distancia entre centros para que dos círculos solapen exactamente `area` */
export function distFor(r1, r2, area) {
  const maxA = Math.PI * Math.min(r1, r2) ** 2; if (area <= 1e-9) return r1 + r2 + Math.max(r1, r2) * 0.15; if (area >= maxA - 1e-9) return Math.abs(r1 - r2);
  let lo = Math.abs(r1 - r2), hi = r1 + r2; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (lens(mid, r1, r2) > area) lo = mid; else hi = mid; } return (lo + hi) / 2;
}
/** círculos para 1–3 conjuntos: devuelve [{x,y,r}] en unidades arbitrarias + `err` (error relativo de áreas de los cruces) */
export function layoutVenn(sets) {
  const k = sets.length, n = sets.map((s) => Math.max(1, s.ids.size)), r = n.map((v) => Math.sqrt(v / Math.PI));
  const inter = (i, j) => { let c = 0; for (const id of sets[i].ids) if (sets[j].ids.has(id)) c++; return c; };
  let circles;
  if (k === 1) circles = [{ x: 0, y: 0, r: r[0] }];
  else {
    const dAB = distFor(r[0], r[1], inter(0, 1));
    circles = [{ x: 0, y: 0, r: r[0] }, { x: dAB, y: 0, r: r[1] }];
    if (k >= 3) {
      const dAC = distFor(r[0], r[2], inter(0, 2)), dBC = distFor(r[1], r[2], inter(1, 2)), x = dAB ? (dAC * dAC - dBC * dBC + dAB * dAB) / (2 * dAB) : 0, y2 = dAC * dAC - x * x;
      circles.push({ x, y: y2 > 0 ? -Math.sqrt(y2) : -Math.min(r[2], 0.2 * dAB) * 0.1, r: r[2] });
    }
    if (k === 4) { // el cuarto se coloca opuesto al tercero respecto de la recta A-B y luego se refina
      const dAD = distFor(r[0], r[3], inter(0, 3)), dBD = distFor(r[1], r[3], inter(1, 3)), x = dAB ? (dAD * dAD - dBD * dBD + dAB * dAB) / (2 * dAB) : 0, y2 = dAD * dAD - x * x;
      circles.push({ x, y: y2 > 0 ? Math.sqrt(y2) : Math.min(r[3], 0.2 * dAB) * 0.1, r: r[3] });
    }
  }
  let err = 0;
  if (k >= 3) { const target = new Map(regions(sets).regions.map((q) => [q.mask, q.n])); err = refine(circles, target, k); }
  // encajar en un cuadro de 100×100 centrado
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const c of circles) { x0 = Math.min(x0, c.x - c.r); x1 = Math.max(x1, c.x + c.r); y0 = Math.min(y0, c.y - c.r); y1 = Math.max(y1, c.y + c.r); }
  const s = 92 / Math.max(x1 - x0, y1 - y0, 1e-9), ox = 50 - ((x0 + x1) / 2) * s, oy = 50 - ((y0 + y1) / 2) * s;
  const out = circles.map((c) => ({ x: c.x * s + ox, y: c.y * s + oy, r: c.r * s }));
  return { circles: out, labels: spreadLabels(regionLabels(out), new Set(regions(sets).regions.map((q) => q.mask))), err };
}
const areasOf = (circles, k, G = 70) => { // áreas por región (máscara → área) sobre una malla
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const c of circles) { x0 = Math.min(x0, c.x - c.r); x1 = Math.max(x1, c.x + c.r); y0 = Math.min(y0, c.y - c.r); y1 = Math.max(y1, c.y + c.r); }
  const dx = (x1 - x0) / G, dy = (y1 - y0) / G, cell = dx * dy, acc = new Map();
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) { const x = x0 + (i + 0.5) * dx, y = y0 + (j + 0.5) * dy; let mask = 0; for (let q = 0; q < k; q++) { const c = circles[q]; if ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r) mask |= 1 << q; } if (mask) acc.set(mask, (acc.get(mask) || 0) + cell); }
  return acc;
};
/** Euler aproximado: ajusta posiciones (radios fijos) para acercar el área de cada región a su cantidad. Devuelve el error relativo. */
function refine(circles, target, k) {
  let seed = 12345; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const total = [...target.values()].reduce((a, b) => a + b, 0) || 1;
  const loss = () => { const a = areasOf(circles, k); let e = 0; for (let m = 1; m < 1 << k; m++) { const t = target.get(m) || 0, v = a.get(m) || 0; e += Math.abs(v - t); } return e; };
  let best = loss(), step = Math.max(...circles.map((c) => c.r)) * 0.25;
  for (let it = 0; it < 520 && step > 1e-3; it++) {
    const i = it % k, c = circles[i], ox = c.x, oy = c.y, a = rnd() * Math.PI * 2;
    c.x = ox + Math.cos(a) * step; c.y = oy + Math.sin(a) * step;
    const l = loss(); if (l < best) best = l; else { c.x = ox; c.y = oy; if (it % (k * 4) === k * 4 - 1) step *= 0.8; }
  }
  return Math.round((best / (2 * total)) * 1000) / 1000;
}
/** separa etiquetas que se pisan (regiones diminutas): devuelve mask → [x,y,área, ax,ay] con (ax,ay) la posición original */
function spreadLabels(labels, present) {
  const items = [...labels].filter(([m]) => present.has(m)).map(([mask, [x, y, c]]) => ({ mask, x, y, c, ax: x, ay: y })).sort((a, b) => a.c - b.c), R = 5.6;
  for (let it = 0; it < 80; it++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]; let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= 2 * R) continue; if (d < 0.01) { dx = 1; dy = 0.3; d = 1.04; } const push = (2 * R - d) / 2 + 0.05, wa = a.c <= b.c ? 0.7 : 0.3;  // la región más pequeña cede más
      a.x -= (dx / d) * push * wa * 2; a.y -= (dy / d) * push * wa * 2; b.x += (dx / d) * push * (1 - wa) * 2; b.y += (dy / d) * push * (1 - wa) * 2; moved = true;
    }
    for (const a of items) { a.x = Math.min(100 - R, Math.max(R, a.x)); a.y = Math.min(100 - R, Math.max(R, a.y)); }
    if (!moved) break;
  }
  return new Map(items.map((a) => [a.mask, [a.x, a.y, a.c, a.ax, a.ay]]));
}
/** posición de la etiqueta de cada región (máscara → [x,y]) por centroide de una malla de muestreo */
function regionLabels(circles) {
  const acc = new Map(), step = 1;
  for (let x = 0; x <= 100; x += step) for (let y = 0; y <= 100; y += step) {
    let mask = 0; circles.forEach((c, i) => { if ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r) mask |= 1 << i; }); if (!mask) continue;
    const a = acc.get(mask) || acc.set(mask, [0, 0, 0]).get(mask); a[0] += x; a[1] += y; a[2]++;
  }
  const out = new Map(); for (const [mask, [sx, sy, c]] of acc) out.set(mask, [sx / c, sy / c, c]); return out;
}

// ───────────── recetas ─────────────
const topBy = (arr, f, n) => arr.map((x) => [x, f(x)]).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
export const RECIPES = [
  { id: 'folder-module', title: 'Carpeta vs módulo', hint: '¿Qué archivos de una carpeta se comportan como parte de otro módulo?', pick(w) {
    const P = prod(w), top = (w.folders || []).filter((f) => f.dir.includes('/') || f.files >= 3).sort((a, b) => b.files - a.files)[0]; if (!top) return null;
    const F = resolve(w, 'dir:' + top.dir), mods = topBy((w.communities || []).filter((c) => c.size >= 2), (c) => c.files.filter((id) => F.has(id)).length, 2).filter((c) => c.files.some((id) => F.has(id)));
    return mods.length ? ['dir:' + top.dir, ...mods.map((c) => 'mod:' + c.id)] : null; },
    reading(w, rg, keys) { const out = rg.regions.filter((r) => r.in[0] && r.in.slice(1).some(Boolean)), solo = rg.regions.find((r) => r.mask === 1); const names = keys.map((k) => labelOf(w, k));
      return `${names[0]} reparte sus archivos entre ${out.length} combinaciones de módulos. ${solo ? `${solo.n} no pertenecen a ninguno de los módulos elegidos. ` : ''}Los archivos que caen en un módulo distinto del de su carpeta son candidatos a moverse o a revisar su ubicación.`; } },
  { id: 'critical', title: 'Zona crítica', hint: 'Riesgo alto, sin pruebas y con muchos dependientes: lo más peligroso de tocar.', pick: () => ['risk:alto', 'cov:ninguna', 'many'],
    reading(w, rg) { const all = rg.regions.find((r) => r.mask === 7); return all ? `${all.n} ${all.n === 1 ? 'archivo cumple' : 'archivos cumplen'} las tres condiciones: ${all.ids.slice(0, 4).map((id) => id.split('/').pop()).join(', ')}${all.n > 4 ? '…' : ''}. Empieza por escribir pruebas aquí.` : 'Ningún archivo cumple las tres condiciones a la vez; mira los cruces de dos en dos.'; } },
  { id: 'knowledge', title: 'Conocimiento compartido', hint: 'Qué conocen varios autores y qué depende de una sola persona.', pick(w) { const a = (w.authors || []).map((_, i) => 'author:' + i).map((k) => [k, resolve(w, k).size]).sort((x, y) => y[1] - x[1]).slice(0, 3).filter((x) => x[1] > 0); return a.length >= 2 ? a.map((x) => x[0]) : null; },
    reading(w, rg, keys) { const solo = rg.regions.filter((r) => r.in.filter(Boolean).length === 1); return `Cada región «solo» es conocimiento en una sola persona (${solo.map((r) => r.n).join(' / ')} archivos): si esa persona falta, nadie más lo conoce. Los cruces muestran dónde el conocimiento se comparte.`; } },
  { id: 'layers', title: 'Capas mezcladas', hint: 'Archivos que usan a la vez varios paquetes externos (p. ej. base de datos y HTTP).', pick(w) { const c = catalog(w).find((g) => g.group === 'Paquetes externos'); return c && c.items.length >= 2 ? c.items.slice(0, 3).map((i) => i.key) : null; },
    reading(w, rg) { const multi = rg.regions.filter((r) => r.in.filter(Boolean).length >= 2); const n = multi.reduce((s, r) => s + r.n, 0); return n ? `${n} archivos usan más de uno de estos paquetes: ahí se mezclan responsabilidades; suelen ser buenos candidatos a separar.` : 'Ningún archivo usa a la vez dos de estos paquetes: las capas están separadas.'; } },
  { id: 'langs', title: 'Lenguajes', hint: 'Qué lenguajes conviven (o se cruzan por @set).', pick(w) { const l = Object.keys(w.meta?.languages || {}); return l.length >= 2 ? l.slice(0, 3).map((x) => 'lang:' + x) : null; }, reading: () => 'Un archivo tiene un solo lenguaje, así que no habrá cruces: sirve para ver el peso relativo de cada uno.' },
];
export function recipe(w, id) {
  const r = RECIPES.find((x) => x.id === id); if (!r) return null; const keys = r.pick(w); if (!keys) return { recipe: r, keys: null };
  const sets = keys.map((k) => ({ key: k, ids: resolve(w, k) })); const rg = regions(sets); return { recipe: r, keys, reading: r.reading(w, rg, keys) };
}
export const MAX_SETS = 6;
