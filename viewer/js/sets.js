/* ───────────────────────── sets.js · Conjuntos: diagramas de Venn / UpSet y manchas en el mapa ───────────────────────── */
S.sets = { keys: [], ids: [], show: true, region: null, recipe: null, reading: '' };
let setCat = null;
const SKEY = () => 'codegraph:sets:' + (S.world?.meta?.root || 'x');
S.setStore = { views: [], custom: {} };
function loadSetStore() { try { const v = JSON.parse(localStorage.getItem(SKEY()) || 'null'); if (v) S.setStore = { views: v.views || [], custom: v.custom || {} }; } catch {} applyStore(); if (LIVE) Backend.j('/api/sets').then((v) => { if (v && (v.views?.length || Object.keys(v.custom || {}).length)) { S.setStore = { views: v.views || [], custom: v.custom || {} }; applyStore(); setCat = null; if (S.tab === 'sets') renderPanel(); } }).catch(() => {}); }
function applyStore() { if (S.world) S.world.customSets = S.setStore.custom; }
function saveSetStore() { applyStore(); setCat = null; try { localStorage.setItem(SKEY(), JSON.stringify(S.setStore)); } catch {} if (LIVE) Backend.j('/api/sets', { method: 'PUT', body: JSON.stringify(S.setStore) }).catch(() => toast('No se pudo guardar en el proyecto')); }
const setColor = (i) => `var(--c${i % 8})`;
function setsRecompute() { S.sets.ids = S.sets.keys.map((k) => SETS.resolve(S.world, k)); S.sets.region = null; }
function setsSet(keys, recipeId = null, reading = '') { S.sets.keys = keys.slice(0, SETS.MAX_SETS); S.sets.recipe = recipeId; S.sets.reading = reading; setsRecompute(); if (S.focusSet) setFocus(null, '', false); renderPanel(); requestRender(); }
function setsData() { const sets = S.sets.keys.map((k, i) => ({ key: k, ids: S.sets.ids[i] })); return { sets, rg: sets.length ? SETS.regions(sets) : null }; }
const regionName = (r, sets) => { const names = sets.map((s) => SETS.labelOf(S.world, s.key)), inn = names.filter((_, i) => r.in[i]), out = names.filter((_, i) => !r.in[i]); return (inn.length === 1 ? 'Solo ' : '') + inn.join(' ∩ ') + (out.length && inn.length > 1 ? '' : ''); };

function vennSvg(sets, rg) {
  const L = SETS.layoutVenn(sets), sel = S.sets.region, cxm = L.circles.reduce((a, c) => a + c.x, 0) / L.circles.length, cym = L.circles.reduce((a, c) => a + c.y, 0) / L.circles.length, dl = (c) => Math.hypot(c.x - cxm, c.y - cym);
  const circles = L.circles.map((c, i) => `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="${c.r.toFixed(2)}" fill="${setColor(i)}" fill-opacity=".30" stroke="${setColor(i)}" stroke-width=".9"/><text x="${(c.x + ((c.x - cxm) / (dl(c) || 1)) * c.r * 0.82).toFixed(1)}" y="${(c.y + ((c.y - cym) / (dl(c) || 1)) * c.r * 0.82 + 2).toFixed(1)}" text-anchor="middle" font-size="6" font-weight="800" fill="${setColor(i)}">${String.fromCharCode(65 + i)}</text>`).join('');
  const labels = rg.regions.map((r) => { const p = L.labels.get(r.mask); if (!p) return ''; const lead = Math.hypot(p[0] - p[3], p[1] - p[4]) > 2.2 ? `<line x1="${p[3].toFixed(1)}" y1="${p[4].toFixed(1)}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="var(--muted)" stroke-width=".35"/><circle cx="${p[3].toFixed(1)}" cy="${p[4].toFixed(1)}" r=".9" fill="var(--muted)"/>` : ''; const on = sel === r.mask; return `${lead}<g data-act="set-region" data-mask="${r.mask}" style="cursor:pointer"><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${on ? 6.2 : 5.2}" fill="var(--panel)" fill-opacity="${on ? 1 : .72}" stroke="${on ? 'var(--accent)' : 'none'}" stroke-width="1.1"/><text x="${p[0].toFixed(1)}" y="${(p[1] + 1.9).toFixed(1)}" text-anchor="middle" font-size="5.4" font-weight="700" fill="var(--ink)" font-family="var(--mono)">${r.n}</text></g>`; }).join('');
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Diagrama de Venn" style="width:100%;max-width:360px;display:block;margin:0 auto">${circles}${labels}</svg>`;
}
function upsetSvg(sets, rg) {
  const rows = rg.regions.slice(0, 14), rh = 17, n = sets.length, W = 300, mx = W * 0.5, step = (W - mx - 8) / n, max = Math.max(...rows.map((r) => r.n), 1), sel = S.sets.region;
  const body = rows.map((r, j) => { const y = 24 + j * rh, bw = Math.max(2, (r.n / max) * (mx - 46)), on = sel === r.mask;
    const dots = sets.map((_, i) => `<circle cx="${mx + step * (i + 0.5)}" cy="${y + 7}" r="4.2" fill="${r.in[i] ? setColor(i) : 'var(--line)'}"/>`).join(''), ins = r.in.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), link = ins.length > 1 ? `<line x1="${mx + step * (ins[0] + 0.5)}" x2="${mx + step * (ins[ins.length - 1] + 0.5)}" y1="${y + 7}" y2="${y + 7}" stroke="var(--ink)" stroke-width="1.6"/>` : '';
    return `<g data-act="set-region" data-mask="${r.mask}" style="cursor:pointer"><rect x="0" y="${y - 1}" width="${W}" height="${rh - 1}" fill="${on ? 'var(--accent-soft)' : 'transparent'}"/><rect x="40" y="${y + 1}" width="${bw}" height="11" rx="2" fill="var(--accent)" fill-opacity=".75"/><text x="36" y="${y + 10}" text-anchor="end" font-size="9" font-family="var(--mono)" fill="var(--ink)">${r.n}</text>${link}${dots}</g>`; }).join('');
  const heads = sets.map((s, i) => `<text x="${mx + step * (i + 0.5)}" y="14" text-anchor="middle" font-size="8.5" font-weight="700" fill="${setColor(i)}">${String.fromCharCode(65 + i)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${24 + rows.length * rh + 4}" role="img" aria-label="Gráfico de combinaciones (UpSet)" style="width:100%;display:block">${heads}${body}</svg>`;
}
function tabSets() {
  const w = S.world, st = S.sets, { sets, rg } = setsData(); setCat ||= SETS.catalog(w);
  const recipes = SETS.RECIPES.map((r) => `<button class="btn small${st.recipe === r.id ? ' primary' : ''}" data-act="set-recipe" data-id="${r.id}" title="${esc(r.hint)}">${esc(r.title)}</button>`).join('');
  const chips = sets.map((s, i) => `<span class="tag" style="display:inline-flex;gap:6px;align-items:center;border-color:${setColor(i)}"><span class="sw" style="background:${setColor(i)}"></span><b style="font-family:var(--mono)">${String.fromCharCode(65 + i)}</b> ${esc(SETS.labelOf(w, s.key))} · ${s.ids.size}<button data-act="set-del" data-i="${i}" aria-label="Quitar" style="all:unset;cursor:pointer;color:var(--muted);padding:0 2px">✕</button></span>`).join('');
  const opts = setCat.map((g) => `<optgroup label="${esc(g.group)}">${g.items.map((it) => `<option value="${esc(it.key)}"${st.keys.includes(it.key) ? ' disabled' : ''}>${esc(it.label)} (${it.n})</option>`).join('')}</optgroup>`).join('');
  const sel = st.region != null && rg ? rg.byMask.get(st.region) : null, selR = sel && rg.regions.find((r) => r.mask === st.region);
  const diagram = !rg ? tipBox('Elige una <b>receta</b> o añade 2 o 3 conjuntos (carpeta, módulo, autor, riesgo, pruebas, paquete…). Cada número es cuántos archivos hay <b>solo</b> en esa región; los cruces son los archivos que cumplen varias condiciones a la vez.') : sets.length <= 4 ? vennSvg(sets, rg) : `<div class="muted" style="font-size:11.5px">Con ${sets.length} conjuntos un Venn sería ilegible: se muestran las combinaciones, de más a menos archivos.</div>${upsetSvg(sets, rg)}`;
  const accuracy = rg && sets.length >= 3 && sets.length <= 4 ? `<div class="muted" style="font-size:11px">Con ${sets.length} conjuntos las áreas son un ajuste (error ≈ ${Math.round((SETS.layoutVenn(sets).err || 0) * 100)}%); los números son exactos.</div>` : '';
  const exp = rg && sets.length <= 4 ? '<div class="row wrap"><button class="btn small" data-act="set-export" title="Copia el diagrama como SVG (se puede pegar en un documento o guardar como .svg)">Copiar SVG</button>' + (LIVE ? '<button class="btn small" data-act="set-export-file">Guardar en el proyecto</button>' : '') + '</div>' : '';
  return `<section class="blk"><h3>Recetas</h3><div class="chips2">${recipes}</div></section>
    <section class="blk"><h3>Conjuntos (${sets.length}/${SETS.MAX_SETS})</h3><div class="chips2">${chips || '<span class="muted">Ninguno todavía</span>'}</div>
      <select id="setAdd" aria-label="Añadir conjunto"${sets.length >= SETS.MAX_SETS ? ' disabled' : ''}><option value="">＋ Añadir un conjunto…</option>${opts}</select>
      <label class="chk"><input type="checkbox" id="setBlobs" ${st.show ? 'checked' : ''}> Mostrar manchas de color en el mapa</label></section>
    <section class="blk"><h3>Mis vistas y conjuntos</h3>
      ${S.setStore.views.length ? `<div class="list">${S.setStore.views.map((v, i) => `<div class="item"><span class="top"><button class="grow" data-act="set-loadview" data-i="${i}" style="all:unset;cursor:pointer;color:var(--ink);font-weight:600">${esc(v.name)}</button><span class="muted mono">${v.keys.length} conj.</span><button data-act="set-delview" data-i="${i}" aria-label="Borrar vista" style="all:unset;cursor:pointer;color:var(--muted)">✕</button></span></div>`).join('')}</div>` : '<div class="muted">Aún no hay vistas guardadas.</div>'}
      ${sets.length ? `<div class="row"><input type="text" id="setViewName" placeholder="Nombre de esta vista" maxlength="40"><button class="btn small" data-act="set-saveview">Guardar vista</button></div>` : ''}
      ${Object.keys(S.setStore.custom).length ? `<div class="chips2">${Object.entries(S.setStore.custom).map(([k, ids]) => `<span class="tag">★ ${esc(k)} · ${ids.length}<button data-act="set-delcustom" data-k="${esc(k)}" aria-label="Borrar conjunto" style="all:unset;cursor:pointer;color:var(--muted);padding:0 2px">✕</button></span>`).join('')}</div>` : ''}</section>
    ${rg ? `<section class="blk"><h3>Diagrama · ${rg.union} archivos en la unión</h3>${diagram}${accuracy}${exp}</section>` : `<section class="blk">${diagram}</section>`}
    ${st.reading ? `<section class="blk"><h3>Lectura</h3><div class="card"><div>${esc(st.reading)}</div></div></section>` : ''}
    ${rg ? `<section class="blk"><h3>${selR ? esc(regionName(selR, sets)) + ' · ' + selR.n : 'Pulsa un número para ver sus archivos'}</h3>
      ${sel ? `<div class="list">${sel.slice(0, 40).map((id) => fileBtn(id)).join('')}</div>${sel.length > 40 ? `<div class="muted">y ${sel.length - 40} más…</div>` : ''}<div class="row wrap"><button class="btn small" data-act="set-focus">Mostrar en el mapa</button><button class="btn small" data-act="set-ask" title="Pregunta por estos archivos">Preguntar por ellos</button></div><div class="row"><input type="text" id="setRegName" placeholder="Guardar estos archivos como conjunto…" maxlength="40"><button class="btn small" data-act="set-savereg">Guardar</button></div>` : `<div class="row wrap"><button class="btn small" data-act="set-focus-all">Enfocar la unión</button></div>`}</section>` : ''}`;
}
/** SVG autónomo (colores resueltos) con leyenda: para pegar o guardar */
function vennExportSvg() {
  const { sets, rg } = setsData(); if (!rg || sets.length > 4) return null;
  const cs = getComputedStyle(document.documentElement), v = (n, d) => cs.getPropertyValue(n).trim() || d;
  let body = vennSvg(sets, rg).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/ style="cursor:pointer"/g, '').replace(/ data-(?:act|mask)="[^"]*"/g, '')  ;
  const esc2 = (t) => String(t).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const leg = sets.map((s, i) => `<g transform="translate(4 ${106 + i * 7})"><rect width="4" height="4" rx=".8" fill="${setColor(i)}"/><text x="6" y="3.6" font-size="3.6" fill="${v('--ink', '#222')}" font-family="sans-serif">${String.fromCharCode(65 + i)} · ${esc2(SETS.labelOf(S.world, s.key))} · ${s.ids.size}</text></g>`).join('');
  const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${110 + sets.length * 7}" width="600"><rect width="100" height="${110 + sets.length * 7}" fill="${v('--bg', '#fff')}"/><text x="4" y="5" font-size="4" font-weight="700" fill="${v('--ink', '#222')}" font-family="sans-serif">${esc2(S.world.meta?.root || 'proyecto')} · ${rg.union} archivos</text><g transform="translate(0 6) scale(1 1)">${body}</g>${leg}</svg>`;
  return full.replace(/var\(--(\w[\w-]*)\)/g, (_, n) => v('--' + n, n === 'panel' ? '#fff' : '#222'));
}
function onSetsClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || !b.dataset.act.startsWith('set-')) return; const d = b.dataset, { sets, rg } = setsData();
  switch (d.act) {
    case 'set-export': { const svg = vennExportSvg(); if (!svg) break; (navigator.clipboard ? navigator.clipboard.writeText(svg) : Promise.reject()).then(() => toast('SVG copiado: pégalo en un editor o guárdalo como .svg'), () => { const ta = document.createElement('textarea'); ta.value = svg; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('SVG copiado'); } catch { toast('No se pudo copiar'); } ta.remove(); }); break; }
    case 'set-export-file': { const svg = vennExportSvg(); if (!svg) break; Backend.j('/api/export', { method: 'POST', body: JSON.stringify({ name: 'venn', svg }) }).then((r) => toast('Guardado en ' + r.path), () => toast('No se pudo guardar')); break; }
    case 'set-recipe': { const r = SETS.recipe(S.world, d.id); if (!r || !r.keys) { toast('Este proyecto no tiene datos para «' + (r?.recipe.title || d.id) + '»'); return; } setsSet(r.keys, d.id, r.reading); break; }
    case 'set-del': S.sets.keys.splice(+d.i, 1); S.sets.recipe = null; S.sets.reading = ''; setsRecompute(); setFocus(null, '', false); renderPanel(); requestRender(); break;
    case 'set-region': S.sets.region = S.sets.region === +d.mask ? null : +d.mask; renderPanel(); break;
    case 'set-focus': { const ids = rg.byMask.get(S.sets.region) || []; const r = rg.regions.find((x) => x.mask === S.sets.region); setFocus(ids, regionName(r, sets)); break; }
    case 'set-focus-all': setFocus([...new Set(rg.regions.flatMap((r) => r.ids))], 'Unión de conjuntos'); break;
    case 'set-saveview': { const name = ($('#setViewName')?.value || '').trim(); if (!name) { toast('Ponle un nombre a la vista'); return; } const v = { name, keys: S.sets.keys.slice(), recipe: S.sets.recipe }; const i = S.setStore.views.findIndex((x) => x.name === name); if (i >= 0) S.setStore.views[i] = v; else S.setStore.views.push(v); saveSetStore(); renderPanel(); toast('Vista guardada'); break; }
    case 'set-loadview': { const v = S.setStore.views[+d.i]; if (v) setsSet(v.keys.filter((k) => !k.startsWith('saved:') || S.world.customSets?.[k.slice(6)]), v.recipe, ''); break; }
    case 'set-delview': S.setStore.views.splice(+d.i, 1); saveSetStore(); renderPanel(); break;
    case 'set-savereg': { const name = ($('#setRegName')?.value || '').trim(), ids = rg.byMask.get(S.sets.region) || []; if (!name || !ids.length) { toast('Elige una región y ponle nombre'); return; } S.setStore.custom[name] = ids.slice(); saveSetStore(); toast('Conjunto «' + name + '» guardado: ya está en el catálogo'); renderPanel(); break; }
    case 'set-delcustom': delete S.setStore.custom[d.k]; saveSetStore(); S.sets.keys = S.sets.keys.filter((k) => k !== 'saved:' + d.k); setsRecompute(); renderPanel(); requestRender(); break;
    case 'set-ask': { const ids = rg.byMask.get(S.sets.region) || []; setFocus(ids, 'Región elegida'); S.tab = 'ask'; runAsk('¿qué es lo más riesgoso?'); break; }
  }
}
function drawSetBlobs() { // manchas translúcidas bajo los archivos de cada conjunto; donde se cruzan, los colores se mezclan
  const st = S.sets; if (!st.show || !st.keys.length) return; const city = S.mode === 'city';
  st.ids.forEach((ids, i) => {
    if (ids.size > 2500) return; const col = T.pal[i % 8];
    for (const id of ids) {
      const vm = S.VM.get(id); if (!vm || !vm.vis) continue; const p = proj(vm.x, vm.y, 0), r = (city ? Math.max(vm.city.w, vm.city.d) * CAM.k * 1.5 : Math.max(3, vm.sz * CAM.k) * 2) + 34;
      if (!onScr(p[0], p[1], r)) continue; aura(p[0], p[1], r, r * (city ? 0.55 * Math.max(0.5, CAM.tilt + 0.3) : 1), col, T.dark ? 0.55 : 0.5);
    }
  });
}
function drawSetMarks() { // fichas de color sobre cada archivo del conjunto (una por conjunto), para reconocer pertenencia a simple vista
  const st = S.sets; if (!st.show || !st.keys.length) return; const city = S.mode === 'city';
  for (const vm of S.VM.values()) {
    if (!vm.vis) continue; let n = 0; const hits = []; st.ids.forEach((ids, i) => { if (ids.has(vm.n.id)) hits.push(i); }); if (!hits.length) continue;
    const p = proj(vm.x, vm.y, city ? vm.h : 0); if (!onScr(p[0], p[1], 30)) continue; const r = 4.2, y = p[1] - (city ? 7 : Math.max(3, vm.sz * CAM.k) + 7), x0 = p[0] - ((hits.length - 1) * 9) / 2;
    for (const i of hits) { ctx.beginPath(); ctx.arc(x0 + n * 9, y, r, 0, 7); ctx.fillStyle = css(T.pal[i % 8], 1); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = css(T.stage, 0.95); ctx.stroke(); n++; }
  }
}
function initSets() {
  const b = $('#tabbody'); b.addEventListener('click', onSetsClick);
  b.addEventListener('change', (e) => {
    if (e.target.id === 'setAdd' && e.target.value) { if (!S.sets.keys.includes(e.target.value)) { S.sets.keys.push(e.target.value); S.sets.recipe = null; S.sets.reading = ''; setsRecompute(); setFocus(null, '', false); renderPanel(); requestRender(); } }
    else if (e.target.id === 'setBlobs') { S.sets.show = e.target.checked; requestRender(); }
  });
  if (S.world) loadSetStore();
  Bus.on('world', () => { setCat = null; loadSetStore(); if (S.sets.keys.length) setsRecompute(); });
}
