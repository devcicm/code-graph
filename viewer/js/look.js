/* ───────────────────────── look.js · apariencia: temas, colores, comodidad y contraste ───────────────────────── */
const TOKEN_KEYS = ['bg', 'stage', 'panel', 'panel2', 'ink', 'muted', 'line', 'accent', 'accent-ink', 'accent-soft', 'warn', 'warn-soft', 'ok', 'amber', 'ground', 'ground-edge', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
const mk = (arr) => Object.fromEntries(TOKEN_KEYS.map((k, i) => [k, arr[i]]));
const PRESETS = {
  noche: { name: 'Noche suave', dark: true, t: mk(['#0a1016', '#0d141b', '#111a22', '#16212b', '#dce6ee', '#8696a5', '#223140', '#6cb0ff', '#06121f', '#14304d', '#ff9366', '#38211a', '#58d39a', '#f0b84a', '#131e28', '#243545', '#6c9bff', '#3cc9af', '#e7b23e', '#e57dbb', '#a392ff', '#86cf5b', '#d0a46c', '#93aebf']) },
  dia: { name: 'Día', dark: false, t: mk(['#e6ebef', '#f1f4f6', '#fbfcfd', '#eff3f5', '#15212b', '#5a6b79', '#c9d4dc', '#1f5fd1', '#ffffff', '#dae6fa', '#c2410c', '#fbe6da', '#1d7a4a', '#a86a00', '#e0e8ee', '#b3c2ce', '#3b6fd8', '#178f7c', '#b9810a', '#b4478c', '#6a55d6', '#4a8f2c', '#8a6a3e', '#5f7c8f']) },
  contraste: { name: 'Alto contraste', dark: true, t: mk(['#000000', '#05070a', '#0b0f14', '#10161d', '#ffffff', '#c3ccd5', '#4a5866', '#7fc2ff', '#000000', '#10304f', '#ff8a5c', '#3a1d12', '#5dff9e', '#ffd24a', '#10161d', '#5b6a79', '#7fb0ff', '#3df0cf', '#ffd24a', '#ff8ad0', '#b7a9ff', '#9dff6a', '#f0c288', '#c4d6e4']) },
  papel: { name: 'Papel', dark: false, t: mk(['#e9e2d3', '#f4efe3', '#fbf8ef', '#f0eadb', '#2b2418', '#6b5f4b', '#d4c9b0', '#8a4b1f', '#fffaf0', '#f0dcc0', '#b3361b', '#f6dcd3', '#2f6b3a', '#946200', '#e6dec9', '#c2b79a', '#4a6fa5', '#2f7d6f', '#a8760e', '#a64a7a', '#6b5aa8', '#5d8a2f', '#8a5f35', '#6c7f8a']) },
  daltonismo: { name: 'Seguro para daltonismo', dark: true, t: mk(['#0a1016', '#0d141b', '#111a22', '#16212b', '#e8eef3', '#9aa8b5', '#26343f', '#56b4e9', '#06121f', '#173a55', '#e69f00', '#3a2b0a', '#009e73', '#f0e442', '#131e28', '#2b3b4a', '#56b4e9', '#009e73', '#f0e442', '#cc79a7', '#0072b2', '#d55e00', '#e69f00', '#b0b8c0']) },
  fosforo: { name: 'Fósforo', dark: true, t: mk(['#050b07', '#07110a', '#0a160d', '#0d1d11', '#c8f5d2', '#6faa80', '#1c3a25', '#4dff88', '#03140a', '#0f3a1d', '#ffb347', '#3a2608', '#4dff88', '#ffd166', '#0b1a0f', '#1f4a2c', '#4dff88', '#2ee6c8', '#ffd166', '#ff8fd0', '#9ad0ff', '#b6ff6a', '#e0b070', '#7fb59a']) },
};
const LOOK_DEFAULT = { preset: 'sistema', tokens: {}, states: {}, risk: null, ui: { motion: 'calmo', density: 'normal', height: 1, sat: 1, shadow: 0.5, glow: 0.6, blur: 0.35 } };
const LOOK_GROUPS = [
  ['Interfaz', ['bg', 'panel', 'ink', 'muted', 'line', 'accent', 'warn', 'ok', 'amber'], { bg: 'Fondo', panel: 'Paneles', ink: 'Texto', muted: 'Texto suave', line: 'Líneas', accent: 'Acento', warn: 'Advertencia', ok: 'Correcto', amber: 'Aviso' }],
  ['Mapa', ['stage', 'ground', 'ground-edge'], { stage: 'Escenario', ground: 'Suelo', 'ground-edge': 'Borde del suelo' }],
  ['Categorías (carpetas, módulos, autores)', ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'], Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((i) => ['c' + i, 'Color ' + (i + 1)]))],
];
const Look = { s: JSON.parse(JSON.stringify(LOOK_DEFAULT)), open: false };

/* ── contraste (WCAG) ── */
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };
const toHex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const CHECKS = [['ink', 'stage', 4.5, 'Texto sobre el mapa'], ['ink', 'panel', 4.5, 'Texto en paneles'], ['muted', 'panel', 4.5, 'Texto suave en paneles'], ['muted', 'stage', 4.5, 'Nombres de barrios'], ['accent', 'panel', 3, 'Acento'], ['warn', 'panel', 3, 'Advertencia'], ['ok', 'panel', 3, 'Correcto'], ['accent-ink', 'accent', 4.5, 'Texto sobre el acento'], ['ground', 'stage', 1.1, 'Suelo visible']];
const curTokens = () => { const cs = getComputedStyle(document.documentElement); return Object.fromEntries(TOKEN_KEYS.map((k) => [k, cs.getPropertyValue('--' + k).trim()])); };
function contrastReport() { const t = curTokens(); return CHECKS.map(([a, b, min, label]) => { const r = ratio(hex(t[a]), hex(t[b])); return { a, b, min, label, r, ok: r >= min }; }); }
function fixContrast(a, b, min) { // acerca el color a blanco o negro hasta cumplir
  const t = curTokens(), bg = hex(t[b]); let c = hex(t[a]); const toward = lum(bg) < 0.5 ? [255, 255, 255] : [0, 0, 0];
  for (let i = 0; i < 40 && ratio(c, bg) < min; i++) c = mixc(c, toward, 0.08);
  Look.s.tokens[a] = toHex(c);
}

/* ── aplicar ── */
function applyLook(save = true) {
  const root = document.documentElement, s = Look.s, p = PRESETS[s.preset];
  for (const k of TOKEN_KEYS) root.style.removeProperty('--' + k);
  for (const k of Object.keys(STATE_META)) root.style.removeProperty('--st-' + k);
  for (let i = 0; i < 4; i++) root.style.removeProperty('--risk' + i);
  if (p) { root.dataset.theme = p.dark ? 'dark' : 'light'; for (const k of TOKEN_KEYS) root.style.setProperty('--' + k, p.t[k]); } else delete root.dataset.theme;
  for (const [k, v] of Object.entries(s.tokens)) root.style.setProperty('--' + k, v);
  for (const [k, v] of Object.entries(s.states)) root.style.setProperty('--st-' + k, v);
  if (s.risk) s.risk.forEach((v, i) => root.style.setProperty('--risk' + i, v));
  S.layers.anim = s.ui.motion === 'suave' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ly = $('#lyAnim'); if (ly) ly.checked = S.layers.anim;
  readTheme(); if (S.VM?.size) applySizes(false); requestRender();
  if (save) { try { localStorage.setItem('codegraph:look', JSON.stringify(s)); } catch {} if (LIVE && Look.liveSave) Look.liveSave(s); }
  if (Look.open) renderLook();
}
async function loadLook() {
  let v = null; try { v = JSON.parse(localStorage.getItem('codegraph:look') || 'null'); } catch {}
  if (LIVE) { try { const r = await Backend.j('/api/theme'); if (r && r.look) v = r.look; } catch {} Look.liveSave = (s) => Backend.j('/api/theme', { method: 'PUT', body: JSON.stringify({ look: s }) }).catch(() => {}); }
  if (v) Look.s = { ...JSON.parse(JSON.stringify(LOOK_DEFAULT)), ...v, ui: { ...LOOK_DEFAULT.ui, ...(v.ui || {}) } };
  else if (matchMedia('(prefers-contrast: more)').matches) Look.s.preset = 'contraste';
  applyLook(false);
}

/* ── panel ── */
const swatch = (p) => `<span class="lk-sw">${[p.t.bg, p.t.panel, p.t.accent, p.t.c1, p.t.c2, p.t.c3].map((c) => `<i style="background:${c}"></i>`).join('')}</span>`;
function renderLook() {
  const el = $('#look'), s = Look.s, t = curTokens();
  const row = (k, label) => `<label class="lk-row"><span>${esc(label)}</span><input type="color" data-lk="token" data-k="${k}" value="${toHex(hex(t[k]))}"></label>`;
  const states = Object.entries(STATE_META).map(([k, m]) => `<label class="lk-row"><span>${esc(m.label)}</span><input type="color" data-lk="state" data-k="${k}" value="${toHex(stateColor(k))}"></label>`).join('');
  const rk = [0, 1, 2, 3].map((i) => (s.risk ? s.risk[i] : toHex(ramp(i / 3, [T.dark ? [58, 150, 170] : [60, 150, 170], T.amber, T.warn, T.dark ? [255, 80, 90] : [200, 40, 50]]))));
  const rep = contrastReport(), bad = rep.filter((r) => !r.ok);
  const seg = (name, opts, cur) => `<div class="seg lk-seg">${opts.map(([v, l]) => `<button data-lk="ui" data-k="${name}" data-v="${v}" aria-selected="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="lk-h"><b>Aspecto</b><button class="btn small" data-lk="close" aria-label="Cerrar">✕</button></div>
  <section><h4>Tema</h4><div class="lk-presets">${[['sistema', { name: 'Sistema', t: PRESETS[matchMedia('(prefers-color-scheme: light)').matches ? 'dia' : 'noche'].t }], ...Object.entries(PRESETS)].map(([id, p]) => `<button class="lk-p" data-lk="preset" data-id="${id}" aria-pressed="${s.preset === id}">${swatch(p)}<span>${esc(p.name)}</span></button>`).join('')}</div></section>
  <section><h4>Comodidad</h4>
    <div class="lk-line"><span>Tamaño del texto</span>${seg('text', [['normal', 'Normal'], ['grande', 'Grande'], ['enorme', 'Muy grande']], TEXT_KEY)}</div>
    <div class="lk-line"><span>Animación</span>${seg('motion', [['calmo', 'Calmo'], ['suave', 'Suave']], s.ui.motion)}</div>
    <div class="lk-line"><span>Etiquetas</span>${seg('density', [['min', 'Pocas'], ['normal', 'Normal'], ['max', 'Muchas']], s.ui.density)}</div>
    <div class="lk-line"><span>Altura de edificios</span><input type="range" min="0.4" max="1.6" step="0.1" value="${s.ui.height}" data-lk="range" data-k="height"></div>
    <div class="lk-line"><span>Saturación del mapa</span><input type="range" min="0.3" max="1.3" step="0.05" value="${s.ui.sat}" data-lk="range" data-k="sat"></div></section>
  <section><h4>Relieve y profundidad</h4>
    <div class="lk-line"><span title="Sombra de cada edificio o estrella sobre el suelo">Sombras de elementos</span><input type="range" min="0" max="1" step="0.05" value="${s.ui.shadow ?? 0.5}" data-lk="range" data-k="shadow"></div>
    <div class="lk-line"><span title="Brillo suave en las relaciones y mancha de color bajo los elementos conectados">Resplandor de relaciones</span><input type="range" min="0" max="1" step="0.05" value="${s.ui.glow ?? 0.6}" data-lk="range" data-k="glow"></div>
    <div class="lk-line"><span title="Desenfoca lo que no está relacionado con tu selección">Difuminar lo que no importa</span><input type="range" min="0" max="1" step="0.05" value="${s.ui.blur ?? 0.35}" data-lk="range" data-k="blur"></div>
    <div class="lk-line"><span>Atajo</span><div class="seg lk-seg"><button data-lk="fx" data-v="off">Plano</button><button data-lk="fx" data-v="soft">Suave</button><button data-lk="fx" data-v="rich">Marcado</button></div></div></section>
  ${LOOK_GROUPS.map(([title, keys, labels]) => `<details><summary>${esc(title)}</summary>${keys.map((k) => row(k, labels[k])).join('')}</details>`).join('')}
  <details><summary>Estados de los archivos</summary>${states}</details>
  <details><summary>Rampa de riesgo (bajo → alto)</summary>${rk.map((c, i) => `<label class="lk-row"><span>${['Bajo', 'Medio', 'Alto', 'Crítico'][i]}</span><input type="color" data-lk="risk" data-k="${i}" value="${c}"></label>`).join('')}</details>
  <details ${bad.length ? 'open' : ''}><summary>Contraste ${bad.length ? `<span class="tag warn">${bad.length} por mejorar</span>` : '<span class="tag ok">todo correcto</span>'}</summary>
    ${rep.map((r) => `<div class="lk-row"><span>${esc(r.label)}</span><span class="mono ${r.ok ? '' : 'bad'}">${r.r.toFixed(1)}:1 ${r.ok ? '✓' : '✗ (mín. ' + r.min + ')'}</span>${r.ok ? '' : `<button class="btn small" data-lk="fix" data-a="${r.a}" data-b="${r.b}" data-min="${r.min}">Corregir</button>`}</div>`).join('')}</details>
  <section class="lk-foot"><button class="btn small" data-lk="reset">Restablecer todo</button><button class="btn small" data-lk="copy">Copiar perfil</button><button class="btn small" data-lk="paste">Pegar perfil</button><textarea id="lkJson" hidden placeholder="Pega aquí el JSON del perfil y pulsa Aplicar"></textarea><button class="btn small primary" id="lkApply" data-lk="apply" hidden>Aplicar</button>
  <div class="muted">${LIVE ? 'Se guarda en el proyecto (.codegraph/theme.json) y en este navegador.' : 'Se guarda en este navegador. Copia el perfil para compartirlo.'}</div></section>`;
}
function openLook(v = !Look.open) { Look.open = v; $('#look').hidden = !v; if (v) renderLook(); }
function initLook() {
  const el = $('#look'); let raf = 0;
  const later = (f) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(f); };
  $('#btnLook').onclick = () => openLook();
  el.addEventListener('input', (e) => {
    const d = e.target.dataset; if (!d.lk) return;
    if (d.lk === 'token') { Look.s.tokens[d.k] = e.target.value; later(() => applyLookSoft()); }
    else if (d.lk === 'state') { Look.s.states[d.k] = e.target.value; later(() => applyLookSoft()); }
    else if (d.lk === 'risk') { Look.s.risk = Look.s.risk || [0, 1, 2, 3].map((i) => toHex(ramp(i / 3, [T.dark ? [58, 150, 170] : [60, 150, 170], T.amber, T.warn, T.dark ? [255, 80, 90] : [200, 40, 50]]))); Look.s.risk[+d.k] = e.target.value; later(() => applyLookSoft()); }
    else if (d.lk === 'range') { Look.s.ui[d.k] = +e.target.value; later(() => applyLookSoft()); }
  });
  el.addEventListener('change', () => { applyLook(true); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lk]'); if (!b) return; const d = b.dataset;
    if (d.lk === 'close') openLook(false);
    else if (d.lk === 'preset') { Look.s.preset = d.id; Look.s.tokens = {}; applyLook(); }
    else if (d.lk === 'fx') { const v = { off: [0, 0, 0], soft: [0.5, 0.6, 0.35], rich: [0.9, 1, 0.8] }[d.v]; [Look.s.ui.shadow, Look.s.ui.glow, Look.s.ui.blur] = v; applyLook(); }
    else if (d.lk === 'ui') { if (d.k === 'text') { setTextSize(d.v); resize(); } else Look.s.ui[d.k] = d.v; applyLook(); }
    else if (d.lk === 'fix') { fixContrast(d.a, d.b, +d.min); applyLook(); }
    else if (d.lk === 'reset') { Look.s = JSON.parse(JSON.stringify(LOOK_DEFAULT)); setTextSize('normal'); applyLook(); }
    else if (d.lk === 'copy') copyText(JSON.stringify({ look: Look.s, text: TEXT_KEY }, null, 1), $('#lkJson'));
    else if (d.lk === 'paste') { $('#lkJson').hidden = false; $('#lkApply').hidden = false; $('#lkJson').focus(); }
    else if (d.lk === 'apply') { try { const v = JSON.parse($('#lkJson').value); Look.s = { ...JSON.parse(JSON.stringify(LOOK_DEFAULT)), ...(v.look || v), ui: { ...LOOK_DEFAULT.ui, ...((v.look || v).ui || {}) } }; if (v.text) setTextSize(v.text); applyLook(); toast('Perfil aplicado'); } catch { toast('Ese perfil no es un JSON válido'); } }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && Look.open && !$('#pal').hidden === false && !/INPUT|TEXTAREA/.test(e.target.tagName)) openLook(false); });
  loadLook();
}
/** durante el arrastre de un selector de color: aplica sin reconstruir el panel */
function applyLookSoft() { const o = Look.open; Look.open = false; applyLook(false); Look.open = o; }
