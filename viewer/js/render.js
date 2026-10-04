/* ───────────────────────── render.js · cámara, dibujo y selección sobre el canvas ───────────────────────── */
const cv = $('#cv'), ctx = cv.getContext('2d'), mm = $('#mm'), mctx = mm.getContext('2d');
let W = 0, H = 0, DPR = 1, dirty = true, lastT = 0, fly = null, pointerPos = { x: 0, y: 0 };
const CAM = { x: 0, y: 0, k: 1, rot: 0, rotA: 0, tilt: 1 };
const PJ = { ca: 1, sa: 0, ma: 0.866, mb: -0.866, mc: 0.5, md: 0.5 };
const HIT = [], AGG_HIT = [];
const requestRender = () => { dirty = true; };

function prepProj() {
  const t = CAM.tilt; PJ.ca = Math.cos(CAM.rotA); PJ.sa = Math.sin(CAM.rotA);
  PJ.ma = 1 - t + 0.866 * t; PJ.mb = -0.866 * t; PJ.mc = 0.5 * t; PJ.md = 1 - t + 0.5 * t;
}
function proj(x, y, z = 0) {
  const dx = x - CAM.x, dy = y - CAM.y, rx = dx * PJ.ca - dy * PJ.sa, ry = dx * PJ.sa + dy * PJ.ca;
  return [W / 2 + (PJ.ma * rx + PJ.mb * ry) * CAM.k, H / 2 + (PJ.mc * rx + PJ.md * ry) * CAM.k - z * CAM.k * CAM.tilt];
}
function unproj(px, py) {
  const sx = (px - W / 2) / CAM.k, sy = (py - H / 2) / CAM.k, det = PJ.ma * PJ.md - PJ.mb * PJ.mc;
  const rx = (PJ.md * sx - PJ.mb * sy) / det, ry = (-PJ.mc * sx + PJ.ma * sy) / det;
  return [CAM.x + rx * PJ.ca + ry * PJ.sa, CAM.y - rx * PJ.sa + ry * PJ.ca];
}

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
  cv.width = Math.max(1, Math.round(W * DPR)); cv.height = Math.max(1, Math.round(H * DPR)); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  mm.width = 176 * DPR; mm.height = 120 * DPR; mm.style.width = '176px'; mm.style.height = '120px'; mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  requestRender();
}

/* ───── cámara ───── */
const minK = () => (S.VM.size >= 400 ? 0.025 : 0.15); // con muchos archivos se puede alejar más: los barrios se agrupan
function flyTo(x, y, k, ms = 650) { fly = { t0: performance.now(), ms, from: { x: CAM.x, y: CAM.y, k: CAM.k }, to: { x, y, k: clamp(k, minK(), 6) } }; requestRender(); }
function viewBox() { // región libre del escenario (sin las lentes ni la línea de tiempo)
  const lensW = $('#lens').classList.contains('collapsed') || W < 760 ? 0 : 232 * TS(), bottom = $('#tl').hidden ? 0 : 92;
  return { x0: lensW + 12, x1: W - 56, y0: 14, y1: H - bottom - 14 };
}
function fitView(animate = true, ids = null) {
  const list = ids ? ids.map((id) => S.VM.get(id)).filter(Boolean) : [...S.VM.values()]; if (!list.length) return;
  const city = S.mode === 'city'; const pts = [];
  const tx = (vm) => (S.mode === 'galaxy' ? galaxyAt(vm, performance.now() / 1000)[0] : vm.tx), ty = (vm) => (S.mode === 'galaxy' ? galaxyAt(vm, performance.now() / 1000)[1] : vm.ty);
  if (city && !ids) { const r = S.districts[0].rect; for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]) pts.push([x, y, 0]); const hmax = Math.max(...list.map((v) => v.ht)); pts.push([r.x, r.y, hmax]); }
  else for (const vm of list) { const x = tx(vm), y = ty(vm), e = city ? vm.city.w / 2 + 6 : 24; pts.push([x - e, y - e, 0], [x + e, y + e, city ? vm.ht + 22 : 0], [x + e, y - e, 0], [x - e, y + e, 0]); }
  if (!city && !ids && S.mode === 'galaxy') for (const g of S.systems) pts.push([g.cx - g.R, g.cy - g.R, 0], [g.cx + g.R, g.cy + g.R, 0]);
  // proyección con la inclinación y giro de destino
  const save = { k: CAM.k, x: CAM.x, y: CAM.y, tilt: CAM.tilt, rotA: CAM.rotA }; CAM.tilt = city ? 1 : 0; CAM.rotA = city ? CAM.rot * Math.PI / 2 : 0; prepProj();
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length; CAM.x = cx; CAM.y = cy; CAM.k = 1;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of pts) { const q = proj(p[0], p[1], p[2]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const vb = viewBox(), kf = clamp(Math.min((vb.x1 - vb.x0) / (x1 - x0 + 10), (vb.y1 - vb.y0) / (y1 - y0 + 10)), minK(), ids ? 2.6 : 2.1);
  const d1 = [(x0 + x1) / 2 - W / 2, (y0 + y1) / 2 - H / 2], off = [(vb.x0 + vb.x1) / 2 - W / 2, (vb.y0 + vb.y1) / 2 - H / 2];
  CAM.k = kf; const tgt = unproj(W / 2 + kf * d1[0] - off[0], H / 2 + kf * d1[1] - off[1]);
  Object.assign(CAM, save); prepProj();
  if (animate) flyTo(tgt[0], tgt[1], kf, 700); else { CAM.x = tgt[0]; CAM.y = tgt[1]; CAM.k = kf; fly = null; requestRender(); }
}
function flyToNode(id, k = null) {
  const vm = S.VM.get(id); if (!vm) return; const [x, y] = S.mode === 'galaxy' ? galaxyAt(vm, performance.now() / 1000) : [vm.tx, vm.ty];
  flyTo(x, y, k ?? Math.max(CAM.k, S.mode === 'city' ? 1.7 : 1.5));
}
/** Al elegir algo, la cámara lo acerca solo lo necesario para que el nombre se lea sin zoom manual. */
function ensureLegible(id) {
  const vm = S.VM.get(id); if (!vm || !vm.vis) return;
  const kMin = S.mode === 'city' ? 1.25 : 1.1, p = proj(vm.x, vm.y, S.mode === 'city' ? vm.h / 2 : 0), vb = viewBox();
  const inside = p[0] > vb.x0 + 40 && p[0] < vb.x1 - 40 && p[1] > vb.y0 + 40 && p[1] < vb.y1 - 40;
  if (CAM.k >= kMin && inside) return;
  flyToNode(id, Math.max(CAM.k, kMin));
}
function rotate(dir) { if (S.mode !== 'city') return; CAM.rot = (((CAM.rot + dir) % 4) + 4) % 4; requestRender(); }

/* ───── bucle ───── */
function update(dt, ts) {
  let anim = false;
  const tt = S.mode === 'city' ? 1 : 0, ta = S.mode === 'city' ? CAM.rot * Math.PI / 2 : 0;
  if (Math.abs(CAM.tilt - tt) > 0.002) { CAM.tilt += (tt - CAM.tilt) * Math.min(1, dt * 5); anim = true; } else CAM.tilt = tt;
  // el giro toma el camino más corto
  let dA = ta - CAM.rotA; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
  if (Math.abs(dA) > 0.002) { CAM.rotA += dA * Math.min(1, dt * 7); anim = true; } else { CAM.rotA = ta; }
  if (S.mix < 1) { S.mix = Math.min(1, S.mix + dt / 0.75); anim = true; }
  const m = ease(S.mix), time = ts / 1000;
  for (const vm of S.VM.values()) {
    if (S.mode === 'galaxy' && (S.layers.anim || S.mix < 1)) { const [gx, gy] = galaxyAt(vm, time); vm.tx = gx; vm.ty = gy; }
    vm.x = S.mix < 1 ? lerp(vm.fx, vm.tx, m) : vm.tx; vm.y = S.mix < 1 ? lerp(vm.fy, vm.ty, m) : vm.ty;
    const dh = vm.ht - vm.h, ds = vm.szt - vm.sz;
    if (Math.abs(dh) > 0.15) { vm.h += dh * Math.min(1, dt * 6); anim = true; } else vm.h = vm.ht;
    if (Math.abs(ds) > 0.05) { vm.sz += ds * Math.min(1, dt * 6); anim = true; } else vm.sz = vm.szt;
  }
  if (S.mix >= 1 && S.prevMode) S.prevMode = null;
  if (fly) { const t = clamp((performance.now() - fly.t0) / fly.ms, 0, 1), e = ease(t); CAM.x = lerp(fly.from.x, fly.to.x, e); CAM.y = lerp(fly.from.y, fly.to.y, e); CAM.k = lerp(fly.from.k, fly.to.k, e); if (t >= 1) fly = null; anim = true; }
  if (S.layers.anim && (S.mode === 'galaxy' || S.pulse)) anim = true;
  if (S.playing) { Bus.emit('tick', dt); anim = true; }
  return anim;
}
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016); lastT = ts;
  const anim = S.VM.size ? update(dt, ts) : false;
  if (dirty || anim) { dirty = false; draw(ts / 1000); }
  requestAnimationFrame(frame);
}

/* ───── ayudas de dibujo ───── */
function activeSet() {
  if (S.trace) return S.trace.nodes; if (S.path) return new Set(S.path.ids); if (S.focusSet) return S.focusSet;
  const f = S.hover || S.sel; if (!f) return null;
  const set = new Set([f]); for (const e of S.out.get(f) || []) set.add(e.target); for (const e of S.inn.get(f) || []) set.add(e.source);
  for (const c of S.world.coChange) if (S.layers.tunnels && (c.a === f || c.b === f)) { set.add(c.a); set.add(c.b); }
  return set;
}
const hullHit = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
function poly(pts, fill, stroke, lw = 1) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
function groundRing(vm, color, a, rScale = 0.78, lw = 2, dash = null) {
  const R = (vm.city.w / 2) * rScale + 6, pts = []; for (let i = 0; i < 28; i++) { const t = (i / 28) * Math.PI * 2; pts.push(proj(vm.x + Math.cos(t) * R, vm.y + Math.sin(t) * R, 0)); }
  ctx.setLineDash(dash || []); poly(pts, null, css(color, a), lw); ctx.setLineDash([]);
}
function anchor(vm) { return S.mode === 'city' || CAM.tilt > 0.5 ? proj(vm.x, vm.y, vm.h * 0.92 + 3) : proj(vm.x, vm.y, 0); }
let arcLast = null; const EDGE_LBL = [];
const addEdgeLabel = (s, color) => { if (arcLast) EDGE_LBL.push({ s, color, p: arcLast }); };
function arc(a, b, color, alpha, lw, dash = null, arrow = true, flow = 0, glow = false) {
  const A = anchor(a), B = anchor(b), mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy) || 1;
  const lift = clamp(d * 0.28, 16, 150), bend = d * 0.14, t = CAM.tilt;
  const cx = lerp(mx - (dy / d) * bend, mx, t), cy = lerp(my + (dx / d) * bend, my - lift, t);
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.quadraticCurveTo(cx, cy, B[0], B[1]);
  ctx.setLineDash(dash || []); if (flow) ctx.lineDashOffset = -flow;
  if (glow) { const fx = FX(); if (fx.shadow > 0) { ctx.save(); ctx.translate(0, 2.5); ctx.strokeStyle = `rgba(0,0,0,${((T.dark ? 0.4 : 0.22) * fx.shadow).toFixed(3)})`; ctx.lineWidth = lw + 2; ctx.stroke(); ctx.restore(); } if (fx.glow > 0) { ctx.save(); ctx.shadowColor = css(color, 0.95); ctx.shadowBlur = 14 * fx.glow * DPR; ctx.strokeStyle = css(color, alpha * 0.9); ctx.lineWidth = lw + 1.5 * fx.glow; ctx.stroke(); ctx.restore(); } }
  ctx.strokeStyle = css(color, alpha); ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  if (arrow) { const ux = (B[0] - cx), uy = (B[1] - cy), l = Math.hypot(ux, uy) || 1, s = 5 + lw * 1.5, nx = ux / l, ny = uy / l; poly([[B[0], B[1]], [B[0] - nx * s - ny * s * 0.5, B[1] - ny * s + nx * s * 0.5], [B[0] - nx * s + ny * s * 0.5, B[1] - ny * s - nx * s * 0.5]], css(color, alpha)); }
  arcLast = { A, B, C: [cx, cy] };
  return [0.25 * A[0] + 0.5 * cx + 0.25 * B[0], 0.25 * A[1] + 0.5 * cy + 0.25 * B[1]];
}
function txt(s, x, y, size, color, opts = {}) {
  ctx.font = `${opts.weight || 500} ${size}px ${opts.mono ? T.mono : (T.sans || 'system-ui, sans-serif')}`; ctx.textAlign = opts.align || 'center'; ctx.textBaseline = opts.base || 'alphabetic';
  if (opts.halo !== false) { ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = css(T.stage, 0.95); ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}


/* ───── relieve y profundidad: sombras, resplandor de relaciones y difuminado de lo que no importa ───── */
const FX = () => { const u = Look.s.ui, n = S.VM.size, big = n > 600, huge = n > 1500; return { shadow: huge ? 0 : (u.shadow ?? 0.5) * (big ? 0.6 : 1), glow: u.glow ?? 0.6, blur: big ? 0 : (u.blur ?? 0.35) }; };
const onScr = (x, y, pad = 40) => x > -pad && x < W + pad && y > -pad && y < H + pad; // recorte: lo que no se ve no se dibuja
const CAN_BLUR = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
function blurOn(fx) { if (CAN_BLUR && fx.blur > 0) ctx.filter = `blur(${(fx.blur * 2.2 * DPR).toFixed(2)}px)`; }
function blurOff() { if (CAN_BLUR) ctx.filter = 'none'; }
/** quién está relacionado con el elemento activo: dependencias (acento), dependientes (verde), ciclos (aviso) */
function buildAura() {
  const f = S.hover || S.sel, m = new Map(); if (!f || !S.layers.streets) return m;
  m.set(f, [T.accent, 1]);
  for (const e of S.out.get(f) || []) if (!e.fromTest && !m.has(e.target)) m.set(e.target, [e.kind === 'relation' ? T.pal[4] : T.accent, 0.7]);
  for (const e of S.inn.get(f) || []) if (!e.fromTest && !m.has(e.source)) m.set(e.source, [e.kind === 'relation' ? T.pal[4] : T.ok, 0.7]);
  return m;
}
function aura(x, y, rx, ry, color, a) { // mancha de color difuminada bajo/alrededor de un elemento
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); const g = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx); g.addColorStop(0, css(color, a)); g.addColorStop(1, css(color, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 7); ctx.fill(); ctx.restore();
}
function hull(pts) { // envolvente convexa (cadena monótona)
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function cityShadow(vm, dim, fx) { // sombra proyectada en el suelo: la luz viene de arriba-izquierda
  if (fx.shadow <= 0 || !vm.vis) return;
  const hw = vm.city.w / 2, hd = vm.city.d / 2, h = vm.h, o = h * 0.38 * (CAM.tilt > 0.3 ? 1 : 0.4), x = vm.x, y = vm.y;
  const base = [[x - hw, y - hd], [x + hw, y - hd], [x + hw, y + hd], [x - hw, y + hd]];
  const pts = [...base, ...base.map((c) => [c[0] + o, c[1] + o * 0.8])].map((c) => proj(c[0], c[1], 0));
  ctx.save(); ctx.fillStyle = `rgba(0,0,0,${((T.dark ? 0.42 : 0.24) * fx.shadow * (dim ? 0.35 : 1)).toFixed(3)})`;
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = (3 + Math.min(10, h * 0.12)) * fx.shadow * DPR; poly(hull(pts), ctx.fillStyle, null, 0); ctx.restore();
}

/* ───── escena: ciudad ───── */
/* zoom semántico: con muchos archivos y edificios diminutos, cada barrio se dibuja como un solo bloque (cantidad + color medio) */
let AGG = { vm: null, groups: null, medW: 0 };
function aggInfo() {
  if (AGG.vm === S.VM && AGG.n === S.VM.size) return AGG;
  const ws = [...S.VM.values()].map((v) => v.city.w).sort((x, y) => x - y), groups = new Map();
  const known = new Set(S.districts.map((d) => d.path));
  for (const vm of S.VM.values()) if (vm.vis && known.has(vm.n.dir) && vm.n.dir !== '') (groups.get(vm.n.dir) || groups.set(vm.n.dir, []).get(vm.n.dir)).push(vm);
  AGG = { vm: S.VM, n: S.VM.size, groups, medW: ws[ws.length >> 1] || 1 }; return AGG;
}
const aggPx = () => { const w = aggInfo().medW, a = proj(0, 0, 0), b = proj(w, 0, 0); return Math.hypot(a[0] - b[0], a[1] - b[1]); }; // arista media de un edificio, en píxeles
const aggOn = () => S.mode === 'city' && S.layers.aggregate !== false && S.VM.size >= 400 && aggPx() < 7.5;
function drawAggregates(dists, skip) {
  const ag = aggInfo(); AGG_HIT.length = 0;
  for (const d of S.districts) {
    const g = ag.groups.get(d.path); if (!g || !g.length) continue; const r = d.rect, pad = Math.min(r.w, r.h) * 0.06;
    const cs = [[r.x + pad, r.y + pad], [r.x + r.w - pad, r.y + pad], [r.x + r.w - pad, r.y + r.h - pad], [r.x + pad, r.y + r.h - pad]];
    const b = cs.map((q) => proj(q[0], q[1], 0)); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const q of b) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    if (x1 < -40 || x0 > W + 40 || y1 < -80 || y0 > H + 40) continue;
    let col = [0, 0, 0]; for (const vm of g) { const c = colorOf(vm.n); col[0] += c[0]; col[1] += c[1]; col[2] += c[2]; } col = col.map((v) => v / g.length);
    const h = (5 + 11 * Math.min(1, Math.sqrt(g.length) / 9)) / CAM.k, t = cs.map((q) => proj(q[0], q[1], h));
    const dim = skip && !g.some((vm) => skip.has(vm.n.id)); let f = 0, mx = -1e9; b.forEach((q, i) => { if (q[1] > mx) { mx = q[1]; f = i; } });
    const fa = [(f + 3) % 4, f], fb = [f, (f + 1) % 4], faceX = (e) => (b[e[0]][0] + b[e[1]][0]) / 2, lf = faceX(fa) < faceX(fb) ? fa : fb, rf = lf === fa ? fb : fa, al = dim ? 0.25 : 0.95;
    if (dim) blurOn(FX());
    for (const [e, sh] of [[lf, T.dark ? 0.78 : 0.86], [rf, T.dark ? 0.56 : 0.68]]) poly([b[e[0]], b[e[1]], t[e[1]], t[e[0]]], css(shade(col, sh), al), css(shade(col, 0.45), al * 0.6), 0.8);
    poly(t, css(shade(col, T.dark ? 1.18 : 1.1), al), css(shade(col, 0.5), al * 0.7), 0.9);
    if (dim) blurOff();
    const cx = (t[0][0] + t[2][0]) / 2, cy = (t[0][1] + t[2][1]) / 2;
    if (x1 - x0 > 26) txt(String(g.length), cx, cy + 4, clamp((x1 - x0) / 6, 9, 20), css(T.dark ? [255, 255, 255] : [20, 24, 32], dim ? 0.4 : 0.9), { weight: 700, align: 'center' });
    AGG_HIT.push({ path: d.path, polys: [t, [b[lf[0]], b[lf[1]], t[lf[1]], t[lf[0]]], [b[rf[0]], b[rf[1]], t[rf[1]], t[rf[0]]]], cx: (r.x + r.w / 2), cy: (r.y + r.h / 2), n: g.length });
  }
}
function drawCity(a, act, time) {
  ctx.globalAlpha = a;
  const ds = [...S.districts].sort((p, q) => p.depth - q.depth), selDir = S.sel ? S.N[S.sel]?.dir : null;
  for (const d of ds) {
    const r = d.rect, cs = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map((p) => proj(p[0], p[1], 0));
    const base = mixc(T.ground, T.ink, Math.min(0.05 * d.depth, 0.12));
    poly(cs, css(base), css(selDir === d.path ? T.accent : T.groundEdge, selDir === d.path ? 0.9 : 1), selDir === d.path ? 2 : 1);
  }
  drawSetBlobs();
  const agg = aggOn(), ag = agg ? aggInfo() : null, inAgg = (vm) => agg && ag.groups.get(vm.n.dir)?.length;
  const order = [...S.VM.values()].filter((vm) => !inAgg(vm)).map((vm) => [proj(vm.x, vm.y, 0)[1], vm]).sort((p, q) => p[0] - q[0]);
  if (agg) drawAggregates(null, act); else AGG_HIT.length = 0;
  for (const [, vm] of order) groundMarks(vm, act, time);
  for (const [, vm] of order) building(vm, act);
  ctx.globalAlpha = 1;
}
function groundMarks(vm, act, time) {
  const n = vm.n; if (!vm.vis) return;
  { const c0 = proj(vm.x, vm.y, 0), pad = Math.max(vm.city.w, vm.city.d) * CAM.k + vm.h * CAM.k * 0.6 + 60; if (!onScr(c0[0], c0[1], pad)) return; }
  const dim = act && !act.has(n.id) ? 0.25 : 1, fx = FX();
  cityShadow(vm, dim < 1, fx);
  const au = S.aura?.get(n.id); if (au && fx.glow > 0) { const c = proj(vm.x, vm.y, 0), rr = Math.max(vm.city.w, vm.city.d) * CAM.k * 1.15 + 16; aura(c[0], c[1], rr, rr * 0.55 * Math.max(0.5, CAM.tilt + 0.3), au[0], 0.5 * au[1] * fx.glow); }
  if (S.layers.cycles && n.cycle) groundRing(vm, T.warn, 0.95 * dim, 0.8, 2.5);
  if (n.state === 'caliente') { const p = S.layers.anim ? 0.5 + 0.5 * Math.sin(time * 3.2 + vm.x) : 0.6; groundRing(vm, T.warn, (0.25 + 0.4 * p) * dim, 0.85 + 0.15 * p, 3); }
  else if (n.state === 'modificado') groundRing(vm, T.amber, 0.85 * dim, 0.82, 2, [5, 4]);
  else if (n.state === 'nuevo') groundRing(vm, T.ok, 0.85 * dim, 0.82, 2, [2, 3]);
  else if (n.role === 'orphan') groundRing(vm, T.muted, 0.7 * dim, 0.8, 1.5, [3, 4]);
  if (S.tl != null && S.tlTouched?.has(n.id)) { const born = n.git?.born === S.tl; const p = (time * 1.4) % 1; groundRing(vm, born ? T.ok : T.accent, (1 - p) * 0.9, 0.7 + p * 0.9, 3); groundRing(vm, born ? T.ok : T.accent, 0.9 * dim, 0.78, 2); }
}
function building(vm, a) {
  const n = vm.n, hw = vm.city.w / 2, hd = vm.city.d / 2, x = vm.x, y = vm.y, h = vm.h;
  const dim = a && !a.has(n.id), isSel = n.id === S.sel, isHov = n.id === S.hover;
  const cs = [[x - hw, y - hd], [x + hw, y - hd], [x + hw, y + hd], [x - hw, y + hd]], b = cs.map((p) => proj(p[0], p[1], 0));
  if (!vm.vis) { ctx.setLineDash([4, 4]); poly(b, null, css(T.muted, 0.35), 1); ctx.setLineDash([]); return; }
  const t = cs.map((p) => proj(p[0], p[1], h));
  { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of b) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; } for (const p of t) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; }
    if (x1 < -30 || x0 > W + 30 || y1 < -30 || y0 > H + 30) return; // fuera de pantalla
    if (!isSel && !isHov && x1 - x0 < 7 && y1 - y0 < 12) { poly(t, css(colorOf(n), dim ? 0.25 : n.isTest ? 0.6 : 1)); HIT.push({ id: n.id, polys: [t], top: proj(x, y, h), r: 0 }); return; } } // nivel de detalle: lejos, un solo polígono
  const FXv = FX(); if (dim) blurOn(FXv);
  let f = 0, mx = -1e9; b.forEach((p, i) => { if (p[1] > mx) { mx = p[1]; f = i; } });
  const fa = [(f + 3) % 4, f], fb = [f, (f + 1) % 4];
  const faceX = (e) => (b[e[0]][0] + b[e[1]][0]) / 2, leftFace = faceX(fa) < faceX(fb) ? fa : fb, rightFace = leftFace === fa ? fb : fa;
  const col = colorOf(n), alpha = dim ? 0.2 : n.isTest ? 0.62 : 1, dk = T.dark;
  const faceFill = (e, sh) => css(shade(col, sh), alpha);
  const side = (e, sh) => poly([b[e[0]], b[e[1]], t[e[1]], t[e[0]]], faceFill(e, sh), css(shade(col, 0.45), alpha * 0.55), 0.8);
  side(leftFace, dk ? 0.78 : 0.86); side(rightFace, dk ? 0.56 : 0.68);
  if (CAM.k > 0.9 && h > 24 && CAM.tilt > 0.6 && !dim) { // pisos
    ctx.strokeStyle = css(shade(col, 0.4), 0.28); ctx.lineWidth = 0.8;
    for (let fz = 12; fz < h - 4; fz += 12) for (const e of [leftFace, rightFace]) { const p0 = proj(cs[e[0]][0], cs[e[0]][1], fz), p1 = proj(cs[e[1]][0], cs[e[1]][1], fz); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
  }
  poly(t, css(shade(col, dk ? 1.18 : 1.1), alpha), css(shade(col, 0.5), alpha * 0.7), 0.9);
  if (n.isTest) { ctx.setLineDash([3, 3]); poly(t, null, css(T.ink, dim ? 0.1 : 0.45), 1); ctx.setLineDash([]); }
  if (isSel || isHov) { ctx.lineWidth = isSel ? 2.4 : 1.6; ctx.strokeStyle = css(T.accent, 1); for (const e of [leftFace, rightFace]) { ctx.beginPath(); ctx.moveTo(b[e[0]][0], b[e[0]][1]); ctx.lineTo(t[e[0]][0], t[e[0]][1]); ctx.lineTo(t[e[1]][0], t[e[1]][1]); ctx.lineTo(b[e[1]][0], b[e[1]][1]); ctx.stroke(); } poly(t, null, css(T.accent), ctx.lineWidth); }
  if (dim) blurOff();
  HIT.push({ id: n.id, polys: [t, [b[leftFace[0]], b[leftFace[1]], t[leftFace[1]], t[leftFace[0]]], [b[rightFace[0]], b[rightFace[1]], t[rightFace[1]], t[rightFace[0]]]], top: proj(x, y, h), r: 0 });
}

/* ───── escena: galaxia ───── */
const STARS = Array.from({ length: 170 }, (_, i) => { const r = (s) => { const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); }; return [r(1), r(2), 0.4 + r(3) * 1.1, 0.25 + r(4) * 0.6]; });
function spaceBackdrop(a, time) {
  ctx.globalAlpha = a;
  if (T.dark) { for (const s of STARS) { const x = ((s[0] * W * 1.3 - CAM.x * 0.03 * s[2]) % W + W) % W, y = ((s[1] * H * 1.3 - CAM.y * 0.03 * s[2]) % H + H) % H; ctx.fillStyle = css(T.ink, s[3] * (S.layers.anim ? 0.75 + 0.25 * Math.sin(time * 1.3 + s[0] * 40) : 1)); ctx.fillRect(x, y, s[2], s[2]); } }
  else { ctx.strokeStyle = css(T.line, 0.7); ctx.lineWidth = 1; const g = 60 * CAM.k; for (let x = ((W / 2 - CAM.x * CAM.k) % g + g) % g; x < W; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = ((H / 2 - CAM.y * CAM.k) % g + g) % g; y < H; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
  ctx.globalAlpha = 1;
}
function drawGalaxy(a, act, time) {
  ctx.globalAlpha = a;
  for (const g of S.systems) {
    const [sx, sy] = proj(g.cx, g.cy, 0), R = g.R * CAM.k, c = T.pal[g.color % 8];
    const grad = ctx.createRadialGradient(sx, sy, R * 0.1, sx, sy, R); grad.addColorStop(0, css(c, T.dark ? 0.2 : 0.16)); grad.addColorStop(1, css(c, 0));
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.fill();
    ctx.setLineDash([2, 5]); ctx.strokeStyle = css(c, 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, R * 0.86, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  drawSetBlobs(); stars(a, act, true); ctx.globalAlpha = 1;
}
function stars(a, act, glow) {
  const list = [...S.VM.values()].sort((p, q) => p.sz - q.sz);
  for (const vm of list) {
    const n = vm.n, [sx, sy] = proj(vm.x, vm.y, 0), r = Math.max(3, vm.sz * CAM.k), dim = act && !act.has(n.id), col = colorOf(n), isSel = n.id === S.sel, isHov = n.id === S.hover;
    if (!vm.vis) { ctx.setLineDash([2, 3]); ctx.strokeStyle = css(T.muted, 0.3); ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 7); ctx.stroke(); ctx.setLineDash([]); continue; }
    if (!onScr(sx, sy, r * 4 + 30)) continue;
    const al = dim ? 0.18 : 1, fx = FX(), au = S.aura?.get(n.id);
    if (au && fx.glow > 0) aura(sx, sy, r * 3.2 + 10, (r * 3.2 + 10), au[0], 0.5 * au[1] * fx.glow);
    if (dim) blurOn(fx);
    if (glow && T.dark && !dim) { const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3); g.addColorStop(0, css(col, 0.5)); g.addColorStop(1, css(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, r * 3, 0, 7); ctx.fill(); }
    if (S.layers.cycles && n.cycle) { ctx.strokeStyle = css(T.warn, al); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, 7); ctx.stroke(); }
    if (n.state === 'caliente') { const p = S.layers.anim ? 0.5 + 0.5 * Math.sin(performance.now() / 300 + vm.x) : 0.6; ctx.strokeStyle = css(T.warn, (0.2 + 0.5 * p) * al); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, r + 8 + 3 * p, 0, 7); ctx.stroke(); }
    else if (n.state === 'modificado' || n.state === 'nuevo') { ctx.setLineDash([4, 3]); ctx.strokeStyle = css(n.state === 'nuevo' ? T.ok : T.amber, 0.9 * al); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(sx, sy, r + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (S.tl != null && S.tlTouched?.has(n.id)) { ctx.strokeStyle = css(T.accent, 0.95); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx, sy, r + 9, 0, 7); ctx.stroke(); }
    if (fx.shadow > 0 && !dim) { ctx.shadowColor = `rgba(0,0,0,${((T.dark ? 0.55 : 0.32) * fx.shadow).toFixed(3)})`; ctx.shadowBlur = (4 + r * 0.5) * fx.shadow * DPR; ctx.shadowOffsetY = (2 + r * 0.25) * fx.shadow * DPR; }
    ctx.beginPath(); if (n.isTest) { ctx.moveTo(sx, sy - r - 1); ctx.lineTo(sx + r + 1, sy); ctx.lineTo(sx, sy + r + 1); ctx.lineTo(sx - r - 1, sy); ctx.closePath(); } else ctx.arc(sx, sy, r, 0, 7);
    ctx.fillStyle = css(col, (n.isTest ? 0.55 : 0.95) * al); ctx.fill(); ctx.strokeStyle = css(shade(col, T.dark ? 1.35 : 0.6), al); ctx.lineWidth = 1.2; if (n.role === 'orphan') ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; if (dim) blurOff();
    if (isSel || isHov) { ctx.strokeStyle = css(T.accent); ctx.lineWidth = isSel ? 2.6 : 1.8; ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, 7); ctx.stroke(); }
    HIT.push({ id: n.id, c: [sx, sy], r: r + 4, top: [sx, sy], below: r });
  }
}
function drawGraphScene(a, act) { ctx.globalAlpha = a; drawSetBlobs(); stars(a, act, false); ctx.globalAlpha = 1; }

/* ───── capas comunes: calles, túneles, ciclos, trazas ───── */
function links(time, act) {
  const f = S.hover || S.sel, flow = S.layers.anim ? time * 36 : 0;
  const seen = new Set(); EDGE_LBL.length = 0;
  const draw = (e, color, alpha, lw, dash, label) => {
    const a = S.VM.get(e.source), b = S.VM.get(e.target); if (!a || !b || !a.vis || !b.vis) return;
    const mid = arc(a, b, color, alpha, lw, dash, e.kind !== 'relation', e.cycle ? flow : 0, !(alpha < 0.3));
    if (label && CAM.k > 0.7) addEdgeLabel(label, color);
  };
  if (S.layers.all) { let cnt = 0; for (const e of S.edges) if (!e.fromTest && e.kind !== 'relation') { const a = S.VM.get(e.source), b = S.VM.get(e.target); if (!a || !b || !a.vis || !b.vis) continue; const pa = anchor(a), pb = anchor(b); if (!onScr(pa[0], pa[1], 200) && !onScr(pb[0], pb[1], 200)) continue; if (++cnt > 2500) break; draw(e, T.ink, T.dark ? 0.12 : 0.16, 0.8, null); } }
  if (S.layers.cycles) for (const e of S.edges) if (e.cycle) { draw(e, T.warn, 0.9, 2, [6, 4]); seen.add(e.id); }
  if (S.layers.streets && f) {
    for (const e of S.out.get(f) || []) { if (seen.has(e.id)) continue; draw(e, e.kind === 'relation' ? T.pal[4] : T.accent, 0.95, e.kind === 'relation' ? 1.8 : 1.4 + Math.min(e.refs || 0, 4) * 0.3, e.kind === 'relation' ? [2, 4] : e.kind === 'dynamic' ? [7, 4] : e.kind === 'bridge' ? [2, 3] : null, e.kind === 'relation' ? (e.card || '') + (e.label ? ' · ' + e.label : '') : e.kind === 'bridge' ? (e.specs?.[0] || 'HTTP') : e.refs > 1 ? '×' + e.refs : ''); }
    for (const e of S.inn.get(f) || []) { if (seen.has(e.id)) continue; draw(e, e.kind === 'relation' ? T.pal[4] : T.ok, 0.9, e.kind === 'relation' ? 1.8 : 1.4 + Math.min(e.refs || 0, 4) * 0.3, e.kind === 'relation' ? [2, 4] : null, e.kind === 'relation' ? (e.card ? e.card.split(':').reverse().join(':') : '') : ''); }
  }
  if (S.layers.tunnels) for (const c of S.world.coChange) {
    const involves = f && (c.a === f || c.b === f); if (!c.hidden && !involves) continue;
    const a = S.VM.get(c.a), b = S.VM.get(c.b); if (!a || !b || !a.vis || !b.vis) continue;
    const mid = arc(a, b, T.amber, involves ? 0.95 : 0.5, involves ? 2.4 : 1.4, [3, 5], false, flow * 0.6, involves);
    if (involves && CAM.k > 0.6) addEdgeLabel(`juntos ${c.count}×`, T.amber);
  }
  if (S.layers.dupes && S.world.dupes) for (const g of S.world.dupes.groups) {
    const hot = g.sev === 'costosa', mine = f && g.files.includes(f), open = S.dupOpen === g.id;
    if (!mine && !open && !hot) continue;
    const col = T.pal[3], al = mine || open ? 0.95 : 0.5, lw = mine || open ? 2.4 : 1.4;
    for (let i = 0; i < g.files.length; i++) for (let j = i + 1; j < g.files.length; j++) {
      const a = S.VM.get(g.files[i]), b = S.VM.get(g.files[j]); if (!a || !b || !a.vis || !b.vis) continue;
      const mid = arc(a, b, col, al, lw, [1, 4], false, flow * 0.5, mine || open);
      if ((mine || open) && CAM.k > 0.6 && i === 0 && j === 1) addEdgeLabel(`copia ×${g.copies} · ${g.name}()`, col);
    }
  }
  if (S.trace) { // flujo desde la definición hasta quien la usa, atravesando barrels
    const tr = S.trace;
    for (const u of tr.uses) { const chain = [tr.file, ...u.via, u.file]; for (let i = 0; i < chain.length - 1; i++) { const a = S.VM.get(chain[i + 1]), b = S.VM.get(chain[i]); if (a && b) arc(a, b, u.test ? T.muted : T.accent, 0.95, 2.4, [8, 5], true, flow * 1.4, !u.test); } }
    const d = S.VM.get(tr.file); if (d && d.vis) { const A = anchor(d); ctx.strokeStyle = css(T.accent); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(A[0], A[1], 11 + 3 * Math.sin(time * 4), 0, 7); ctx.stroke(); }
  }
  if (S.path) for (let i = 0; i < S.path.ids.length - 1; i++) { const a = S.VM.get(S.path.ids[i]), b = S.VM.get(S.path.ids[i + 1]); if (a && b) arc(a, b, T.amber, 1, 3, [10, 5], true, flow * 1.4, true); }
}

/* ───── etiquetas con acomodo automático ─────
   Cada etiqueta prueba varias posiciones alrededor de su elemento (arriba, abajo, lados, diagonales y anillos más lejanos)
   y se queda con la primera que no pisa a otra etiqueta, a otro elemento del mapa ni a los paneles flotantes.
   Si hubo que alejarla, se une a su elemento con una línea fina. Recuerda la posición elegida para no «bailar» al mover la cámara. */
const LBL_MEMO = new Map(), TW = new Map();
let hudCache = { t: 0, r: [] };
function textW(s, size, weight) { const key = weight + size + s; let w = TW.get(key); if (w === undefined) { ctx.font = `${weight} ${size}px ${T.sans || 'system-ui, sans-serif'}`; w = ctx.measureText(s).width; if (TW.size > 3000) TW.clear(); TW.set(key, w); } return w; }
function hudRects() { // paneles flotantes sobre el lienzo, en coordenadas del lienzo
  const now = performance.now(); if (now - hudCache.t < 400) return hudCache.r;
  const cb = cv.getBoundingClientRect(), out = [];
  for (const sel of ['#lens', '#tools', '#mm', '#tl', '#look', '#tour']) { const el = $(sel); if (!el || el.hidden) continue; const r = el.getBoundingClientRect(); if (r.width) out.push([r.left - cb.left - 4, r.top - cb.top - 4, r.right - cb.left + 4, r.bottom - cb.top + 4]); }
  hudCache = { t: now, r: out }; return out;
}
function makePlacer() {
  const CELL = 56, grid = new Map(), all = [];
  const cells = (r, f) => { for (let gx = Math.floor(r[0] / CELL); gx <= Math.floor(r[2] / CELL); gx++) for (let gy = Math.floor(r[1] / CELL); gy <= Math.floor(r[3] / CELL); gy++) f(gx + ',' + gy); };
  const add = (r, owner = null) => { const o = { r, owner }; all.push(o); cells(r, (c) => (grid.get(c) || grid.set(c, []).get(c)).push(o)); };
  const free = (r, owner = null) => {
    if (r[0] < 4 || r[1] < 4 || r[2] > W - 4 || r[3] > H - 4) return false;
    let ok = true; const seen = new Set();
    cells(r, (c) => { if (!ok) return; for (const o of grid.get(c) || []) { if (seen.has(o)) continue; seen.add(o); if (o.owner !== null && o.owner === owner) continue; if (!(r[2] < o.r[0] || r[0] > o.r[2] || r[3] < o.r[1] || r[1] > o.r[3])) { ok = false; return; } } });
    return ok;
  };
  return { add, free };
}
/** candidatos alrededor de un ancla (ax, ay) con radio ra, para una caja w×h; el primero respeta la preferencia (arriba o abajo) */
function candidates(ax, ay, ra, w, h, pref) {
  const out = [], g = 4, up = pref !== 'down';
  for (let ring = 0; ring < 4; ring++) {
    const d = ra + g + ring * (h * 0.85), hx = w / 2 + ra + g + ring * (h * 0.85);
    const dirs = up ? [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]] : [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const [dx, dy] of dirs) {
      const cx = ax + (dx === 0 ? 0 : dx * (hx + (dy ? -w / 2 + 6 : 0))), cy = ay + (dy === 0 ? 0 : dy * (d + h / 2)) + (dy === 0 ? 0 : 0);
      out.push([cx, cy, ring]);
    }
  }
  return out;
}
const boxOf = (cx, cy, w, h) => [cx - w / 2 - 3, cy - h / 2 - 2, cx + w / 2 + 3, cy + h / 2 + 2];
function leader(ax, ay, r, color) { // línea fina del elemento a su etiqueta
  const nx = Math.max(r[0], Math.min(ax, r[2])), ny = Math.max(r[1], Math.min(ay, r[3]));
  ctx.strokeStyle = css(color, 0.55); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(nx, ny); ctx.stroke();
}
function bezPt(p, t) { const u = 1 - t; return [u * u * p.A[0] + 2 * u * t * p.C[0] + t * t * p.B[0], u * u * p.A[1] + 2 * u * t * p.C[1] + t * t * p.B[1]]; }

function labels() {
  if (!S.layers.labels) return;
  const k = CAM.k, city = S.mode === 'city', P = makePlacer(), dn = Look.s.ui.density;
  for (const r of hudRects()) P.add(r);
  const live = new Set();
  // 1) nombres de barrios / sistemas: fijos; el resto se acomoda a su alrededor
  const big = (s, x, y, size, color) => { const w = textW(s, size, 700); P.add(boxOf(x, y - size * 0.35, w, size)); txt(s, x, y, size, color, { weight: 700 }); };
  if (city) {
    for (const d of S.districts) {
      if (d.depth === 0 || d.depth > (k > 1.1 ? 3 : 1)) continue;
      const r = d.rect, c = [proj(r.x, r.y, 0), proj(r.x + r.w, r.y, 0), proj(r.x + r.w, r.y + r.h, 0), proj(r.x, r.y + r.h, 0)].sort((a, b) => a[1] - b[1]);
      const mx = (c[0][0] + c[1][0]) / 2, my = (c[0][1] + c[1][1]) / 2; if (Math.hypot(c[0][0] - c[1][0], c[0][1] - c[1][1]) < 40) continue;
      big(d.name.toUpperCase(), mx, my + 14, clamp(12 + k * 2, 12, 17) * TS(), css(T.muted, 1));
    }
  } else for (const g of S.systems) { const [sx, sy] = proj(g.cx, g.cy, 0); big(`${g.name}`, sx, sy - g.R * k + 4, clamp(12 + k * 2, 12, 17) * TS(), css(T.muted, 1)); }
  // 2) marcadores de los elementos (para que ninguna etiqueta los tape)
  const act = activeSet(), size = clamp(12 + k * 1.5, 12.5, 16) * TS(), items = [];
  for (const vm of S.VM.values()) {
    if (!vm.vis) continue; const n = vm.n, isSel = n.id === S.sel, isHov = n.id === S.hover;
    let ax, ay, ra;
    { const q = proj(vm.x, vm.y, 0); if (!onScr(q[0], q[1], 80)) continue; }
    if (city) { const p = proj(vm.x, vm.y, vm.h); ax = p[0]; ay = p[1]; ra = Math.max(5, Math.max(vm.city.w, vm.city.d) * k * 0.45); P.add([ax - ra, ay - ra * 0.7, ax + ra, ay + ra * 0.7], n.id); }
    else { const p = proj(vm.x, vm.y, 0); ax = p[0]; ay = p[1]; ra = Math.max(3, vm.sz * k) + 3; P.add([ax - ra, ay - ra, ax + ra, ay + ra], n.id); }
    const imp = n.fanIn * 3 + n.fanOut + (n.risk?.score || 0) / 25 + (n.loc || 0) / 80;
    items.push({ vm, n, ax, ay, ra, imp: (isSel ? 1e6 : 0) + (isHov ? 9e5 : 0) + (act && act.has(n.id) && act.size < S.nodes.length ? 5e4 : 0) + imp, force: isSel || isHov });
  }
  const sv = S.sel && S.VM.get(S.sel); // pin de la selección
  if (sv && sv.vis) { const A = city ? proj(sv.x, sv.y, sv.h + 34) : proj(sv.x, sv.y, 0), y = city ? A[1] : A[1] - Math.max(3, sv.sz * k) - 22; P.add([A[0] - 8, y - 2, A[0] + 8, y + 12]); }
  // 3) etiquetas de relaciones (primero: son las más específicas)
  const esz = 12 * TS();
  for (const el of EDGE_LBL) {
    const w = textW(el.s, esz, 700) + 10, h = esz + 6; let done = false;
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      const [x, y] = bezPt(el.p, t);
      for (const dy of [0, -h, h]) { const r = boxOf(x, y + dy, w, h); if (P.free(r)) { P.add(r); pill(el.s, x, y + dy, esz, el.color, w, h); done = true; break; } }
      if (done) break;
    }
  }
  // 4) etiquetas de archivos por importancia
  items.sort((a, b) => b.imp - a.imp);
  const cap = dn === 'min' ? Math.min(items.length, k < 0.85 ? 4 : 10) : dn === 'max' ? (k < 0.4 ? 12 : items.length) : k < 0.55 ? Math.min(items.length, 6) : k < 0.85 ? Math.ceil(items.length * 0.4) : items.length;
  const pref = city ? 'up' : 'down';
  items.forEach((it, i) => {
    const n = it.n; if (!it.force && i >= cap && !(act && act.has(n.id) && S.hover)) return;
    const s = stem(n), weight = it.force ? 700 : 500, w = textW(s, size, weight), h = size, col = css(T.ink, act && !act.has(n.id) ? 0.3 : 1);
    const cand = candidates(it.ax, it.ay, it.ra, w, h, pref), memo = LBL_MEMO.get(n.id);
    const order = memo !== undefined && memo < cand.length ? [memo, ...cand.keys()].filter((v, j, a) => a.indexOf(v) === j) : [...cand.keys()];
    let pick = -1;
    for (const ci of order) { const [cx, cy] = cand[ci]; if (P.free(boxOf(cx, cy, w, h), n.id)) { pick = ci; break; } }
    if (pick < 0) { if (!it.force) { LBL_MEMO.delete(n.id); return; } pick = 0; }
    const [cx, cy, ring] = cand[pick], r = boxOf(cx, cy, w, h); live.add(n.id); LBL_MEMO.set(n.id, pick); P.add(r, n.id);
    if (ring >= 1 || (pick > 1 && ring === 0 && Math.abs(cx - it.ax) > w / 2)) leader(it.ax, it.ay, r, act && !act.has(n.id) ? T.muted : T.ink);
    txt(s, cx, cy + h * 0.35, size, col, { weight });
  });
  if (LBL_MEMO.size > 4000) LBL_MEMO.clear();
  // pin sobre la selección
  const s = sv; if (s && s.vis) { const A = city ? proj(s.x, s.y, s.h + 34) : proj(s.x, s.y, 0), bob = S.layers.anim ? Math.sin(performance.now() / 260) * 2.5 : 0, y = (city ? A[1] : A[1] - Math.max(3, s.sz * k) - 22) + bob; poly([[A[0], y + 9], [A[0] - 6, y], [A[0] + 6, y]], css(T.accent)); }
}
function pill(s, x, y, size, color, w, h) { // etiqueta de relación sobre un fondo suave, para que se lea sobre las líneas
  ctx.fillStyle = css(T.stage, 0.82); ctx.beginPath(); const r = h / 2, x0 = x - w / 2, y0 = y - h / 2; ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r); ctx.arcTo(x0, y0 + h, x0, y0, r); ctx.arcTo(x0, y0, x0 + w, y0, r); ctx.fill();
  ctx.strokeStyle = css(color, 0.55); ctx.lineWidth = 1; ctx.stroke(); txt(s, x, y + size * 0.35, size, css(color, 1), { weight: 700, halo: false });
}

/* ───── dibujo principal ───── */
function draw(time) {
  if (S.panCache) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = css(T.stage); ctx.fillRect(0, 0, W, H); ctx.drawImage(S.panCache.c, S.panCache.dx, S.panCache.dy, W, H); return; }
  prepProj(); HIT.length = 0;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H); ctx.fillStyle = css(T.stage); ctx.fillRect(0, 0, W, H);
  S.pulse = [...S.VM.values()].some((v) => v.vis && (v.n.state === 'caliente')) || S.tl != null;
  const act = activeSet(), m = S.mix < 1 ? ease(S.mix) : 1; S.aura = buildAura();
  if (S.mode === 'galaxy' || (S.prevMode === 'galaxy' && S.mix < 1)) spaceBackdrop(S.mode === 'galaxy' ? m : 1 - m, time);
  const scene = { city: drawCity, galaxy: drawGalaxy, graph: drawGraphScene };
  if (S.mix < 1 && S.prevMode) { const keep = HIT.length; scene[S.prevMode](1 - m, act, time); HIT.length = keep; }
  scene[S.mode](m, act, time);
  links(time, act); drawSetMarks(); labels(); drawMini();
}

function drawMini() {
  const w = 176, h = 120; mctx.clearRect(0, 0, w, h); const list = [...S.VM.values()]; if (!list.length) return;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const v of list) { x0 = Math.min(x0, v.tx); x1 = Math.max(x1, v.tx); y0 = Math.min(y0, v.ty); y1 = Math.max(y1, v.ty); }
  if (S.mode === 'city') { const r = S.districts[0].rect; x0 = r.x; x1 = r.x + r.w; y0 = r.y; y1 = r.y + r.h; } else if (S.mode === 'galaxy') for (const g of S.systems) { x0 = Math.min(x0, g.cx - g.R); x1 = Math.max(x1, g.cx + g.R); y0 = Math.min(y0, g.cy - g.R); y1 = Math.max(y1, g.cy + g.R); }
  const pad = 10, sc = Math.min((w - 2 * pad) / Math.max(1, x1 - x0), (h - 2 * pad) / Math.max(1, y1 - y0)), ox = w / 2 - ((x0 + x1) / 2) * sc, oy = h / 2 - ((y0 + y1) / 2) * sc;
  S.mini = { sc, ox, oy };
  const P = (x, y) => [x * sc + ox, y * sc + oy];
  if (S.mode === 'city') for (const d of S.districts) { const a = P(d.rect.x, d.rect.y); mctx.strokeStyle = css(T.groundEdge, 0.9); mctx.strokeRect(a[0], a[1], d.rect.w * sc, d.rect.h * sc); }
  for (const v of list) { const p = P(v.x, v.y); mctx.fillStyle = css(colorOf(v.n), v.vis ? 0.95 : 0.2); mctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3); }
  const sel = S.sel && S.VM.get(S.sel); if (sel) { const p = P(sel.x, sel.y); mctx.strokeStyle = css(T.accent); mctx.lineWidth = 1.5; mctx.strokeRect(p[0] - 4, p[1] - 4, 8, 8); }
  prepProj(); const q = [[0, 0], [W, 0], [W, H], [0, H]].map(([px, py]) => { const u = unproj(px, py); return P(u[0], u[1]); });
  mctx.beginPath(); q.forEach((p, i) => (i ? mctx.lineTo(p[0], p[1]) : mctx.moveTo(p[0], p[1]))); mctx.closePath(); mctx.strokeStyle = css(T.accent); mctx.lineWidth = 1.4; mctx.stroke();
}

/* ───── puntero ───── */
function pickAgg(px, py) { for (let i = AGG_HIT.length - 1; i >= 0; i--) if (AGG_HIT[i].polys.some((p) => hullHit(p, px, py))) return AGG_HIT[i]; return null; }
function pick(px, py) {
  for (let i = HIT.length - 1; i >= 0; i--) {
    const h = HIT[i];
    if (h.polys) { if (h.polys.some((p) => hullHit(p, px, py))) return h.id; }
    else if (Math.hypot(h.c[0] - px, h.c[1] - py) <= Math.max(h.r + 2, 14)) return h.id;
  }
  return null;
}
const pointers = new Map(); let gesture = null;
function initRender() {
  resize(); new ResizeObserver(() => { resize(); }).observe(cv);
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); const r = cv.getBoundingClientRect(); pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (pointers.size === 1) gesture = { moved: false, sx: e.clientX, sy: e.clientY, id: pick(e.clientX - r.left, e.clientY - r.top) }; else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; gesture = { pinch: Math.hypot(a.x - b.x, a.y - b.y), moved: true }; }
    fly = null;
  });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; pointerPos = { x, y };
    if (pointers.has(e.pointerId)) {
      const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, { x, y });
      if (pointers.size === 2 && gesture?.pinch) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), f = d / gesture.pinch; gesture.pinch = d; zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, f); }
      else if (gesture) {
        if (!gesture.moved && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 4) { gesture.moved = true; cv.classList.add('drag'); startPanCache(); }
        if (gesture.moved && S.panCache) { S.panCache.dx += x - prev.x; S.panCache.dy += y - prev.y; prepProj(); const a = unproj(prev.x, prev.y), b = unproj(x, y); CAM.x += a[0] - b[0]; CAM.y += a[1] - b[1]; requestRender(); }
        else if (gesture.moved) { prepProj(); const a = unproj(prev.x, prev.y), b = unproj(x, y); CAM.x += a[0] - b[0]; CAM.y += a[1] - b[1]; requestRender(); }
      }
      return;
    }
    const id = pick(x, y); cv.classList.toggle('hit', !!id); if (id !== S.hover) hoverNode(id);
  });
  const up = (e) => {
    const g = gesture; pointers.delete(e.pointerId); cv.classList.remove('drag'); if (pointers.size) return; gesture = null; if (S.panCache) { S.panCache = null; requestRender(); }
    if (g && !g.moved && !g.pinch) { const r = cv.getBoundingClientRect(), id = pick(e.clientX - r.left, e.clientY - r.top); if (id) selectNode(id); else { const ag = pickAgg(e.clientX - r.left, e.clientY - r.top); if (ag) { flyTo(ag.cx, ag.cy, clamp(4.2 / aggInfo().medW, CAM.k * 1.6, 6)); toast(`${ag.n} archivos en ${ag.path}: acercando…`); } else clearSelection(); } }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (!pointers.size && S.hover) hoverNode(null); });
  cv.addEventListener('dblclick', (e) => { const r = cv.getBoundingClientRect(), id = pick(e.clientX - r.left, e.clientY - r.top); if (id) { selectNode(id); focusNeighborhood(id); } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); fly = null; zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
  mm.addEventListener('pointerdown', (e) => {
    if (!S.mini) return; const r = mm.getBoundingClientRect(), x = (e.clientX - r.left - S.mini.ox) / S.mini.sc, y = (e.clientY - r.top - S.mini.oy) / S.mini.sc; flyTo(x, y, CAM.k, 450);
  });
  requestAnimationFrame(frame);
}
/** Con muchos archivos, mientras arrastras se mueve una «foto» del mapa (barato) y al soltar se redibuja completo. */
function startPanCache() {
  if (S.VM.size < 300 || S.mix < 1) return; const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); S.panCache = { c, dx: 0, dy: 0 };
}
function zoomAt(px, py, f) { prepProj(); const a = unproj(px, py); CAM.k = clamp(CAM.k * f, minK(), 6); prepProj(); const b = unproj(px, py); CAM.x += a[0] - b[0]; CAM.y += a[1] - b[1]; requestRender(); }

Bus.on('world', (keep) => { if (!keep) { CAM.rot = 0; CAM.rotA = 0; CAM.tilt = S.mode === 'city' ? 1 : 0; setTimeout(() => fitView(false), 0); } requestRender(); });
Bus.on('mode', () => { fitView(true); requestRender(); });
Bus.on('theme', () => requestRender());
