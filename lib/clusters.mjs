// code-graph · lib/clusters.mjs — galaxias y sus conjuntos. Puro: sin DOM ni Node (lo usa el visor y la demo).
// Una galaxia es un nodo grande (un módulo o una carpeta) que contiene n conjuntos con nombre:
//   agrupar por módulo  → cada galaxia se parte por carpeta
//   agrupar por carpeta → cada galaxia se parte por módulo
// packGalaxy() coloca los conjuntos dentro de la galaxia (cada uno, una mini-espiral) sin que se solapen.

export const MAX_SUBS = 6; // más conjuntos que esto se juntan en «otros»: más etiquetas no se leerían
const weight = (n) => n.fanIn * 2 + n.fanOut + (n.loc || 0) / 60;
const tail = (d, k = 2) => { const p = d.split('/'); return (p.length > k ? '…/' : '') + p.slice(-k).join('/'); };
function commonDir(dirs) {
  let p = dirs[0].split('/');
  for (const d of dirs) { const q = d.split('/'); let i = 0; while (i < p.length && p[i] === q[i]) i++; p = p.slice(0, i); }
  return p.join('/');
}

/** galaxias (ordenadas de mayor a menor) con sus miembros ordenados por importancia y sus conjuntos (subs; [] si es uno solo) */
export function groupsOf(nodes, communities = [], by = 'module') {
  const byMod = by === 'module', modName = (c) => (c >= 0 ? communities[c]?.name ?? 'módulo ' + c : 'Sin módulo'), groups = new Map();
  for (const n of nodes) {
    const key = byMod ? (n.community >= 0 ? 'm' + n.community : 'solo') : n.dir;
    if (!groups.has(key)) groups.set(key, { key, name: byMod ? modName(n.community) : n.dir, community: byMod ? n.community : null, dir: byMod ? null : n.dir, members: [] });
    groups.get(key).members.push(n);
  }
  const list = [...groups.values()].sort((a, b) => b.members.length - a.members.length);
  for (const g of list) {
    g.members.sort((a, b) => weight(b) - weight(a));
    const subs = new Map(), base = byMod ? commonDir(g.members.map((n) => n.dir || '')) : '';
    for (const n of g.members) {
      const key = byMod ? n.dir || '' : 'm' + n.community;
      if (!subs.has(key)) {
        const rel = byMod ? (n.dir && n.dir !== base ? n.dir.slice(base ? base.length + 1 : 0) : n.dir.split('/').pop() || '(raíz)') : modName(n.community);
        subs.set(key, { key, name: byMod ? tail(rel) : rel, members: [] });
      }
      subs.get(key).members.push(n);
    }
    let s = [...subs.values()].sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
    if (s.length > MAX_SUBS) { const rest = s.slice(MAX_SUBS - 1); s = s.slice(0, MAX_SUBS - 1).concat({ key: '…', name: `otros ${rest.length}`, members: rest.flatMap((x) => x.members), merged: rest.length }); }
    g.subs = s.length > 1 ? s : [];
  }
  return list;
}

/** posiciones locales (respecto al centro de la galaxia): g.R, sub.{lx,ly,r} y slot de cada miembro {sub, r, a} */
export function packGalaxy(g) {
  const slots = new Map();
  if (!g.subs.length) { // una sola espiral: el diseño de siempre
    g.members.forEach((n, k) => slots.set(n.id, { sub: null, r: k === 0 ? 0 : 34 + 22 * Math.sqrt(k), a: k * 2.39996 }));
    g.R = 40 + 22 * Math.sqrt(g.members.length) + 14; g.slots = slots; return g;
  }
  for (const s of g.subs) {
    s.members.forEach((n, k) => slots.set(n.id, { sub: s, r: k === 0 ? 0 : 16 + 19 * Math.sqrt(k), a: k * 2.39996 }));
    s.r = 22 + (s.members.length > 1 ? 16 + 19 * Math.sqrt(s.members.length - 1) : 0);
  }
  const placed = [], GAP = 22; // hueco para la etiqueta del conjunto
  for (const s of g.subs) {
    for (let rad = 0, ok = false; !ok; rad += 8) {
      const steps = Math.max(1, Math.round(rad / 10));
      for (let i = 0; i < steps && !ok; i++) {
        const ang = (i / steps) * Math.PI * 2 - Math.PI / 2 + rad * 0.05, x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
        if (placed.every((p) => Math.hypot(p.lx - x, p.ly - y) >= p.r + s.r + GAP)) { s.lx = x; s.ly = y; placed.push(s); ok = true; }
      }
    }
  }
  const mx = placed.reduce((a, s) => a + s.lx * s.members.length, 0) / g.members.length, my = placed.reduce((a, s) => a + s.ly * s.members.length, 0) / g.members.length;
  for (const s of placed) { s.lx -= mx; s.ly -= my; } // centrado por masa: la galaxia gira sobre su centro
  g.R = Math.max(...placed.map((s) => Math.hypot(s.lx, s.ly) + s.r)) + 26; g.slots = slots;
  return g;
}

/** centro y extensión (radio cuadrático medio) de un grupo de puntos [x, y]: dónde poner su etiqueta en el grafo */
export function spread(pts) {
  if (!pts.length) return null;
  let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } x /= pts.length; y /= pts.length;
  let d = 0; for (const p of pts) d += (p[0] - x) ** 2 + (p[1] - y) ** 2;
  return { x, y, r: Math.sqrt(d / pts.length) };
}
