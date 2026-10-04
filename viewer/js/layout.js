/* ───────────────────────── layout.js · ciudad, galaxia y grafo ───────────────────────── */
S.VM = new Map(); S.districts = []; S.systems = [];

function locAt(n) {
  if (S.tl == null || !n.git || !n.git.grow?.length) return n.loc || 0;
  let last = null; for (const [i, l] of n.git.grow) { if (i <= S.tl) last = l; else break; }
  if (last == null) return 0;
  const fin = n.git.grow[n.git.grow.length - 1][1] || 1; return (n.loc || 0) * Math.min(1, last / fin);
}
const visibleAt = (n) => S.tl == null || !n.git || n.git.born <= S.tl;
function metric(n) {
  switch (S.lens.size) {
    case 'fanin': return n.fanIn / S.maxima.fanIn;
    case 'churn': return (n.git?.c90 || 0) / S.maxima.c90;
    case 'risk': return n.isTest ? 0 : n.risk.score / S.maxima.risk;
    case 'dup': return (n.dup?.lines || 0) / S.maxima.dup;
    case 'impact': return n.isTest ? 0 : (n.impact?.total || 0) / S.maxima.impact;
    default: return locAt(n) / S.maxima.loc;
  }
}
/** altura (ciudad) y radio (galaxia/grafo) objetivo de cada nodo */
function applySizes(snap) {
  for (const vm of S.VM.values()) {
    const n = vm.n, m = Math.sqrt(clamp(metric(n), 0, 1)), vis = visibleAt(n);
    vm.vis = vis; vm.ht = vis ? (8 + 84 * m * Look.s.ui.height) * (n.isTest ? 0.6 : 1) : 0; vm.szt = vis ? 4.5 + 11 * m : 3;
    if (snap) { vm.h = vm.ht; vm.sz = vm.szt; }
  }
}

function squarify(items, rect) {
  const total = items.reduce((s, i) => s + i.w, 0), scale = (rect.w * rect.h) / total;
  let rest = items.map((i) => ({ i, a: i.w * scale })), r = { ...rect };
  const worst = (areas, sum, side) => Math.max((side * side * Math.max(...areas)) / (sum * sum), (sum * sum) / (side * side * Math.min(...areas)));
  while (rest.length) {
    const side = Math.min(r.w, r.h); let row = [], rowA = 0, best = Infinity;
    for (let k = 0; k < rest.length; k++) {
      const next = row.concat(rest[k]), nextA = rowA + rest[k].a, wr = worst(next.map((x) => x.a), nextA, side);
      if (row.length && wr > best) break; row = next; rowA = nextA; best = wr;
    }
    const th = rowA / side;
    if (r.w >= r.h) { let y = r.y; for (const it of row) { const h = it.a / th; it.i.r = { x: r.x, y, w: th, h }; y += h; } r = { x: r.x + th, y: r.y, w: r.w - th, h: r.h }; }
    else { let x = r.x; for (const it of row) { const w = it.a / th; it.i.r = { x, y: r.y, w, h: th }; x += w; } r = { x: r.x, y: r.y + th, w: r.w, h: r.h - th }; }
    rest = rest.slice(row.length);
  }
}

function buildCity() {
  const root = { name: S.world.meta.root, path: '', dirs: new Map(), files: [], depth: 0 };
  for (const n of S.nodes) {
    const parts = n.id.split('/'); let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let nx = cur.dirs.get(parts[i]);
      if (!nx) { nx = { name: parts[i], path: (cur.path ? cur.path + '/' : '') + parts[i], dirs: new Map(), files: [], depth: cur.depth + 1 }; cur.dirs.set(parts[i], nx); }
      cur = nx;
    }
    cur.files.push(n);
  }
  const wf = (n) => 1 + Math.sqrt(n.loc || 1) / 5;
  const wOf = (d) => (d.w = d.files.reduce((s, n) => s + wf(n), 0) + [...d.dirs.values()].reduce((s, c) => s + wOf(c) * 1.1, 0));
  const total = wOf(root) * 4700, W = Math.sqrt(total * 1.5), H = total / W;
  S.districts = [{ path: '', name: root.name, depth: 0, rect: { x: -W / 2, y: -H / 2, w: W, h: H } }];
  const place = (d, rect) => {
    const items = [...d.dirs.values()].map((c) => ({ kind: 'dir', ref: c, w: c.w * 1.1 })).concat(d.files.map((n) => ({ kind: 'file', ref: n, w: wf(n) })));
    if (!items.length) return;
    items.sort((a, b) => b.w - a.w); squarify(items, rect);
    for (const it of items) {
      const r = it.r;
      if (it.kind === 'dir') {
        const m = Math.min(11, r.w * 0.08, r.h * 0.08), inner = { x: r.x + m, y: r.y + m, w: r.w - 2 * m, h: r.h - 2 * m };
        S.districts.push({ path: it.ref.path, name: it.ref.name, depth: it.ref.depth, rect: { x: r.x, y: r.y, w: r.w, h: r.h } });
        place(it.ref, inner);
      } else { const vm = S.VM.get(it.ref.id), s = clamp(Math.min(r.w, r.h) - 18, 24, 80); vm.city = { x: r.x + r.w / 2, y: r.y + r.h / 2, w: s, d: s }; }
    }
  };
  place(root, { x: -W / 2, y: -H / 2, w: W, h: H });
  S.cityBox = { w: W, h: H };
}

function buildGalaxy() {
  const groups = new Map();
  for (const n of S.nodes) {
    const key = S.group === 'module' ? (n.community >= 0 ? 'm' + n.community : 'solo') : n.dir;
    if (!groups.has(key)) groups.set(key, { key, name: S.group === 'module' ? (n.community >= 0 ? S.world.communities[n.community].name : 'Sin módulo') : n.dir, color: S.group === 'module' ? (n.community >= 0 ? n.community : 7) : S.dirIdx.get(n.dir) ?? 0, members: [] });
    groups.get(key).members.push(n);
  }
  const list = [...groups.values()].sort((a, b) => b.members.length - a.members.length);
  for (const g of list) {
    g.members.sort((a, b) => (b.fanIn * 2 + b.fanOut + (b.loc || 0) / 60) - (a.fanIn * 2 + a.fanOut + (a.loc || 0) / 60));
    g.members.forEach((n, k) => {
      const r = k === 0 ? 0 : 34 + 22 * Math.sqrt(k), a = k * 2.39996; const vm = S.VM.get(n.id);
      vm.gal = { r, a, sp: k === 0 ? 0 : 0.5 / Math.sqrt(r + 30), g };
    });
    g.R = 40 + 22 * Math.sqrt(g.members.length) + 14;
  }
  const placed = [];
  for (const g of list) {
    for (let rad = 0, ok = false; !ok; rad += 16) {
      const steps = Math.max(1, Math.round(rad / 20));
      for (let s = 0; s < steps && !ok; s++) {
        const ang = (s / steps) * Math.PI * 2 + rad * 0.07, x = Math.cos(ang) * rad * 1.15, y = Math.sin(ang) * rad * 0.9;
        if (placed.every((p) => Math.hypot(p.cx - x, p.cy - y) >= p.R + g.R + 26)) { g.cx = x; g.cy = y; placed.push(g); ok = true; }
      }
    }
  }
  S.systems = list;
}
const galaxyAt = (vm, t) => { const g = vm.gal, a = g.a + (S.layers.anim ? g.sp * t : 0); return [g.g.cx + Math.cos(a) * g.r, g.g.cy + Math.sin(a) * g.r]; };

function buildGraph() {
  const V = [...S.VM.values()]; if (!V.length) return;
  V.forEach((vm, i) => { vm.gvx = 0; vm.gvy = 0; const [x, y] = galaxyAt(vm, 0); vm.graph = { x: x * 1.25 + Math.sin(i * 7) * 14, y: y * 1.25 + Math.cos(i * 5) * 14 }; vm.gx = vm.graph.x; vm.gy = vm.graph.y; });
  const idx = new Map(V.map((vm, i) => [vm.n.id, i])), E = [];
  for (const e of S.edges) {
    const a = idx.get(e.source), b = idx.get(e.target); if (a == null || b == null || a === b) continue;
    E.push([a, b, e.kind === 'relation' ? 0.35 : e.fromTest ? 0.5 : 1, e.kind === 'relation' ? 150 : e.fromTest ? 90 : 105]);
  }
  const iters = clamp(Math.round(90000 / V.length), V.length > 4000 ? 30 : V.length > 1500 ? 50 : 120, 420);
  const CELL = 300; // repulsión solo entre vecinos a < 300 px: rejilla espacial en vez de comparar todos con todos (O(N) en vez de O(N²))
  for (let it = 0; it < iters; it++) {
    const alpha = 1 - it / iters, grid = new Map();
    for (let i = 0; i < V.length; i++) { const key = Math.floor(V[i].gx / CELL) * 100003 + Math.floor(V[i].gy / CELL); (grid.get(key) || grid.set(key, []).get(key)).push(i); }
    for (let i = 0; i < V.length; i++) {
      const A = V[i], cx = Math.floor(A.gx / CELL), cy = Math.floor(A.gy / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const cell = grid.get((cx + ox) * 100003 + (cy + oy)); if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue; const B = V[j]; let dx = B.gx - A.gx, dy = B.gy - A.gy, d2 = dx * dx + dy * dy; if (d2 > 90000) continue; if (d2 < 0.01) { dx = 0.1; dy = 0.1; d2 = 0.02; }
          const d = Math.sqrt(d2), f = (5200 / d2) * alpha + (d < 46 ? (46 - d) * 0.15 : 0); const fx = (dx / d) * f, fy = (dy / d) * f;
          A.gvx = (A.gvx || 0) - fx; A.gvy = (A.gvy || 0) - fy; B.gvx = (B.gvx || 0) + fx; B.gvy = (B.gvy || 0) + fy;
        }
      }
    }
    for (const [a, b, w, L] of E) {
      const A = V[a], B = V[b], dx = B.gx - A.gx, dy = B.gy - A.gy, d = Math.hypot(dx, dy) || 1, f = (d - L) * 0.02 * w * (0.4 + alpha);
      A.gvx += (dx / d) * f; A.gvy += (dy / d) * f; B.gvx -= (dx / d) * f; B.gvy -= (dy / d) * f;
    }
    for (const vm of V) {
      const g = vm.gal.g; vm.gvx += (-vm.gx * 0.004 + (g.cx * 1.25 - vm.gx) * 0.006) * (0.3 + alpha); vm.gvy += (-vm.gy * 0.004 + (g.cy * 1.25 - vm.gy) * 0.006) * (0.3 + alpha);
      vm.gvx *= 0.62; vm.gvy *= 0.62; vm.gx += vm.gvx; vm.gy += vm.gvy;
    }
  }
  for (const vm of V) vm.graph = { x: vm.gx, y: vm.gy };
}

function computeLayouts(keep) {
  const prev = S.VM; S.VM = new Map();
  for (const n of S.nodes) {
    const o = prev.get(n.id);
    S.VM.set(n.id, { n, x: o?.x ?? 0, y: o?.y ?? 0, tx: 0, ty: 0, fx: o?.x ?? 0, fy: o?.y ?? 0, h: o?.h ?? 0, ht: 0, sz: o?.sz ?? 4, szt: 4, vis: true, city: { x: 0, y: 0, w: 40, d: 40 }, gal: { r: 0, a: 0, sp: 0 }, graph: { x: 0, y: 0 }, fresh: !o });
  }
  buildCity(); buildGalaxy(); buildGraph(); applySizes(!keep);
  retarget(!keep);
}
function targetOf(vm, t = 0) {
  if (S.mode === 'city') return [vm.city.x, vm.city.y];
  if (S.mode === 'galaxy') return galaxyAt(vm, t);
  return [vm.graph.x, vm.graph.y];
}
function retarget(snap) {
  for (const vm of S.VM.values()) {
    const [tx, ty] = targetOf(vm, 0); vm.tx = tx; vm.ty = ty;
    if (snap || vm.fresh) { vm.x = tx; vm.y = ty; vm.fx = tx; vm.fy = ty; vm.fresh = false; } else { vm.fx = vm.x; vm.fy = vm.y; }
  }
}
function setMode(m) {
  if (m === S.mode) return;
  S.prevMode = S.mode; S.mode = m; S.mix = 0;
  for (const vm of S.VM.values()) { vm.fx = vm.x; vm.fy = vm.y; const [tx, ty] = targetOf(vm, performance.now() / 1000); vm.tx = tx; vm.ty = ty; }
  if (S.VM.size > 1500) { S.mix = 1; CAM.tilt = m === 'city' ? 1 : 0; S.prevMode = null; for (const vm of S.VM.values()) { vm.x = vm.tx; vm.y = vm.ty; } } // proyectos enormes: cambio de vista directo, sin animación
  Bus.emit('mode', m);
}
function setGroup(g) { S.group = g; buildGalaxy(); buildGraph(); retarget(false); S.mix = 0; Bus.emit('mode', S.mode); }

Bus.on('world', (keep) => { computeLayouts(keep); });
