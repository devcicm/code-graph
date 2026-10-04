/* ───────────────────────── ui.js · cabecera, lentes, línea de tiempo, paleta, atajos ───────────────────────── */
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), 2200);
}
async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); return true; }
  catch { if (fallbackEl) { fallbackEl.hidden = false; fallbackEl.value = text; fallbackEl.focus(); fallbackEl.select(); toast('Selecciona y copia con Ctrl+C'); } return false; }
}

/* ───── selección, foco y hover ───── */
function selectNode(id, o = {}) {
  if (S.codeState?.dirty && S.codeState.id !== id) { toast('Guarda o descarta los cambios de ' + S.codeState.id.split('/').pop() + ' antes de cambiar de archivo'); return; }
  S.sel = id; S.selEdge = null; if (o.tab) S.tab = o.tab; else if (S.tab !== 'code' && S.tab !== 'trace') S.tab = 'summary';
  if (o.fly) flyToNode(id, o.zoom); else if (o.legible !== false) ensureLegible(id);
  renderCrumbs(); renderPanel(); requestRender();
  if (S.tab === 'code') loadCode(id, o.line);
}
function clearSelection() { if (!S.sel) return; S.sel = null; renderCrumbs(); renderPanel(); requestRender(); }
function clearAll() { S.sel = null; S.selEdge = null; S.focusSet = null; S.trace = null; S.path = null; S.focusLabel = ''; renderCrumbs(); renderPanel(); renderFocusChip(); requestRender(); }
function hoverNode(id) { S.hover = id; showTip(); requestRender(); }
function setFocus(ids, label, fit = true) {
  S.focusSet = ids && ids.length ? new Set(ids) : null; S.focusLabel = label || ''; renderFocusChip(); requestRender();
  if (S.focusSet && fit) fitView(true, [...S.focusSet]);
}
function focusNeighborhood(id, depth = 2) {
  const seen = new Set([id]); let fr = [id];
  for (let d = 0; d < depth; d++) { const nx = []; for (const x of fr) for (const y of S.adj.get(x) || []) if (!seen.has(y)) { seen.add(y); nx.push(y); } fr = nx; }
  setFocus([...seen], `${stem(S.N[id])} · ${depth} saltos`);
}
function focusFolder(path) {
  if (!path) { setFocus(null); fitView(true); return; }
  const ids = S.nodes.filter((n) => n.id.startsWith(path + '/')).map((n) => n.id); setFocus(ids, path);
}
function renderFocusChip() {
  let c = $('#focusChip');
  if (!S.focusSet && !S.trace && !S.path) { c?.remove(); return; }
  if (!c) { c = document.createElement('button'); c.id = 'focusChip'; c.className = 'chip'; Object.assign(c.style, { position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 5, cursor: 'pointer', borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' }); c.onclick = () => { S.focusSet = null; S.trace = null; S.path = null; S.focusLabel = ''; renderFocusChip(); renderPanel(); requestRender(); }; $('#stage').append(c); }
  c.textContent = `${S.trace ? 'Traza: ' + S.trace.name : S.path ? 'Camino entre archivos' : 'Enfoque: ' + S.focusLabel}  ✕  (Esc)`;
}

/* ───── ruta de migas ───── */
function renderCrumbs() {
  const n = S.sel && S.N[S.sel], parts = n ? n.id.split('/') : [], root = S.world?.meta.root || '';
  let h = `<button data-crumb="">${esc(root)}</button>`, acc = '';
  parts.forEach((p, i) => { acc += (acc ? '/' : '') + p; h += `<span>›</span><button data-crumb="${esc(acc)}" ${i === parts.length - 1 ? 'data-file="1"' : ''}>${esc(p)}</button>`; });
  $('#crumbs').innerHTML = h;
}

/* ───── tooltip ───── */
function showTip() {
  const tip = $('#tip'); const n = S.hover && S.N[S.hover]; if (!n || fly) { tip.hidden = true; return; }
  const st = STATE_META[n.state]?.label || n.state;
  tip.innerHTML = `<b>${esc(n.label)}</b><br>${esc(st)}${n.isTest ? '' : ` · riesgo ${n.risk.score}`} · ${n.loc || 0} líneas<br><span style="opacity:.75">${n.git?.owner != null ? esc(S.world.authors[n.git.owner]) + ' · ' : ''}${n.fanIn} lo usan · importa ${n.fanOut}</span>`;
  tip.hidden = false; moveTip();
}
function moveTip() {
  const tip = $('#tip'); if (tip.hidden) return; const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = clamp(pointerPos.x + 16, 6, W - w - 6) + 'px'; tip.style.top = clamp(pointerPos.y + 18, 6, H - h - 6) + 'px';
}

/* ───── lentes ───── */
function renderLegend() { $('#legend').innerHTML = legendItems().map(([c, l], i) => `<div data-leg="${i}" title="Clic: ver solo estos"><span class="sw" style="background:${c}"></span><span>${esc(l)}</span></div>`).join(''); }
function syncLens() {
  $('#groupField').hidden = S.mode === 'city'; $$('#viewSeg button').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === S.mode));
  $('#lensColor').value = S.lens.color; $('#lensSize').value = S.lens.size; $('#lensGroup').value = S.group; renderLegend();
}

/* ───── línea de tiempo ───── */
function tlGeom() { const tl = S.world.timeline; return { t0: tl[0].t, t1: tl[tl.length - 1].t }; }
function drawTimeline() {
  const tl = S.world?.timeline; if (!tl?.length || $('#tl').hidden) return;
  const c = $('#tlc'), r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return;
  c.width = r.width * dpr; c.height = r.height * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { t0, t1 } = tlGeom(), w = r.width, h = r.height, X = (t) => 4 + ((t - t0) / Math.max(1, t1 - t0)) * (w - 8), maxF = Math.max(...tl.map((c) => c.files.length), 1), maxL = Math.max(...tl.map((c) => c.loc), 1);
  g.clearRect(0, 0, w, h);
  g.beginPath(); tl.forEach((c, i) => { const x = X(c.t), y = h - 3 - (c.loc / maxL) * (h - 10); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = css(T.muted, 0.8); g.lineWidth = 1.4; g.stroke();
  tl.forEach((c, i) => { const x = X(c.t), bh = 4 + (c.files.length / maxF) * (h - 12), past = S.tl == null || i <= S.tl; g.fillStyle = css(authorColor(c.a), past ? 0.95 : 0.25); g.fillRect(x - 1.5, h - bh, 3, bh); });
  if (S.tl != null) { const x = X(tl[S.tl].t); g.strokeStyle = css(T.accent); g.lineWidth = 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
}
function setTimeline(i) {
  const tl = S.world.timeline; S.tl = i == null ? null : clamp(i, 0, tl.length - 1);
  S.tlTouched = S.tl == null ? null : new Set(tl[S.tl].files);
  applySizes(false); renderTlInfo(); drawTimeline(); requestRender();
  if (S.tab === 'summary' || S.tab === 'insights') renderPanel();
}
function renderTlInfo() {
  const tl = S.world.timeline, el = $('#tlInfo');
  if (S.tl == null) { const c = tl[tl.length - 1]; el.innerHTML = `<b>Hoy</b> · ${tl.length} commits · último ${esc(ago(c.t))} por ${esc(S.world.authors[c.a])}`; $('#tlNow').disabled = true; return; }
  const c = tl[S.tl]; $('#tlNow').disabled = false;
  el.innerHTML = `<b>#${S.tl + 1}</b> <span class="mono">${esc(c.h)}</span> · <span style="color:${css(authorColor(c.a))}">${esc(S.world.authors[c.a])}</span> · ${esc(fmtD(c.d))} · ${esc(c.m)} <span class="muted">(+${c.add} −${c.del} · ${c.nf} archivos)</span>`;
}
function initTimeline() {
  const has = !!S.world.timeline?.length; $('#tl').hidden = !has; if (!has) return;
  renderTlInfo(); requestAnimationFrame(drawTimeline);
}
let tlAcc = 0;
Bus.on('tick', (dt) => {
  tlAcc += dt; if (tlAcc < 0.5) return; tlAcc = 0; const n = S.world.timeline.length;
  const next = S.tl == null ? 0 : S.tl + 1; if (next >= n) { S.playing = false; $('#tlPlay').textContent = '▶'; setTimeline(n - 1); return; } setTimeline(next);
});

/* ───── paleta de búsqueda ───── */
let palItems = [], palSel = 0, palTimer = 0, palSeq = 0;
function fuzzy(q, s) {
  q = q.toLowerCase(); s = s.toLowerCase(); let qi = 0, score = 0, last = -2; const hit = [];
  for (let i = 0; i < s.length && qi < q.length; i++) if (s[i] === q[qi]) { score += i === last + 1 ? 3 : 1; if (i === 0 || '/._-'.includes(s[i - 1])) score += 2; hit.push(i); last = i; qi++; }
  if (qi < q.length) return null; const base = s.split('/').pop(); if (base.includes(q)) score += 8; return { score: score - s.length * 0.02, hit };
}
const mark = (s, hit) => { if (!hit) return esc(s); const set = new Set(hit); return [...s].map((ch, i) => (set.has(i) ? `<mark>${esc(ch)}</mark>` : esc(ch))).join(''); };
function openPalette(prefill = '') { $('#pal').hidden = false; const q = $('#palq'); q.value = prefill; q.focus(); q.select(); palQuery(); }
function closePalette() { $('#pal').hidden = true; }
function commands() {
  const c = [
    ['Vista: Ciudad', () => switchView('city')], ['Vista: Galaxia', () => switchView('galaxy')], ['Vista: Grafo', () => switchView('graph')],
    ['Ver todo el proyecto', () => { setFocus(null); fitView(true); }], ['Quitar línea de tiempo (Hoy)', () => S.world.timeline.length && setTimeline(null)],
    ['Ir a Hallazgos', () => { S.tab = 'insights'; renderPanel(); }], ['Ir a Traza de símbolos', () => { S.tab = 'trace'; renderPanel(); }], ['Ir a IA y relaciones', () => { S.tab = 'ai'; renderPanel(); }],
    ['Cambiar tema', toggleTheme], ['Conjuntos: diagrama de Venn…', () => { S.tab = 'sets'; renderPanel(); }], ['Conjuntos: zona crítica', () => { S.tab = 'sets'; const r = SETS.recipe(S.world, 'critical'); setsSet(r.keys, 'critical', r.reading); }], ['Conjuntos: carpeta vs módulo', () => { S.tab = 'sets'; const r = SETS.recipe(S.world, 'folder-module'); if (r.keys) setsSet(r.keys, 'folder-module', r.reading); else toast('Sin datos para esta receta'); }], ['Preguntar a mis datos…', () => { S.tab = 'ask'; renderPanel(); setTimeout(() => $('#qaq')?.focus(), 30); }], ['Vista rápida: Calmado', () => applyPreset('calmado')], ['Vista rápida: Análisis', () => applyPreset('analisis')], ['Vista rápida: Detective', () => applyPreset('detective')], ['Modo Simple', () => setUiMode('simple')], ['Modo Completo', () => setUiMode('full')], ['Recorrido de bienvenida', () => openTour(0)], ['Aspecto: colores, temas y comodidad', () => openLook(true)],
  ];
  for (const [v, l] of [['folder', 'Carpeta'], ['state', 'Estado'], ['risk', 'Riesgo'], ['heat', 'Calor de cambios'], ['author', 'Autor'], ['module', 'Módulo'], ['impact', 'Radio de impacto'], ['lang', 'Lenguaje'], ['dup', 'Duplicación (DRY)'], ['tests', 'Pruebas']]) c.push([`Color por: ${l}`, () => { S.lens.color = v; syncLens(); requestRender(); }]);
  return c;
}
function palQuery() {
  const q = $('#palq').value.trim(), items = []; palSel = 0; const seq = ++palSeq;
  if (!q) {
    const top = [...S.nodes].filter((n) => !n.isTest).sort((a, b) => b.risk.score - a.risk.score).slice(0, 6);
    items.push({ grp: 'Archivos de mayor riesgo' }); for (const n of top) items.push({ label: n.label, sub: n.id, go: () => selectNode(n.id, { fly: true }) });
    items.push({ grp: 'Comandos' }); for (const [l, f] of commands().slice(0, 6)) items.push({ label: l, go: f });
  } else {
    const files = S.nodes.map((n) => ({ n, f: fuzzy(q, n.id) })).filter((x) => x.f).sort((a, b) => b.f.score - a.f.score).slice(0, 7);
    if (files.length) { items.push({ grp: 'Archivos' }); for (const { n, f } of files) items.push({ html: mark(n.id, f.hit), sub: STATE_META[n.state]?.label, go: () => selectNode(n.id, { fly: true }) }); }
    const ql = q.toLowerCase(), syms = S.world.symbols.filter((s) => s.name.toLowerCase().includes(ql)).slice(0, 6);
    if (syms.length) { items.push({ grp: 'Símbolos (Enter para trazar)' }); for (const s of syms) items.push({ label: `${s.name}  ${s.kind}`, sub: `${s.file}:${s.line} · ${s.total} usos`, go: () => { S.tab = 'trace'; selectNode(s.file, { fly: true, tab: 'trace' }); traceSymbol(s.id); } }); }
    const cmds = commands().filter(([l]) => l.toLowerCase().includes(ql)).slice(0, 4);
    if (cmds.length) { items.push({ grp: 'Comandos' }); for (const [l, f] of cmds) items.push({ label: l, go: f }); }
    items.push({ grp: 'Texto en el código', pending: true });
    clearTimeout(palTimer);
    if (q.length >= 2) palTimer = setTimeout(async () => {
      let res = []; try { res = await Backend.search(q); } catch {}
      if (seq !== palSeq) return; const base = palItems.filter((i) => !i.text && !(i.grp === 'Texto en el código'));
      palItems = base.concat([{ grp: 'Texto en el código' }], res.slice(0, 8).map((r) => ({ text: true, label: r.text, sub: `${r.file}:${r.line}`, go: () => { selectNode(r.file, { fly: true, tab: 'code', line: r.line }); } })), res.length ? [] : [{ label: 'Sin coincidencias en el texto', go: () => {}, dead: true }]);
      renderPalette();
    }, 160);
  }
  palItems = items; renderPalette();
}
function renderPalette() {
  const box = $('#palres'); let i = -1;
  box.innerHTML = palItems.map((it) => {
    if (it.grp) return `<div class="grp">${esc(it.grp)}</div>`; i++;
    return `<button class="opt" data-i="${i}" aria-selected="${i === palSel}">${it.html ? `<span class="mono">${it.html}</span>` : `<span ${it.text ? 'class="mono"' : ''}>${esc(it.label)}</span>`}${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}</button>`;
  }).join('');
}
function palRun(i) { const real = palItems.filter((x) => !x.grp); const it = real[i]; if (!it || it.dead) return; closePalette(); it.go(); }
function palMove(d) { const n = palItems.filter((x) => !x.grp).length; if (!n) return; palSel = (palSel + d + n) % n; renderPalette(); $('#palres [aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }

/* ───── tema y vistas ───── */
function toggleTheme() { Look.s.preset = T.dark ? 'dia' : 'noche'; Look.s.tokens = {}; applyLook(); }
function switchView(v) { setMode(v); syncLens(); }

/* ───── arranque de la interfaz ───── */
function initUI() {
  $('#modeChip').textContent = LIVE ? 'en vivo · edición activa' : 'instantánea · solo lectura'; $('#modeChip').classList.toggle('live', !!LIVE);
  if (innerWidth < 760) $('#lens').classList.add('collapsed');
  $$('#viewSeg button').forEach((b) => (b.onclick = () => switchView(b.dataset.view)));
  $('#btnTheme').onclick = toggleTheme; $('#btnSearch').onclick = () => openPalette();
  $('#lensToggle').onclick = () => { const l = $('#lens'); l.classList.toggle('collapsed'); $('#lensToggle').textContent = l.classList.contains('collapsed') ? '▸' : '▾'; };
  const tsel = $('#lensText'); if (tsel) { tsel.value = TEXT_KEY; tsel.onchange = (e) => { setTextSize(e.target.value); resize(); requestRender(); }; }
  document.documentElement.style.setProperty('--ts', TS());
  $('#lensColor').onchange = (e) => { S.lens.color = e.target.value; renderLegend(); requestRender(); };
  $('#lensSize').onchange = (e) => { S.lens.size = e.target.value; applySizes(false); requestRender(); };
  $('#lensGroup').onchange = (e) => { setGroup(e.target.value); };
  const ly = (id, key) => ($(id).onchange = (e) => { S.layers[key] = e.target.checked; requestRender(); });
  ly('#lyStreets', 'streets'); ly('#lyAll', 'all'); ly('#lyTunnels', 'tunnels'); ly('#lyDupes', 'dupes'); ly('#lyCycles', 'cycles'); ly('#lyLabels', 'labels'); ly('#lyAnim', 'anim'); ly('#lyAgg', 'aggregate');
  $('#lyAnim').checked = S.layers.anim;
  $('#zIn').onclick = () => zoomAt(W / 2, H / 2, 1.3); $('#zOut').onclick = () => zoomAt(W / 2, H / 2, 1 / 1.3); $('#zFit').onclick = () => { setFocus(null); fitView(true); };
  $('#rotL').onclick = () => rotate(-1); $('#rotR').onclick = () => rotate(1);
  $('#crumbs').onclick = (e) => { const b = e.target.closest('[data-crumb]'); if (!b) return; if (b.dataset.file) { flyToNode(S.sel); return; } focusFolder(b.dataset.crumb); };
  cv.addEventListener('pointermove', moveTip);
  // línea de tiempo
  $('#tlPlay').onclick = () => { S.playing = !S.playing; $('#tlPlay').textContent = S.playing ? '❚❚' : '▶'; if (S.playing && S.tl == null) setTimeline(0); };
  $('#tlPrev').onclick = () => { S.playing = false; $('#tlPlay').textContent = '▶'; setTimeline(S.tl == null ? S.world.timeline.length - 2 : S.tl - 1); };
  $('#tlNext').onclick = () => { S.playing = false; $('#tlPlay').textContent = '▶'; const n = S.world.timeline.length; if (S.tl == null) return; setTimeline(S.tl + 1 >= n ? null : S.tl + 1); };
  $('#tlNow').onclick = () => { S.playing = false; $('#tlPlay').textContent = '▶'; setTimeline(null); };
  const tlPick = (e) => { const tl = S.world.timeline, r = $('#tlc').getBoundingClientRect(), { t0, t1 } = tlGeom(), t = t0 + ((e.clientX - r.left - 4) / (r.width - 8)) * (t1 - t0); let best = 0, bd = 1e30; tl.forEach((c, i) => { const d = Math.abs(c.t - t); if (d < bd) { bd = d; best = i; } }); S.playing = false; $('#tlPlay').textContent = '▶'; setTimeline(best); };
  let down = false; $('#tlc').addEventListener('pointerdown', (e) => { down = true; $('#tlc').setPointerCapture(e.pointerId); tlPick(e); }); $('#tlc').addEventListener('pointermove', (e) => down && tlPick(e)); $('#tlc').addEventListener('pointerup', () => (down = false));
  new ResizeObserver(drawTimeline).observe($('#tl'));
  // paleta
  $('#palq').addEventListener('input', palQuery);
  $('#palq').addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); } else if (e.key === 'Enter') { e.preventDefault(); palRun(palSel); } });
  $('#palres').addEventListener('click', (e) => { const b = e.target.closest('.opt'); if (b) palRun(+b.dataset.i); });
  $('#pal').addEventListener('pointerdown', (e) => { if (e.target.id === 'pal') closePalette(); });
  // pestañas e inspector
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; S.tab = b.dataset.tab; renderPanel(); if (S.tab === 'code' && S.sel) loadCode(S.sel); });
  initPanels(); initLook();
  // atajos
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape') { if (!$('#pal').hidden) closePalette(); else if (!typing) clearAll(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === '/') { e.preventDefault(); openPalette(); }
    else if (k === '1') switchView('city'); else if (k === '2') switchView('galaxy'); else if (k === '3') switchView('graph');
    else if (k === 'q' || k === 'Q') rotate(-1); else if (k === 'e' || k === 'E') rotate(1);
    else if (k === 'f' || k === 'F') { setFocus(null); fitView(true); }
    else if (k === '+' || k === '=') zoomAt(W / 2, H / 2, 1.2); else if (k === '-') zoomAt(W / 2, H / 2, 1 / 1.2);
    else if (k === '[' && S.world.timeline.length) $('#tlPrev').click(); else if (k === ']' && S.world.timeline.length) $('#tlNext').click();
    else if (k === ' ' && !$('#tl').hidden && document.activeElement === cv) { e.preventDefault(); $('#tlPlay').click(); }
    else if (k.startsWith('Arrow')) { e.preventDefault(); prepProj(); const step = 60, dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0; const a = unproj(W / 2, H / 2), b = unproj(W / 2 + dx, H / 2 + dy); CAM.x += b[0] - a[0]; CAM.y += b[1] - a[1]; requestRender(); }
  });
  Bus.on('theme', () => { renderLegend(); drawTimeline(); });
  Bus.on('mode', syncLens);
  Bus.on('world', (keep) => {
    if (!keep) { S.sel = null; S.focusSet = null; S.trace = null; S.path = null; S.tl = null; S.tlTouched = null; S.codeState = null; renderFocusChip(); }
    $('#proj').textContent = '· ' + S.world.meta.root; renderCrumbs(); initTimeline(); syncLens(); refreshPanels();
  });
}
