/* ───────────────────────── nav.js · historial de exploración (adelante / atrás) ───────────────────────── */
const Nav = (() => {
  const MAX = 100; let entries = [], idx = -1, restoring = false, fromPop = false, timer = 0, tlTimer = 0;
  const key = () => 'codegraph:nav:' + (S.world?.meta?.root || 'x');
  const camNow = () => { const t = fly ? fly.to : CAM; return { x: t.x, y: t.y, k: t.k, rot: CAM.rot }; };

  function snapshot() {
    return {
      sel: S.sel, selEdge: S.selEdge, focus: S.focusSet ? [...S.focusSet] : null, focusLabel: S.focusLabel || '',
      mode: S.mode, tab: S.tab, tl: S.tl, trace: S.trace ? S.trace.sym : null, path: S.path ? S.path.ids.slice() : null,
      code: S.tab === 'code' && S.codeState ? { id: S.codeState.id, line: S.codeState.line || null } : null,
      dupOpen: S.dupOpen || null, cam: camNow(),
    };
  }
  const same = (a, b) => JSON.stringify({ ...a, cam: 0 }) === JSON.stringify({ ...b, cam: 0 });
  function label(s, prev) {
    const nm = (id) => (S.N[id] ? stem(S.N[id]) : id);
    if (prev && s.mode !== prev.mode && s.sel === prev.sel) return 'Vista ' + ({ city: 'Ciudad', galaxy: 'Galaxia', graph: 'Grafo' }[s.mode] || '');
    if (prev && s.tl !== prev.tl && s.sel === prev.sel) return s.tl == null ? 'Línea de tiempo: hoy' : 'Línea de tiempo #' + (s.tl + 1);
    if (s.trace) return 'Trazó ' + (S.world.symbols.find((x) => x.id === s.trace)?.name || 'un símbolo');
    if (s.path) return 'Camino ' + nm(s.path[0]) + ' → ' + nm(s.path[s.path.length - 1]);
    if (s.code) return 'Abrió ' + nm(s.code.id) + (s.code.line ? ':' + s.code.line : '');
    if (s.focus) return 'Enfocó ' + (s.focusLabel || s.focus.length + ' archivos');
    if (s.sel) return 'Seleccionó ' + nm(s.sel);
    if (s.tl != null) return 'Línea de tiempo #' + (s.tl + 1);
    return 'Vista ' + ({ city: 'Ciudad', galaxy: 'Galaxia', graph: 'Grafo' }[s.mode] || '');
  }
  function persist() { try { sessionStorage.setItem(key(), JSON.stringify({ idx, entries: entries.slice(-MAX) })); } catch {} }

  /** Registra el estado actual como entrada nueva (descarta lo que había «adelante»). */
  function record() {
    if (restoring || !S.world) return; const s = snapshot(), cur = entries[idx];
    if (cur && same(cur, s)) { cur.cam = s.cam; return; }
    if (cur) cur.cam = camNow();
    entries = entries.slice(0, idx + 1); s.label = label(s, cur); entries.push(s);
    if (entries.length > MAX) entries.shift(); idx = entries.length - 1; persist(); render(); if (LIVE && !fromPop) try { history.pushState({ cg: idx }, ''); } catch {}
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(record, 60); };

  function restore(st) {
    if (S.codeState?.dirty) { toast('Guarda o descarta los cambios antes de moverte por el historial'); return false; }
    restoring = true;
    try {
      if (st.mode !== S.mode) { setMode(st.mode); syncLens(); }
      if (st.tl !== S.tl) setTimeline(st.tl);
      S.focusSet = st.focus ? new Set(st.focus.filter((id) => S.N[id])) : null; if (S.focusSet && !S.focusSet.size) S.focusSet = null; S.focusLabel = st.focusLabel || '';
      S.trace = null; S.path = null;
      if (st.trace) traceSymbol(st.trace);
      if (st.path) { const ids = st.path.filter((id) => S.N[id]); if (ids.length > 1) S.path = { ids }; }
      S.sel = st.sel && S.N[st.sel] ? st.sel : null; S.selEdge = st.selEdge || null; S.tab = st.tab || 'summary'; S.dupOpen = st.dupOpen || null;
      renderCrumbs(); renderPanel(); renderFocusChip(); syncLens();
      if (S.tab === 'code' && st.code && S.N[st.code.id]) loadCode(st.code.id, st.code.line);
      if (st.cam) { CAM.rot = st.cam.rot ?? CAM.rot; flyTo(st.cam.x, st.cam.y, st.cam.k, 450); }
      requestRender();
    } finally { setTimeout(() => { restoring = false; }, 80); }
    return true;
  }
  function go(i) {
    if (i < 0 || i >= entries.length || i === idx) return;
    const prev = idx; entries[idx] && (entries[idx].cam = camNow()); idx = i;
    if (!restore(entries[idx])) idx = prev; persist(); render();
  }
  const back = () => go(idx - 1), forward = () => go(idx + 1);

  function render() {
    const b = $('#navBack'), f = $('#navFwd'); if (!b) return;
    b.disabled = idx <= 0; f.disabled = idx >= entries.length - 1;
    b.title = idx > 0 ? 'Atrás: ' + entries[idx - 1].label + '  (Alt+←)' : 'Atrás (Alt+←)';
    f.title = idx < entries.length - 1 ? 'Adelante: ' + entries[idx + 1].label + '  (Alt+→)' : 'Adelante (Alt+→)';
    const m = $('#navList'); if (!m.hidden) renderMenu();
  }
  function renderMenu() {
    const m = $('#navList'), from = Math.max(0, entries.length - 14);
    m.innerHTML = '<div class="navh">Recorrido</div>' + entries.slice(from).map((e, j) => { const i = from + j; return `<button class="${i === idx ? 'cur' : ''}" data-i="${i}"><span class="muted mono">${i + 1}</span><span class="grow">${esc(e.label)}</span></button>`; }).reverse().join('');
  }

  function init() {
    // envolver las acciones de navegación: cada una, al terminar, programa un registro (los grupos de acciones seguidas se fusionan)
    const wrap = (fn) => (...a) => { const r = fn(...a); if (!restoring) soon(); return r; };
    selectNode = wrap(selectNode); setFocus = wrap(setFocus); traceSymbol = wrap(traceSymbol); switchView = wrap(switchView); clearAll = wrap(clearAll);
    const st = setTimeline; setTimeline = (i) => { st(i); if (!restoring && !S.playing) { clearTimeout(tlTimer); tlTimer = setTimeout(record, 500); } };
    $('#navBack').onclick = back; $('#navFwd').onclick = forward;
    $('#navMore').onclick = (e) => { e.stopPropagation(); const m = $('#navList'); m.hidden = !m.hidden; if (!m.hidden) renderMenu(); };
    $('#navList').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { go(+b.dataset.i); $('#navList').hidden = true; } });
    document.addEventListener('click', (e) => { if (!e.target.closest('#navBox')) $('#navList').hidden = true; });
    document.addEventListener('keydown', (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.key === 'ArrowLeft' ? back() : forward(); }
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); back(); } else if (e.button === 4) { e.preventDefault(); forward(); } });
    if (LIVE) window.addEventListener('popstate', (e) => { const i = e.state && e.state.cg; if (typeof i !== 'number') return; fromPop = true; try { go(i); } finally { setTimeout(() => { fromPop = false; }, 120); } }); // el botón Atrás del navegador recorre el mismo historial
    Bus.on('world', (keep) => { if (!keep) boot2(); });
  }
  function boot2() {
    entries = []; idx = -1;
    try {
      const v = JSON.parse(sessionStorage.getItem(key()) || 'null');
      if (v && v.entries?.length) { entries = v.entries; idx = Math.min(v.idx, entries.length - 1); restoring = true; setTimeout(() => { restoring = false; restore(entries[idx]); render(); }, 0); }
    } catch {}
    if (!entries.length) setTimeout(record, 0); render();
    if (LIVE) try { history.replaceState({ cg: Math.max(0, idx) }, ''); } catch {}
  }
  return { init, record, back, forward, go, get entries() { return entries; }, get idx() { return idx; } };
})();
