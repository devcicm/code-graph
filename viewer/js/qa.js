/* ───────────────────────── qa.js · Preguntar, caminar por el código, vistas rápidas, modo Simple ───────────────────────── */
const UIPREF = (() => { try { return JSON.parse(localStorage.getItem('codegraph:ui') || '{}'); } catch { return {}; } })();
const saveUiPref = () => { try { localStorage.setItem('codegraph:ui', JSON.stringify(UIPREF)); } catch {} };

/* ═══════════ Preguntar (Q2–Q4) ═══════════ */
S.qa = { text: '', ans: null };
const askWorld = QA.ask, suggestQs = QA.suggest, QS = QA.QUESTIONS, evidenceTxt = QA.evidenceText;
const CONF_TAG = { alta: 'ok', media: 'amb', baja: 'warn' };
function runAsk(text, opts = {}) { S.qa.text = text; S.qa.ans = askWorld(S.world, text, { sel: S.sel, ...opts }); if (S.qa.ans.file && S.N[S.qa.ans.file]) { /* mantiene el archivo mencionado */ } renderPanel(); }
function tabAsk() {
  const a = S.qa.ans, sug = suggestQs(S.world, S.sel);
  const chips = sug.map((s, i) => `<button class="btn small" data-act="qa-q" data-i="${i}">${esc(s.text)}</button>`).join('');
  let ans = '';
  if (a) {
    const ids = a.rows.map((r) => r.id).filter((id) => id && S.N[id]);
    ans = `<section class="blk"><div class="card"><div class="muted" style="font-size:11.5px">${esc(a.title)}</div><div style="font-size:14.5px;font-weight:600;line-height:1.4">${esc(a.headline)}</div>
      <div class="row wrap"><span class="tag ${CONF_TAG[a.conf.level]}" title="${esc(a.conf.why)}">Confianza ${esc(a.conf.level)}</span><span class="muted" style="font-size:11.5px">${esc(a.conf.why)}</span></div></div></section>
      ${a.rows.length ? `<section class="blk"><h3>Evidencia (${a.rows.length})</h3><div class="list">${a.rows.map((r) => r.id && S.N[r.id] ? `<button class="item" data-go="${esc(r.id)}"><span class="top"><span class="sw" style="background:${css(dirColor(S.N[r.id].dir))}"></span><span class="mono grow">${esc(stem(S.N[r.id]))}</span>${r.tag ? `<span class="tag">${esc(r.tag)}</span>` : ''}</span><span class="muted" style="font-size:11.5px">${esc(r.text)}</span></button>` : `<div class="item"><span style="font-size:12px">${esc(r.text)}</span></div>`).join('')}</div>
        <div class="row wrap">${ids.length ? `<button class="btn small" data-act="qa-focus">Mostrar en el mapa</button>` : ''}<button class="btn small" data-act="qa-copy" title="Copia pregunta, datos, confianza y límites para pegarlos en una IA">Copiar evidencia para la IA</button></div></section>` : ''}
      ${a.challenge.length ? `<section class="blk"><h3>Cuestiónala</h3><ul class="steps">${a.challenge.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>` : ''}
      ${a.follow?.length && a.id !== 'none' ? `<section class="blk"><h3>Para seguir</h3><div class="chips2">${a.follow.map((id) => { const q = QS.find((x) => x.id === id); return q ? `<button class="btn small" data-act="qa-id" data-id="${esc(id)}">${esc(q.title)}</button>` : ''; }).join('')}</div></section>` : ''}`;
  }
  return `<section class="blk"><h3>Pregunta a tus datos</h3><div class="row"><input type="text" id="qaq" placeholder="${S.sel ? 'p. ej. ¿qué se rompe si cambio ' + esc(stem(S.N[S.sel])) + '?' : 'p. ej. ¿qué es lo más riesgoso?'}" value="${esc(S.qa.text)}" autocomplete="off"><button class="btn primary" data-act="qa-go">Preguntar</button></div>
    <div class="chips2">${chips}</div>${a ? '' : tipBox('Cada respuesta viene con <b>evidencia</b> (archivos y números), un nivel de <b>confianza</b> y los <b>límites</b> para cuestionarla. Nada se inventa: si no hay datos, lo dice.')}</section>${ans}`;
}
function onQaClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return; const d = b.dataset;
  switch (d.act) {
    case 'qa-go': runAsk($('#qaq').value); break;
    case 'qa-q': { const s = suggestQs(S.world, S.sel)[+d.i]; if (s) runAsk(s.text, { id: s.id, file: s.file }); break; }
    case 'qa-id': { const q = QS.find((x) => x.id === d.id); if (q) runAsk(q.title, { id: q.id, file: S.qa.ans?.file || undefined }); break; }
    case 'qa-focus': { const ids = [...new Set(S.qa.ans.rows.map((r) => r.id).filter((id) => id && S.N[id]))]; setFocus(ids, S.qa.ans.title); break; }
    case 'qa-copy': { const t = evidenceTxt(S.qa.ans); (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast('Evidencia copiada'), () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Evidencia copiada'); } catch { toast('No se pudo copiar'); } ta.remove(); }); break; }
  }
}

/* ═══════════ Caminar por el código (N2) ═══════════ */
function walkTo(id, why) { if (!id || !S.N[id]) { toast('No hay a dónde ir desde aquí'); return; } selectNode(id, { fly: true }); toast(why + ' ' + stem(S.N[id])); }
const strongest = (list, pick) => list.filter((e) => !e.external && !e.fromTest && S.N[pick(e)]?.kind === 'file' && e.kind !== 'relation').sort((a, b) => (b.refs || 0) - (a.refs || 0))[0];
function siblings(id) { const n = S.N[id]; return S.nodes.filter((x) => x.kind === 'file' && x.dir === n.dir).sort((a, b) => a.id.localeCompare(b.id)); }
function stepList(list, id, dir) { const i = list.findIndex((x) => x.id === id); return list[(i + dir + list.length) % list.length]?.id; }
function onWalkKey(e) {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey || !S.world) return;
  const k = e.key, sel = S.sel; let handled = true;
  if (e.shiftKey && k === 'ArrowRight') { if (!sel) return; const x = strongest(S.out.get(sel) || [], (e) => e.target); walkTo(x?.target, 'Depende de'); }
  else if (e.shiftKey && k === 'ArrowLeft') { if (!sel) return; const x = strongest(S.inn.get(sel) || [], (e) => e.source); walkTo(x?.source, 'Lo usa'); }
  else if (e.shiftKey && (k === 'ArrowDown' || k === 'ArrowUp')) { if (!sel || S.N[sel].kind !== 'file') return; walkTo(stepList(siblings(sel), sel, k === 'ArrowDown' ? 1 : -1), 'Vecino en la carpeta:'); }
  else if (!e.shiftKey && (k === 'j' || k === 'k')) {
    const list = (S.focusSet ? [...S.focusSet].map((i) => S.N[i]).filter((n) => n?.kind === 'file') : S.nodes.filter((n) => n.kind === 'file' && !n.isTest)).sort((a, b) => S.focusSet ? a.id.localeCompare(b.id) : (b.risk?.score || 0) - (a.risk?.score || 0));
    if (!list.length) return; const i = list.findIndex((n) => n.id === sel); walkTo(list[sel ? (i + (k === 'j' ? 1 : -1) + list.length) % list.length : 0].id, S.focusSet ? 'Siguiente del grupo:' : 'Por riesgo:');
  }
  else if (!e.shiftKey && k === 'u') { if (!sel) return; const dir = S.N[sel].dir; if (!dir || dir === '(raíz)' || dir === '(externo)') { setFocus(null); fitView(true); return; } focusFolder(dir); toast('Carpeta ' + dir); }
  else handled = false;
  if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
}

/* ═══════════ Vistas rápidas (U3) y leyenda que aísla ═══════════ */
const VIEW_PRESETS = {
  calmado: { label: 'Calmado', color: 'folder', size: 'lines', layers: { streets: true, all: false, tunnels: false, dupes: false, cycles: false, labels: true, anim: false } },
  analisis: { label: 'Análisis', color: 'risk', size: 'lines', layers: { streets: true, all: false, tunnels: true, dupes: true, cycles: true, labels: true, anim: false } },
  detective: { label: 'Detective', color: 'impact', size: 'fanin', layers: { streets: true, all: true, tunnels: true, dupes: true, cycles: true, labels: true, anim: false } },
};
function applyPreset(id) {
  const p = VIEW_PRESETS[id]; if (!p) return; S.lens.color = p.color; S.lens.size = p.size; Object.assign(S.layers, p.layers);
  const map = { streets: '#lyStreets', all: '#lyAll', tunnels: '#lyTunnels', dupes: '#lyDupes', cycles: '#lyCycles', labels: '#lyLabels', anim: '#lyAnim' };
  for (const [k, sel] of Object.entries(map)) $(sel).checked = !!S.layers[k];
  applySizes(false); syncLens(); requestRender(); UIPREF.preset = id; saveUiPref(); const s = $('#lensPreset'); if (s) s.value = id; toast('Vista: ' + p.label);
}
function legendIsolate(i) {
  const items = legendItems(), sw = items[i]?.[0]; if (!sw) return;
  const ids = S.nodes.filter((n) => n.kind === 'file' && css(colorOf0(n)) === sw).map((n) => n.id);
  if (!ids.length) { toast('Este color es parte de un gradiente: no agrupa archivos'); return; }
  if (S.focusSet && S.focusLabel === items[i][1]) { setFocus(null); fitView(true); return; }
  setFocus(ids, items[i][1]);
}

/* ═══════════ Modo Simple / Completo y bienvenida (U4) ═══════════ */
const SIMPLE_LENS = ['folder', 'state', 'risk'];
function setUiMode(m) {
  UIPREF.mode = m; saveUiPref(); document.body.classList.toggle('simple', m === 'simple');
  const root = $('#app') || document.body; root.classList.toggle('simple', m === 'simple');
  $$('#lensColor option').forEach((o) => { o.hidden = m === 'simple' && !SIMPLE_LENS.includes(o.value); });
  if (m === 'simple' && !SIMPLE_LENS.includes(S.lens.color)) { S.lens.color = 'state'; syncLens(); requestRender(); }
  if (m === 'simple' && ['trace', 'ai'].includes(S.tab)) { S.tab = 'summary'; renderPanel(); }
  $$('#uiMode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m));
}
const TOUR = [
  ['Esto es tu código como una ciudad', 'Cada edificio es un archivo; las manzanas son carpetas. Altura = tamaño, color = lo que elijas en «Color por». Arrastra para moverte, rueda para acercar, <kbd>Q</kbd>/<kbd>E</kbd> para girar.'],
  ['Pregunta en vez de buscar', 'Abre la pestaña <b>Preguntar</b> y haz preguntas como «¿qué es lo más riesgoso?» o «¿qué se rompe si cambio orderService?». Cada respuesta trae evidencia, confianza y cómo cuestionarla.'],
  ['Muévete sin perderte', 'Cada paso queda en el historial: ◀ ▶ arriba (o <kbd>Alt</kbd>+flechas). <kbd>Shift</kbd>+→ sigue una dependencia, <kbd>Shift</kbd>+← a quien lo usa, <kbd>J</kbd>/<kbd>K</kbd> recorren por riesgo, <kbd>U</kbd> sube a la carpeta. <kbd>Ctrl K</kbd> busca todo.'],
  ['Hazlo cómodo', 'En <b>Aspecto</b> cambias colores y tamaño del texto. En «Vista rápida» eliges Calmado, Análisis o Detective. Con modo <b>Simple</b> ves solo lo esencial; cambia a Completo cuando quieras.'],
];
let tourI = 0;
function openTour(i = 0) {
  tourI = i; let el = $('#tour'); if (!el) { el = document.createElement('div'); el.id = 'tour'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Bienvenida'); $('#stage').appendChild(el); el.addEventListener('click', onTourClick); }
  const [h, t] = TOUR[i]; el.hidden = false;
  el.innerHTML = `<div class="tourbox"><div class="muted" style="font-size:11px">${i + 1} de ${TOUR.length}</div><h3>${h}</h3><p>${t}</p><div class="row"><button class="btn small" data-t="skip">Cerrar</button><span class="grow"></span>${i ? '<button class="btn small" data-t="prev">Atrás</button>' : ''}<button class="btn primary small" data-t="${i < TOUR.length - 1 ? 'next' : 'skip'}">${i < TOUR.length - 1 ? 'Siguiente' : 'Empezar'}</button></div></div>`;
}
function onTourClick(e) { const b = e.target.closest('[data-t]'); if (!b) return; const t = b.dataset.t; if (t === 'next') openTour(tourI + 1); else if (t === 'prev') openTour(tourI - 1); else { $('#tour').hidden = true; UIPREF.toured = true; saveUiPref(); } }

/** «desde la última vez»: compara con la foto guardada en este navegador y guarda la actual */
function initSince() {
  const key = () => 'codegraph:last:' + (S.world?.meta?.root || '');
  Bus.on('world', () => {
    if (S.sinceKey !== key()) {
      S.sinceKey = key(); S.sinceBase = null;
      try { S.sinceBase = JSON.parse(localStorage.getItem(key()) || 'null'); } catch {}
      try { localStorage.setItem(key(), JSON.stringify(QA.snapshotOf(S.world))); } catch {}
    }
    S.world.since = S.sinceBase ? QA.diffSince(S.sinceBase, S.world, ago(S.sinceBase.t)) : null;
  });
}
function sinceBlock() {
  const d = S.world.since; if (!d) return '';
  if (d.empty) return '';
  const row = (id, txt, tag) => `<button class="item" data-go="${esc(id)}"><span class="top"><span class="mono grow">${esc(short(S.N[id] || { id, label: id }))}</span><span class="tag">${esc(tag)}</span></span><span class="muted" style="font-size:11px">${esc(txt)}</span></button>`;
  const items = [...d.newRisk.slice(0, 4).map((x) => row(x.id, `riesgo ${x.from} → ${x.to}`, 'sube')), ...d.added.slice(0, 3).map((id) => row(id, 'archivo nuevo', 'nuevo')), ...d.states.slice(0, 3).map((x) => row(x.id, `${x.from} → ${x.to}`, 'estado'))];
  return `<section class="blk"><h3>Desde tu última visita (${esc(d.when)})</h3><div class="muted">${d.added.length} nuevos · ${d.removed.length} borrados · ${d.newRisk.length} con más riesgo · ${d.states.length} cambiaron de estado${d.health != null ? ` · salud ${d.health > 0 ? '+' : ''}${d.health}` : ''}</div><div class="list">${items.join('')}</div></section>`;
}
function initExplore() {
  initSince();
  $('#tabbody').addEventListener('click', onQaClick);
  $('#tabbody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'qaq') { e.preventDefault(); runAsk(e.target.value); } });
  document.addEventListener('keydown', onWalkKey, true);
  $('#lensPreset').onchange = (e) => applyPreset(e.target.value);
  $('#legend').addEventListener('click', (e) => { const d = e.target.closest('[data-leg]'); if (d) legendIsolate(+d.dataset.leg); });
  $('#uiMode').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) setUiMode(b.dataset.m); });
  $('#btnHelp').onclick = () => openTour(0);
  if (UIPREF.mode) setUiMode(UIPREF.mode); else setUiMode('full');
  if (UIPREF.preset && VIEW_PRESETS[UIPREF.preset]) $('#lensPreset').value = UIPREF.preset;
  if (!UIPREF.toured && S.world) setTimeout(() => openTour(0), 600);
}
