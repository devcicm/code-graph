/* ───────────────────────── panels.js · inspector: resumen, código, traza, hallazgos, IA ───────────────────────── */
const RISK_LABEL = { fanIn: 'Muchos dependen de él', churn: 'Cambia seguido', cycle: 'Está en un ciclo', untested: 'Poca cobertura de pruebas', owner: 'Lo conoce una sola persona', size: 'Tamaño', dup: 'Código duplicado' };
const RISK_COL = { fanIn: 0, churn: 3, cycle: 2, untested: 4, owner: 6, size: 7, dup: 5 };
const SEV = { alta: ['Alta', 'warn'], media: ['Media', 'amb'], info: ['Info', ''] };
const sevColor = (s) => css(s === 'alta' ? T.warn : s === 'media' ? T.amber : T.muted);
const symsOf = (file) => S.world.symbols.filter((s) => s.file === file);
const healthColor = (s) => css(riskColor(100 - s));
const ring = (score, color) => `<svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="30" fill="none" stroke="var(--line)" stroke-width="8"/><circle cx="38" cy="38" r="30" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(score / 100) * 188.5} 188.5" transform="rotate(-90 38 38)"/><text x="38" y="43" text-anchor="middle" font-family="var(--mono)" font-weight="700" font-size="19" fill="var(--ink)">${score}</text></svg>`;
const tipBox = (t) => `<div class="tipbox">${t}</div>`;
const pillState = (n) => `<span class="pill" style="background:${css(stateColor(n.state))}" title="${esc(STATE_META[n.state]?.hint || '')}">${esc(STATE_META[n.state]?.label || n.state)}</span>`;
const fileBtn = (id, extra = '') => `<button class="item" data-go="${esc(id)}"><span class="top"><span class="sw" style="background:${css(dirColor(S.N[id]?.dir))}"></span><span class="mono grow">${esc(id)}</span>${extra}</span></button>`;

function initPanels() {
  const b = $('#tabbody');
  b.addEventListener('click', onPanelClick); b.addEventListener('input', onPanelInput); b.addEventListener('change', onPanelChange); b.addEventListener('keydown', onPanelKey);
}
function updateTabs() {
  const alta = S.world ? S.world.insights.filter((i) => i.sev === 'alta').length : 0, pend = S.extra.edges.filter((e) => e.status === 'pending').length + S.extra.suggestNotes.length + S.extra.actions.length;
  $$('#tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === S.tab));
  $('#tabs [data-tab=insights]').innerHTML = `Hallazgos${alta ? `<span class="badge">${alta}</span>` : ''}`;
  $('#tabs [data-tab=ai]').innerHTML = `IA${pend ? `<span class="badge">${pend}</span>` : ''}`;
}
function renderPanel() {
  if (!S.world) return; updateTabs();
  const body = $('#tabbody'), top = body.scrollTop, same = body.dataset.tab === S.tab; body.dataset.tab = S.tab;
  body.innerHTML = { summary: tabSummary, ask: tabAsk, sets: tabSets, code: tabCode, trace: tabTrace, insights: tabInsights, ai: tabAI }[S.tab]();
  if (same) body.scrollTop = top; else body.scrollTop = 0;
  if (S.tab === 'code') afterCodeRender();
}
function refreshPanels() {
  if (!S.world) return;
  if (S.tab === 'code' && S.codeState?.mode === 'edit') { updateTabs(); return; }
  renderPanel(); if (S.tab === 'code' && S.sel) loadCode(S.sel, null, true);
}

/* ═══════════ RESUMEN ═══════════ */
function tabSummary() { return S.sel ? nodeSummary(S.N[S.sel]) : projectSummary(); }
function projectSummary() {
  const w = S.world, code = S.nodes.filter((n) => !n.isTest), h = w.health, g = w.meta.git;
  const top = [...code].sort((a, b) => b.risk.score - a.risk.score).slice(0, 5), tl = w.timeline.slice(-5).reverse();
  return `
  <section class="blk"><div class="ring">${ring(h.score, healthColor(h.score))}<div class="grow"><div class="title-node" style="font-size:15px">Salud: ${esc(h.grade)}</div><div class="muted">${h.parts.length ? h.parts.map((p) => `${p.count} ${esc(p.label)}`).slice(0, 3).join(' · ') : 'Sin problemas detectados.'}</div></div></div>
    <button class="btn" data-act="tab" data-tab="insights">Ver ${w.insights.length} hallazgos</button></section>
  <div class="kv"><div><b>${code.length}</b><span>archivos</span></div><div><b>${code.reduce((s, n) => s + (n.loc || 0), 0)}</b><span>líneas</span></div><div><b>${g.available ? g.commits : '—'}</b><span>commits</span></div><div><b>${w.authors.length || '—'}</b><span>autores</span></div></div>
  ${sinceBlock()}
  <section class="blk"><h3>Dónde mirar primero</h3><div class="list">${top.map((n) => `<button class="item" data-go="${esc(n.id)}"><span class="top"><span class="mono grow">${esc(short(n))}</span>${pillState(n)}<span class="tag ${n.risk.level === 'alto' ? 'warn' : ''}">riesgo ${n.risk.score}</span></span></button>`).join('')}</div></section>
  ${tl.length ? `<section class="blk"><h3>Actividad reciente</h3><div class="list">${tl.map((c) => `<button class="item" data-act="tl-go" data-i="${c.i}"><span class="top"><span class="sw" style="background:${css(authorColor(c.a))}"></span><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.m)}</span><span class="muted mono">${esc(ago(c.t))}</span></span></button>`).join('')}</div></section>` : ''}
  ${w.authors.length ? `<section class="blk"><h3>Autores</h3>${w.authors.map((a, i) => `<div class="row"><span class="sw" style="background:${css(authorColor(i))}"></span><span class="grow">${esc(a)}</span><span class="muted mono">${S.nodes.filter((n) => n.git?.owner === i).length} archivos</span></div>`).join('')}</section>` : ''}
  ${tipBox(`<b style="color:var(--ink)">Cómo explorar</b><span>Clic en un edificio: ver sus conexiones. Doble clic: aislar su vecindad.</span><span><kbd>Ctrl K</kbd> busca archivos, símbolos y texto. <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> cambian de vista.</span><span>Cambia el color en <b>Lentes</b> para ver estado, riesgo, calor de cambios o autores.${w.timeline.length ? ' Arrastra la línea de tiempo para ver crecer el proyecto.' : ''}</span>`)}`;
}
function riskBar(n) {
  const r = n.risk, parts = Object.entries(r.parts || {}).map(([k, v]) => [k, (r.weights[k] || 0) * v * 100]).filter(([, c]) => c > 0.4);
  return `<div class="bar" title="Riesgo ${r.score}">${parts.map(([k, c]) => `<i style="width:${c}%;background:${css(T.pal[RISK_COL[k]])}"></i>`).join('')}</div>
    <div class="legend" style="font-size:11.5px">${parts.length ? parts.map(([k, c]) => `<div><span class="sw" style="background:${css(T.pal[RISK_COL[k]])}"></span><span class="grow">${RISK_LABEL[k]}</span><span class="mono muted">+${Math.round(c)}</span></div>`).join('') : '<div class="muted">Sin factores de riesgo relevantes.</div>'}</div>`;
}
function spark(n) {
  if (!n.git?.idx?.length) return ''; const tl = S.world.timeline, now = S.now, bins = new Array(12).fill(0);
  for (const i of n.git.idx) { const m = Math.floor((now - tl[i].t) / (30 * DAY)); if (m >= 0 && m < 12) bins[11 - m]++; }
  const mx = Math.max(1, ...bins);
  return `<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" role="img" aria-label="Cambios por mes, últimos 12 meses">${bins.map((v, i) => `<rect x="${i * 10 + 1}" y="${33 - (v / mx) * 30}" width="8" height="${(v / mx) * 30 || 1}" rx="1.5" fill="${v ? css(T.accent) : css(T.line)}"/>`).join('')}</svg><div class="row muted" style="font-size:10.5px"><span class="grow">hace 12 meses</span><span>hoy</span></div>`;
}
function edgeRow(e, dir) {
  const id = dir === 'out' ? e.target : e.source, n = S.N[id]; if (!n) return '';
  const c = e.card && typeof e.card === 'object' ? e.card : null, syms = (e.symbols || []).slice(0, 4).map((s) => `<span class="tag">${esc(s.name === '*' ? '* as ' + s.local : s.name)}${s.count > 1 ? ' ×' + s.count : ''}</span>`).join(' ');
  const bsyms = e.kind === 'bridge' ? (e.specs || []).slice(0, 3).map((x) => `<span class="tag acc">${esc(x)}</span>`).join(' ') : '';
  return `<button class="item" data-go="${esc(id)}"><span class="top"><span class="mono grow">${esc(short(n))}</span>${e.cycle ? '<span class="tag warn">ciclo</span>' : ''}<span class="tag">${esc(e.kind)}</span></span><span class="row wrap">${syms}${bsyms}</span>${c && c.exports ? `<span class="muted mono" style="font-size:11px">usa ${c.symbols} de ${c.exports} exports</span>` : ''}</button>`;
}
function signalsBlock(n) {
  const b = [];
  if (n.gen) b.push(`<div><span class="tag amb">generado</span> ${esc(n.gen)}. No se edita a mano; está fuera del riesgo y de los rankings.</div>`);
  if (n.aux) b.push(`<div><span class="tag">ejemplo</span> Vive en una carpeta que no es el producto (${esc(n.aux)}). Está fuera del riesgo, los rankings y las preguntas. Cámbialo con <span class="mono">aux</span> / <span class="mono">auxOff</span> en .codegraph/config.json.</div>`);
  if (n.dyn) b.push(`<div><span class="tag warn">reflexión</span> ${n.dyn.slice(0, 4).map((d) => `<span class="mono">${esc(d.what)} (l.${d.line})</span>`).join(' · ')}<div class="muted">Sus dependencias reales pueden ser más de las dibujadas.</div></div>`);
  if (n.rec) b.push(`<div><span class="tag acc">recursión</span> ${n.rec.map((r) => `<span class="mono">${r.kind === 'mutua' ? esc(r.names.join(' ⇄ ')) : esc(r.names[0]) + '()'} (l.${r.line})</span>`).join(' · ')}</div>`);
  return b.length ? `<section class="blk">${b.join('')}</section>` : '';
}
function nodeSummary(n) {
  const g = n.git, out = (S.out.get(n.id) || []).filter((e) => e.kind !== 'relation' && !e.fromTest), inn = (S.inn.get(n.id) || []).filter((e) => e.kind !== 'relation' && !e.fromTest), tests = (S.inn.get(n.id) || []).filter((e) => e.fromTest);
  const rels = [...(S.out.get(n.id) || []), ...(S.inn.get(n.id) || [])].filter((e) => e.kind === 'relation');
  const co = S.world.coChange.filter((c) => c.a === n.id || c.b === n.id), syms = symsOf(n.id), mod = n.community >= 0 ? S.world.communities[n.community] : null;
  const tcommits = g?.idx?.slice(-5).reverse().map((i) => S.world.timeline[i]).filter(Boolean) || [];
  return `
  <section class="blk"><div class="row wrap">${pillState(n)}${n.isTest ? '<span class="tag acc">prueba</span>' : ''}${n.cycle ? '<span class="tag warn">en ciclo</span>' : ''}${n.flags.includes('hotspot') ? '<span class="tag warn">hotspot</span>' : ''}${n.flags.includes('propietario-único') ? '<span class="tag amb">un solo autor</span>' : ''}${mod ? `<button class="tag acc" data-act="focus-module" data-i="${mod.id}" style="background:none;cursor:pointer" title="Ver módulo">${esc(mod.name)}</button>` : ''}</div>
    <div class="title-node">${esc(n.label)}</div><div class="mono muted">${esc(n.id)}</div>${n.summary ? `<div class="muted">${esc(n.summary)}</div>` : ''}
    <div class="row wrap"><button class="btn small primary" data-act="open-code" data-id="${esc(n.id)}">Abrir código</button><button class="btn small" data-act="focus-nb" data-id="${esc(n.id)}">Aislar vecindad</button><button class="btn small" data-act="fly" data-id="${esc(n.id)}">Ir al edificio</button></div></section>
  ${signalsBlock(n)}
  ${n.isTest ? '' : `<section class="blk"><h3>Riesgo ${n.risk.score} · ${esc(n.risk.level)}</h3>${riskBar(n)}</section>`}
  ${n.isTest ? '' : impactSection(n)}
  <div class="kv"><div><b>${n.loc || 0}</b><span>líneas</span></div><div><b>${n.fanIn}</b><span>lo usan</span></div><div><b>${n.fanOut}</b><span>importa</span></div><div><b>${Math.round((n.instability || 0) * 100)}%</b><span title="Fan-out ÷ conexiones: 0% = muy estable, 100% = muy dependiente">inestab.</span></div></div>
  ${g ? `<section class="blk"><h3>Historia en git</h3>${g.tracked ? `<div class="kv"><div><b>${g.c30}</b><span>cambios 30 d</span></div><div><b>${g.c90}</b><span>cambios 90 d</span></div><div><b>${g.commits}</b><span>commits</span></div><div><b>${g.busFactor}</b><span title="Personas que cubren ~70% de los cambios">dueños</span></div></div>
      <div class="muted">Creado ${esc(ago(Date.parse(g.first)))} · último cambio ${esc(ago(g.lastT))}${g.renamedFrom ? ` · antes: ${esc(g.renamedFrom.join(', '))}` : ''}</div>
      ${g.authors.map((a) => `<div class="row"><span class="sw" style="background:${css(authorColor(a.a))}"></span><span class="grow">${esc(S.world.authors[a.a])}</span><span class="bar" style="width:70px"><i style="width:${a.share * 100}%;background:${css(authorColor(a.a))}"></i></span><span class="mono muted" style="width:34px;text-align:right">${Math.round(a.share * 100)}%</span></div>`).join('')}
      ${dataLine(n)}${spark(n)}${tcommits.length ? `<div class="list">${tcommits.map((c) => `<button class="item" data-act="tl-go" data-i="${c.i}"><span class="top"><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.m)}</span><span class="muted mono">${esc(ago(c.t))}</span></span></button>`).join('')}</div>` : ''}`
      : `<div class="muted">Archivo nuevo, todavía sin commit.</div>`}</section>` : ''}
  ${n.isTest ? '' : `<section class="blk"><h3>Pruebas</h3><div class="row wrap"><span class="tag ${n.coverage === 'ninguna' ? 'warn' : n.coverage === 'directa' ? 'ok' : ''}">${esc(COV_META[n.coverage])}</span>${(n.testedBy || []).map((t) => `<button class="tag acc" style="background:none;cursor:pointer" data-go="${esc(t)}">${esc(t.split('/').pop())}</button>`).join('')}</div></section>`}
  ${syms.length ? `<section class="blk"><h3>Definiciones</h3><div class="list">${syms.length ? n.defs.filter((d) => d.exported || true).slice(0, 14).map((d) => { const sm = S.world.symbols.find((x) => x.id === n.id + '#' + d.name); return `<div class="item"><span class="top"><span class="tag">${esc(d.kind)}</span><button class="mono grow" style="all:unset;cursor:pointer;color:var(--ink)" data-act="open-code" data-id="${esc(n.id)}" data-line="${d.line}">${esc(d.name)}</button><span class="muted mono">:${d.line}</span>${sm ? `<button class="btn small" data-act="trace-sym" data-id="${esc(sm.id)}" title="Seguir a quién lo usa">${sm.total} usos ↗</button>` : '<span class="tag">interno</span>'}</span></div>`; }).join('') : ''}</div></section>` : ''}
  ${rels.length ? `<section class="blk"><h3>Cardinalidad entre entidades</h3><div class="list">${rels.map((e) => `<button class="item" data-go="${esc(e.source === n.id ? e.target : e.source)}"><span class="top"><span class="tag acc">${esc(stem(S.N[e.source]))} ${esc(e.card || '?')} ${esc(stem(S.N[e.target]))}</span><span class="muted grow">${esc(e.label || '')}</span>${e.origin && e.origin !== 'code' ? `<span class="tag ${e.status === 'pending' ? 'warn' : ''}">${e.origin === 'ai' ? 'IA' : 'manual'}${e.status === 'pending' ? ' · pendiente' : ''}</span>` : ''}</span></button>`).join('')}</div></section>` : ''}
  ${n.dup ? dupSection(n) : ''}
  ${co.length ? `<section class="blk"><h3>Cambia junto con</h3><div class="list">${co.map((c) => { const o = c.a === n.id ? c.b : c.a; return `<button class="item" data-go="${esc(o)}"><span class="top"><span class="mono grow">${esc(short(S.N[o]))}</span>${c.hidden ? '<span class="tag amb">sin import</span>' : ''}<span class="tag">${c.count} commits · ${Math.round(c.strength * 100)}%</span></span></button>`; }).join('')}</div></section>` : ''}
  <section class="blk"><h3>Importa (${out.length})</h3>${out.length ? `<div class="list">${out.map((e) => edgeRow(e, 'out')).join('')}</div>` : '<div class="muted">No importa archivos del proyecto.</div>'}</section>
  <section class="blk"><h3>Lo importan (${inn.length})</h3>${inn.length ? `<div class="list">${inn.map((e) => edgeRow(e, 'in')).join('')}</div>` : '<div class="muted">Nadie lo importa.</div>'}</section>
  ${tests.length ? `<section class="blk"><h3>Lo prueban (${tests.length})</h3><div class="list">${tests.map((e) => fileBtn(e.source)).join('')}</div></section>` : ''}
  <section class="blk"><h3>Nota</h3><textarea id="note" placeholder="Por qué existe, qué cambiarías…">${esc(S.extra.notes[n.id] ?? n.note ?? '')}</textarea></section>`;
}

/* ═══════════ CÓDIGO ═══════════ */
const KW_JS = 'import export from default const let var function return if else for while do switch case break continue new class extends async await try catch finally throw typeof instanceof in of this super static get set yield null undefined true false void delete'.split(' ');
const escRx = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LEXC = new Map();
/** Resaltador dirigido por datos: cada lenguaje aporta comentarios, cadenas y palabras clave. */
function lexerFor(lang) {
  if (LEXC.has(lang)) return LEXC.get(lang);
  const lx = S.world.meta.langInfo?.[lang]?.lexer || null;
  const line = lx?.line || ['//'], block = lx?.block || [['/*', '*/']], triple = lx?.triple || [], strs = lx?.strings || ["'", '"', '`'];
  const parts = [];
  for (const [a, b] of block) parts.push(`${escRx(a)}[\\s\\S]*?(?:${escRx(b)}|$)`);
  for (const t of triple) parts.push(`${escRx(t)}[\\s\\S]*?(?:${escRx(t)}|$)`);
  for (const t of line) parts.push(`${escRx(t)}[^\\n]*`);
  for (const q of strs) parts.push(q === '`' ? '`(?:\\\\[\\s\\S]|[^`\\\\])*`' : `${escRx(q)}(?:\\\\.|[^${escRx(q)}\\\\\\n])*${escRx(q)}`);
  parts.push('\\b\\d[\\d_]*(?:\\.\\d+)?\\b', '[A-Za-z_$][\\w$]*', '[\\s\\S]');
  const o = { rx: new RegExp(parts.join('|'), 'g'), kw: new Set(lx?.keywords || KW_JS), comment: [...line, ...block.map((x) => x[0]), ...triple], strs: new Set(strs), triple: new Set(triple) };
  LEXC.set(lang, o); return o;
}
function lexLines(text, defs, specs, lang) {
  const L = lexerFor(lang), LEX = L.rx, KW = L.kw;
  const lines = ['']; let li = 0; LEX.lastIndex = 0; let m;
  const put = (cls, s) => s.split('\n').forEach((p, i) => { if (i) { lines.push(''); li++; } if (p) lines[li] += cls ? `<span class="${cls}">${esc(p)}</span>` : esc(p); });
  while ((m = LEX.exec(text))) {
    const t = m[0], c = t[0];
    if (!t) { LEX.lastIndex++; continue; }
    if (L.comment.some((x) => t.startsWith(x)) && !L.strs.has(c)) put('c', t);
    else if (L.triple.size && [...L.triple].some((x) => t.startsWith(x))) put('s', t);
    else if (L.strs.has(c)) { const inner = t.slice(1, -1); if (c !== '`' && specs.has(inner)) lines[li] += `${esc(c)}<a data-go="${esc(specs.get(inner))}" title="Ir a ${esc(specs.get(inner))}">${esc(inner)}</a>${esc(c)}`; else put('s', t); }
    else if (/\d/.test(c)) put('n', t);
    else if (/[A-Za-z_$]/.test(c)) { if (KW.has(t)) put('k', t); else if (defs.has(t)) put('d', t); else if (text[LEX.lastIndex] === '(') put('f', t); else if (/[A-Z]/.test(c)) put('t', t); else put('', t); }
    else put('', t);
  }
  return lines;
}
function hlLines(text) {
  const cs = S.codeState, n = S.N[cs.id], specs = new Map();
  for (const e of S.out.get(cs.id) || []) for (const sp of e.specs || []) specs.set(sp, e.target);
  return lexLines(text, new Set((n?.defs || []).map((d) => d.name)), specs, n?.lang);
}
async function loadCode(id, line = null, reload = false) {
  if (!id) return; const cs = S.codeState;
  if (!reload && cs && cs.id === id && !cs.error && !cs.loading) { if (line) cs.line = line; renderPanel(); scrollToLine(); return; }
  if (cs?.dirty && cs.id !== id) { toast('Guarda o descarta los cambios de ' + cs.id.split('/').pop() + ' antes de abrir otro archivo'); return; }
  S.codeState = { id, loading: true, mode: reload && cs ? cs.mode : 'view', layer: cs?.layer || 'author', line };
  if (S.tab === 'code') renderPanel();
  try {
    const f = await Backend.file(id), [blame, diff] = await Promise.all([Backend.blame(id).catch(() => null), Backend.diff(id).catch(() => '')]);
    if (S.codeState?.id !== id) return;
    Object.assign(S.codeState, { loading: false, text: f.text, orig: f.text, mtimeMs: f.mtimeMs, blame, diff, dirty: false });
  } catch (e) { Object.assign(S.codeState, { loading: false, error: e.message }); }
  if (S.tab === 'code') { renderPanel(); scrollToLine(); }
}
function openCode(id, line = null) { selectNode(id, { tab: 'code', line, fly: true }); }
function gutterHtml(cs, count) {
  const b = cs.blame, tmin = b && b.t.length ? Math.min(...b.t) : 0, tmax = b && b.t.length ? Math.max(...b.t) : 1;
  return Array.from({ length: count }, (_, i) => {
    let bar = '';
    if (b && cs.layer !== 'none' && cs.mode === 'view' && b.a[i] != null) {
      const who = b.authors[b.a[i]], wi = S.world.authors.indexOf(who), col = cs.layer === 'author' ? authorColor(wi >= 0 ? wi : null) : mixc(T.muted, T.accent, (b.t[i] - tmin) / Math.max(1, tmax - tmin));
      bar = `<i style="background:${css(col)}" title="${esc(who)} · ${esc(new Date(b.t[i] * 1000).toLocaleDateString('es'))}"></i>`;
    }
    return `<div>${bar}<span>${i + 1}</span></div>`;
  }).join('');
}
function tabCode() {
  if (!S.sel) return tipBox('Selecciona un edificio y aquí verás su código con colores, quién escribió cada línea y, con el servidor local, podrás editarlo.');
  const cs = S.codeState, n = S.N[S.sel]; if (!cs || cs.id !== S.sel) return `<div class="muted">Cargando…</div>`;
  const head = `<section class="blk"><div class="row wrap"><div class="title-node grow" style="font-size:14px">${esc(n.label)}${cs.dirty ? ' <span class="tag amb" id="dirtyTag">sin guardar</span>' : ''}</div>
    ${LIVE ? `<a class="tag acc" href="vscode://file/${encodeURI(LIVE.abs + '/' + n.id)}" title="Abrir en VS Code">VS Code ↗</a>` : ''}</div>
    <div class="row wrap"><div class="seg" role="tablist" id="codeSeg">${['view:Ver', 'edit:Editar', 'diff:Cambios'].map((x) => { const [k, l] = x.split(':'); return `<button role="tab" data-act="code-mode" data-mode="${k}" aria-selected="${cs.mode === k}" ${k === 'edit' && !LIVE ? 'title="Edición disponible con node serve.mjs" disabled style="opacity:.45;cursor:default"' : ''}>${l}</button>`; }).join('')}</div>
      <select id="codeLayer" aria-label="Capa de autoría" style="width:auto"><option value="author" ${cs.layer === 'author' ? 'selected' : ''}>Autoría</option><option value="age" ${cs.layer === 'age' ? 'selected' : ''}>Antigüedad</option><option value="none" ${cs.layer === 'none' ? 'selected' : ''}>Sin capa</option></select>
      ${cs.mode === 'edit' ? `<button class="btn small primary" id="btnSave" data-act="save" ${cs.dirty ? '' : 'disabled'}>Guardar</button>` : ''}</div>
    ${cs.conflict ? `<div class="card" style="border-color:var(--warn)"><b>El archivo cambió en disco.</b><span class="muted">Alguien lo modificó mientras editabas.</span><div class="row wrap"><button class="btn small" data-act="reload-code">Recargar y descartar mis cambios</button><button class="btn small danger" data-act="force-save">Guardar de todos modos</button></div></div>` : ''}</section>`;
  if (cs.loading) return head + '<div class="muted">Cargando…</div>';
  if (cs.error) return head + `<div class="card" style="border-color:var(--warn)">${esc(cs.error)}</div>`;
  const defs = (n.defs || []).slice(0, 12).map((d) => `<button class="tag" style="background:none;cursor:pointer" data-act="goto-line" data-line="${d.line}">${esc(d.name)}</button>`).join('');
  const defsRow = defs && cs.mode !== 'diff' ? `<div class="chips2">${defs}</div>` : '';
  if (cs.mode === 'diff') {
    const d = (cs.diff || '').split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l));
    return head + (d.join('').trim() ? `<div class="codebox"><div class="diff" style="padding:8px 0;flex:1">${d.map((l) => `<div class="${l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : ''}">${esc(l) || ' '}</div>`).join('')}</div></div>` : '<div class="muted">Sin cambios respecto al último commit.</div>');
  }
  const lines = (cs.text || '').split('\n');
  if (cs.mode === 'edit') return head + defsRow + `<div class="codebox" id="codebox"><div class="gut" id="ed-gut">${gutterHtml(cs, lines.length)}</div><div class="editor" id="ed"><pre id="ed-pre" aria-hidden="true"></pre><textarea id="ed-ta" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Editor de código"></textarea></div></div><div class="muted">Ctrl+S guarda. El mundo se actualiza solo al guardar.</div>`;
  const hl = hlLines(cs.text);
  return head + defsRow + `<div class="codebox" id="codebox"><div class="gut">${gutterHtml(cs, lines.length)}</div><pre>${hl.map((h, i) => `<div data-l="${i + 1}" ${cs.line === i + 1 ? 'class="hl"' : ''}>${h || ' '}</div>`).join('')}</pre></div>`;
}
function scrollToLine() {
  const cs = S.codeState, box = $('#codebox'); if (!cs?.line || !box) return;
  box.scrollTop = Math.max(0, (cs.line - 4) * 19.2); $$('#codebox pre div.hl').forEach((d) => d.classList.remove('hl')); $(`#codebox pre div[data-l="${cs.line}"]`)?.classList.add('hl');
}
function afterCodeRender() {
  const cs = S.codeState; if (!cs || cs.loading || cs.error || cs.mode !== 'edit') { scrollToLine(); return; }
  const ta = $('#ed-ta'), pre = $('#ed-pre'), gut = $('#ed-gut'), ed = $('#ed'), box = $('#codebox'); if (!ta) return; ta.value = cs.text;
  const sync = () => {
    cs.text = ta.value; const lines = cs.text.split('\n'); pre.innerHTML = hlLines(cs.text).join('\n') + '\n';
    gut.innerHTML = lines.map((_, i) => `<div><span>${i + 1}</span></div>`).join('');
    const w = Math.max(box.clientWidth - 70, Math.max(...lines.map((l) => l.length)) * 7.25 + 40), h = lines.length * 19.2 + 16;
    for (const el of [ta, pre, ed]) { el.style.width = w + 'px'; el.style.height = h + 'px'; }
    const was = cs.dirty; cs.dirty = cs.text !== cs.orig; $('#btnSave') && ($('#btnSave').disabled = !cs.dirty);
    if (was !== cs.dirty) { const t = $('#dirtyTag'); if (cs.dirty && !t) $('.title-node')?.insertAdjacentHTML('beforeend', ' <span class="tag amb" id="dirtyTag">sin guardar</span>'); else if (!cs.dirty) t?.remove(); }
  };
  ta.addEventListener('input', sync);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); sync(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveCode(); }
  });
  sync(); if (cs.line) { box.scrollTop = Math.max(0, (cs.line - 4) * 19.2); ta.focus({ preventScroll: true }); }
}
async function saveCode(force = false) {
  const cs = S.codeState; if (!cs || !cs.dirty) return;
  try {
    const r = await Backend.save(cs.id, cs.text, force ? undefined : cs.mtimeMs); cs.mtimeMs = r.mtimeMs; cs.orig = cs.text; cs.dirty = false; cs.conflict = false; toast('Guardado');
    $('#btnSave') && ($('#btnSave').disabled = true); $('#dirtyTag')?.remove(); cs.diff = await Backend.diff(cs.id).catch(() => cs.diff);
  } catch (e) { if (e.status === 409) { cs.conflict = true; const keep = cs.text; renderPanel(); cs.text = keep; } else toast('No se pudo guardar: ' + e.message); }
}

/* ═══════════ TRAZA ═══════════ */
function traceSymbol(symId) {
  const s = S.world.symbols.find((x) => x.id === symId); if (!s) return;
  const nodes = new Set([s.file]); for (const u of s.uses) { nodes.add(u.file); u.via.forEach((v) => nodes.add(v)); }
  S.trace = { sym: s.id, name: s.name, kind: s.kind, file: s.file, line: s.line, uses: s.uses, nodes }; S.path = null; S.focusSet = null; S.tab = 'trace';
  renderFocusChip(); renderPanel(); fitView(true, [...nodes]); requestRender();
}
function findPath(a, b) {
  if (a === b) return [a]; const prev = new Map([[a, null]]), q = [a];
  for (let i = 0; i < q.length; i++) for (const y of S.adj.get(q[i]) || []) if (!prev.has(y)) { prev.set(y, q[i]); if (y === b) { const p = [b]; let c = b; while (prev.get(c)) { c = prev.get(c); p.unshift(c); } return p; } q.push(y); }
  return null;
}
function tabTrace() {
  const q = S.traceQuery || '', ql = q.toLowerCase();
  const found = q ? S.world.symbols.filter((s) => s.name.toLowerCase().includes(ql) || s.file.toLowerCase().includes(ql)).slice(0, 8) : S.world.symbols.filter((s) => s.total > 0).sort((a, b) => b.total - a.total).slice(0, 6);
  const symList = found.map((s) => `<button class="item" data-act="trace-sym" data-id="${esc(s.id)}"><span class="top"><span class="tag">${esc(s.kind)}</span><span class="mono grow">${esc(s.name)}</span><span class="muted mono">${s.total} usos</span></span><span class="muted mono" style="font-size:11px">${esc(s.file)}:${s.line}</span></button>`).join('');
  let res = '';
  if (S.trace) {
    const t = S.trace, direct = t.uses.filter((u) => !u.via.length && !u.test), via = t.uses.filter((u) => u.via.length && !u.test), tests = t.uses.filter((u) => u.test);
    const row = (u) => `<button class="item" data-act="open-use" data-id="${esc(u.file)}" data-word="${esc(u.local || t.name)}"><span class="top"><span class="mono grow">${esc(u.file)}</span><span class="tag">${esc(u.how)}</span><span class="muted mono">×${u.count}</span></span>${u.via.length ? `<span class="muted mono" style="font-size:11px">vía ${u.via.map((v) => esc(v.split('/').pop())).join(' → ')}</span>` : ''}</button>`;
    res = `<section class="blk"><div class="card"><div class="row"><span class="tag acc">${esc(t.kind)}</span><b class="mono grow">${esc(t.name)}</b><button class="btn small" data-act="trace-clear">Quitar</button></div>
      <button class="item" style="border-radius:8px;border:1px solid var(--line)" data-act="open-code" data-id="${esc(t.file)}" data-line="${t.line}"><span class="muted">Definido en</span><span class="mono">${esc(t.file)}:${t.line}</span></button>
      <div class="muted">${t.uses.filter((u) => !u.test).length ? `${plural(direct.length, 'archivo lo usa directamente', 'archivos lo usan directamente')}${via.length ? `, ${plural(via.length, 'a través de un barrel', 'a través de barrels')}` : ''}.` : 'Nadie lo usa fuera de su archivo.'}</div></div>
      ${direct.length ? `<h3>Directos</h3><div class="list">${direct.map(row).join('')}</div>` : ''}${via.length ? `<h3>A través de barrels</h3><div class="list">${via.map(row).join('')}</div>` : ''}${tests.length ? `<h3>En pruebas</h3><div class="list">${tests.map(row).join('')}</div>` : ''}</section>`;
  }
  const files = S.nodes.filter((n) => !n.isTest).map((n) => `<option value="${esc(n.id)}">${esc(n.id)}</option>`).join(''), pa = S.pathA || S.sel || '', pb = S.pathB || '';
  const pathRes = S.path ? `<div class="list">${S.path.ids.map((id, i) => { const nxt = S.path.ids[i + 1]; let arrow = ''; if (nxt) { const fwd = (S.out.get(id) || []).some((e) => e.target === nxt && e.kind !== 'relation'); arrow = `<span class="muted mono">${fwd ? 'importa a ↓' : 'lo importa ↓'}</span>`; } return `<div class="item"><button class="mono" style="all:unset;cursor:pointer" data-go="${esc(id)}">${esc(id)}</button>${arrow}</div>`; }).join('')}</div>` : S.pathMsg ? `<div class="muted">${esc(S.pathMsg)}</div>` : '';
  return `
  <section class="blk"><h3>Seguir un símbolo</h3><input id="traceQ" type="text" placeholder="Nombre de función, clase o constante…" value="${esc(q)}" autocomplete="off"><div class="list">${symList || '<div class="item muted">Sin resultados</div>'}</div></section>
  ${res}
  <section class="blk"><h3>Camino entre dos archivos</h3>
    <select id="pathA" aria-label="Desde"><option value="">Desde…</option>${files.replace(`value="${esc(pa)}"`, `value="${esc(pa)}" selected`)}</select>
    <select id="pathB" aria-label="Hasta"><option value="">Hasta…</option>${files.replace(`value="${esc(pb)}"`, `value="${esc(pb)}" selected`)}</select>
    <div class="row wrap"><button class="btn" data-act="path-find">Buscar camino</button>${S.path ? '<button class="btn" data-act="trace-clear">Quitar</button>' : ''}</div>${pathRes}</section>
  ${tipBox('<b style="color:var(--ink)">Para qué sirve</b><span>La traza muestra de dónde sale un símbolo y quién lo usa, atravesando archivos barrel. El camino explica por qué dos archivos están conectados aunque no se importen directamente.</span>')}`;
}

/* ═══════════ HALLAZGOS ═══════════ */
function tabInsights() {
  const w = S.world, h = w.health, f = S.insightFilter;
  const list = w.insights.filter((i) => f === 'todos' || i.sev === f);
  const card = (i) => `<div class="card"><div class="row" style="align-items:flex-start"><span class="sev" style="background:${sevColor(i.sev)}"></span><div class="grow"><div style="font-weight:600">${esc(i.title)}</div></div><span class="tag ${SEV[i.sev][1]}">${SEV[i.sev][0]}</span></div>
    <div class="muted">${esc(i.detail)}</div>${i.action ? `<div class="act">→ ${esc(i.action)}</div>` : ''}<div class="row wrap"><button class="btn small" data-act="insight" data-id="${esc(i.id)}">Ver en el mundo</button>${i.nodes.length === 1 ? `<button class="btn small" data-act="open-code" data-id="${esc(i.nodes[0])}">Abrir código</button>` : ''}</div></div>`;
  const maxPen = Math.max(1, ...h.parts.map((p) => p.penalty));
  return `
  <section class="blk"><div class="ring">${ring(h.score, healthColor(h.score))}<div class="grow"><div class="title-node" style="font-size:15px">Proyecto ${esc(h.grade)}</div><div class="muted">${w.insights.filter((i) => i.sev === 'alta').length} puntos de atención alta · ${w.insights.length} hallazgos en total</div></div></div>
    ${h.parts.map((p) => `<div class="row"><span class="grow">${esc(p.label)} <span class="muted mono">${p.count}</span></span><span class="bar" style="width:80px"><i style="width:${(p.penalty / maxPen) * 100}%;background:${css(T.warn)}"></i></span><span class="mono muted" style="width:28px;text-align:right">−${p.penalty}</span></div>`).join('')}</section>
  <section class="blk"><h3>Qué conviene decidir</h3>
    <div class="seg" id="insSeg" style="align-self:flex-start">${['todos', 'alta', 'media', 'info'].map((k) => `<button data-act="ins-filter" data-f="${k}" aria-selected="${f === k}">${k === 'todos' ? 'Todos' : SEV[k][0]}</button>`).join('')}</div>
    ${list.length ? list.map(card).join('') : '<div class="muted">Nada en esta categoría.</div>'}</section>
  ${S.extra.actions.length ? `<section class="blk"><h3>Sugerencias de la IA</h3>${S.extra.actions.map((a) => `<div class="card"><div class="row"><b class="grow">${esc(a.title)}</b>${a.effort ? `<span class="tag">esfuerzo ${esc(a.effort)}</span>` : ''}</div><div class="muted">${esc(a.why)}</div><div class="row wrap">${a.nodes.length ? `<button class="btn small" data-act="focus-ids" data-ids="${esc(a.nodes.join(','))}" data-label="${esc(a.title)}">Ver en el mundo</button>` : ''}<button class="btn small" data-act="drop-action" data-id="${esc(a.id)}">Descartar</button></div></div>`).join('')}</section>` : ''}
  ${dupesBlock()}
  <section class="blk"><h3>Módulos detectados</h3><div class="muted">Grupos de archivos que se hablan más entre sí que con el resto (imports y cambios conjuntos).</div><div class="list">${w.communities.map((c) => `<button class="item" data-act="focus-module" data-i="${c.id}"><span class="top"><span class="sw" style="background:${css(T.pal[c.id % 8])}"></span><span class="grow">${esc(c.name)}</span><span class="muted mono">${c.size} archivos</span></span><span class="row"><span class="bar grow"><i style="width:${c.cohesion * 100}%;background:${css(T.pal[c.id % 8])}"></i></span><span class="muted mono" style="font-size:11px">cohesión ${Math.round(c.cohesion * 100)}%</span></span></button>`).join('')}</div></section>
  ${w.coChange.length ? `<section class="blk"><h3>Cambian juntos</h3><div class="list">${w.coChange.slice(0, 8).map((c) => `<button class="item" data-act="focus-ids" data-ids="${esc(c.a + ',' + c.b)}" data-label="${esc(stem(S.N[c.a]) + ' + ' + stem(S.N[c.b]))}"><span class="top"><span class="mono grow">${esc(stem(S.N[c.a]))} + ${esc(stem(S.N[c.b]))}</span>${c.hidden ? '<span class="tag amb">sin import</span>' : ''}<span class="tag">${c.count}×</span></span></button>`).join('')}</div></section>` : ''}
  <section class="blk"><h3>Carpetas</h3><div class="list">${w.folders.map((fo) => `<button class="item" data-act="focus-folder" data-path="${esc(fo.dir)}"><span class="top"><span class="sw" style="background:${css(dirColor(fo.dir))}"></span><span class="mono grow">${esc(fo.dir)}</span>${fo.owner != null ? `<span class="sw" style="background:${css(authorColor(fo.owner))};border-radius:50%" title="${esc(w.authors[fo.owner])}"></span>` : ''}<span class="muted mono">${fo.files} · ${fo.lines} líneas</span></span><span class="row"><span class="bar grow"><i style="width:${fo.risk}%;background:${css(riskColor(fo.risk))}"></i></span><span class="muted mono" style="font-size:11px">riesgo ${fo.risk}</span></span></button>`).join('')}</div>
    ${w.coupling.length ? `<div class="muted">Dependencias entre carpetas: ${w.coupling.slice(0, 5).map((c) => `<span class="mono">${esc(c.from.split('/').pop())} → ${esc(c.to.split('/').pop())} ×${c.count}</span>`).join(' · ')}</div>` : ''}</section>`;
}

/* ═══════════ IA ═══════════ */
function buildPrompt() {
  const w = S.world, code = S.nodes.filter((n) => !n.isTest);
  const outs = new Map(); for (const e of S.edges) if (!e.fromTest) (outs.get(e.source) || outs.set(e.source, []).get(e.source)).push(`${e.kind}${typeof e.card === 'string' && e.card ? ':' + e.card : ''}→${e.target}`);
  const lines = code.map((n) => `- ${n.id} [${n.role}; ${n.state}; riesgo ${n.risk.score}; ${n.coverage === 'ninguna' ? 'sin pruebas' : 'pruebas ' + n.coverage}${n.git?.owner != null ? '; dueño ' + w.authors[n.git.owner] : ''}${n.git ? '; ' + n.git.c90 + ' cambios/90d' : ''}] exports: ${n.exports.join(', ') || '—'}${n.summary ? ' | ' + n.summary : ''}\n    sale: ${(outs.get(n.id) || []).join('; ') || '—'}`);
  return `Eres un analista de arquitectura de software. Te paso el mapa de un proyecto ("${w.meta.root}") extraído automáticamente de sus imports y de su historial de git.

Tareas:
1. Proponer relaciones que el análisis estático NO ve (relaciones de dominio entre entidades, referencias por id o texto, convenciones) con cardinalidad 1:1, 1:N, N:1 o N:M.
2. Dar notas breves sobre archivos importantes.
3. Proponer hasta 5 acciones concretas de mejora, ordenadas por retorno, con el porqué y el esfuerzo (S, M o L).

Reglas:
- Usa SOLO ids de la lista de archivos.
- No repitas aristas que ya existen en "sale".
- Responde ÚNICAMENTE con JSON válido, sin texto extra:
{"edges":[{"source":"<id>","target":"<id>","kind":"relation","card":"1:N","label":"<verbo corto>","reason":"<por qué>"}],
 "notes":{"<id>":"<nota de una línea>"},
 "actions":[{"title":"<acción>","why":"<razón con datos del mapa>","nodes":["<id>"],"effort":"S"}]}

Ciclos: ${w.cycles.map((c) => c.join(' <-> ')).join(' | ') || 'ninguno'}
Cambian juntos sin importarse: ${w.coChange.filter((c) => c.hidden).map((c) => `${c.a} + ${c.b} (${c.count} commits)`).join('; ') || 'ninguno'}
Código duplicado: ${(w.dupes?.groups || []).map((g) => `${g.name}() en ${g.files.join(' + ')} [${g.sev}, ${g.lines} líneas]`).join('; ') || 'ninguno'}
Constantes repetidas: ${(w.dupes?.constants || []).map((c) => `${c.value} ×${c.count}`).join(', ') || 'ninguna'}

Archivos:
${lines.join('\n')}
`;
}
function parseAI(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/); let t = fence ? fence[1] : text; const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No encontré un JSON en la respuesta.');
  const j = JSON.parse(t.slice(a, b + 1)); let added = 0, skipped = 0;
  const key = (e) => [e.source, e.target].sort().join('|'), have = new Set(S.edges.filter((e) => e.kind === 'relation').map(key));
  for (const e of j.edges || []) {
    if (!S.N[e.source] || !S.N[e.target] || e.source === e.target || have.has(key(e))) { skipped++; continue; }
    have.add(key(e)); added++;
    S.extra.edges.push({ id: `ai:${e.source}→${e.target}:${S.extra.edges.length}`, source: e.source, target: e.target, kind: 'relation', origin: 'ai', status: 'pending', card: ['1:1', '1:N', 'N:1', 'N:M'].includes(e.card) ? e.card : '', label: String(e.label || '').slice(0, 60), reason: String(e.reason || '').slice(0, 240), symbols: [], refs: 0, lines: [] });
  }
  for (const [id, tx] of Object.entries(j.notes || {})) if (S.N[id] && tx) { S.extra.suggestNotes.push({ id, text: String(tx).slice(0, 240) }); added++; }
  for (const x of j.actions || []) if (x.title) { S.extra.actions.push({ id: 'act' + Date.now() + S.extra.actions.length, title: String(x.title).slice(0, 120), why: String(x.why || '').slice(0, 300), nodes: (x.nodes || []).filter((id) => S.N[id]), effort: String(x.effort || '').slice(0, 2) }); added++; }
  return { added, skipped };
}
function tabAI() {
  const files = S.nodes.filter((n) => !n.isTest), opt = (sel) => files.map((n) => `<option value="${esc(n.id)}" ${n.id === sel ? 'selected' : ''}>${esc(n.id)}</option>`).join('');
  const pend = S.extra.edges.filter((e) => e.status === 'pending'), mine = S.extra.edges.filter((e) => e.status === 'accepted');
  const pendHtml = pend.map((e) => `<div class="item"><span class="top"><span class="tag acc">${esc(e.card || '?')}</span><button class="mono grow" style="all:unset;cursor:pointer" data-act="focus-ids" data-ids="${esc(e.source + ',' + e.target)}" data-label="${esc(stem(S.N[e.source]) + ' ' + (e.card || '') + ' ' + stem(S.N[e.target]))}">${esc(stem(S.N[e.source]))} → ${esc(stem(S.N[e.target]))}</button></span><span>${esc(e.label || '')}</span><span class="muted">${esc(e.reason || '')}</span><span class="row"><button class="btn small primary" data-act="accept" data-id="${esc(e.id)}">Aceptar</button><button class="btn small" data-act="reject" data-id="${esc(e.id)}">Descartar</button></span></div>`).join('')
    + S.extra.suggestNotes.map((s, i) => `<div class="item"><span class="top"><span class="tag">nota</span><span class="mono grow">${esc(s.id)}</span></span><span>${esc(s.text)}</span><span class="row"><button class="btn small primary" data-act="accept-note" data-i="${i}">Aceptar</button><button class="btn small" data-act="reject-note" data-i="${i}">Descartar</button></span></div>`).join('');
  return `
  <section class="blk"><h3>Colaborar con una IA</h3>
    <ol class="steps"><li>Copia el prompt: lleva archivos, riesgo, dueños, ciclos y acoplamiento oculto.</li><li>Pégalo en tu IA y copia su respuesta JSON.</li><li>Impórtala y acepta o descarta cada sugerencia.</li></ol>
    <div class="row wrap"><button class="btn primary" data-act="copy-prompt">Copiar prompt</button></div><textarea id="promptOut" hidden readonly></textarea>
    <textarea id="aiIn" placeholder='Pega aquí la respuesta de la IA: {"edges":[…],"notes":{…},"actions":[…]}'>${esc(S.aiDraft || '')}</textarea>
    <div class="row wrap"><button class="btn" data-act="import-ai">Importar sugerencias</button>${S.world.meta.sampleAI ? '<button class="btn" data-act="sample-ai">Usar respuesta de ejemplo</button>' : ''}<span class="muted" id="aiMsg"></span></div></section>
  ${pendHtml ? `<section class="blk"><h3>Pendientes de revisar</h3><div class="list">${pendHtml}</div>${pend.length > 1 ? '<button class="btn small" data-act="accept-all">Aceptar todas las relaciones</button>' : ''}</section>` : ''}
  <section class="blk"><h3>Agregar relación a mano</h3>
    <select id="mSrc" aria-label="Origen">${opt(S.sel)}</select>
    <div class="row"><select id="mCard" aria-label="Cardinalidad" style="width:90px">${['1:1', '1:N', 'N:1', 'N:M'].map((c) => `<option>${c}</option>`).join('')}</select><select id="mDst" aria-label="Destino">${opt(files.find((n) => n.id !== S.sel)?.id)}</select></div>
    <input type="text" id="mLabel" placeholder="Etiqueta (p. ej. realiza, contiene)"><button class="btn" data-act="add-rel">Agregar relación</button></section>
  <section class="blk"><h3>Guardar lo acordado</h3><div class="muted">${mine.length} relación(es) y ${Object.keys(S.extra.notes).length} nota(s) en este navegador.${LIVE ? ' Con «Guardar en el proyecto» pasan a <span class="mono">.codegraph/overrides.json</span> y todos las verán.' : ' Para fijarlas en graph.json: copia el JSON y ejecuta <span class="mono">node analyze.mjs src --overrides overrides.json</span>.'}</div>
    <div class="row wrap">${LIVE ? '<button class="btn primary" data-act="save-project">Guardar en el proyecto</button>' : ''}<button class="btn" data-act="export">Copiar overrides.json</button><button class="btn danger" data-act="clear-extra">Borrar todo</button></div><textarea id="exportOut" hidden readonly></textarea></section>`;
}
const overridesOut = () => ({ edges: S.extra.edges.filter((e) => e.status === 'accepted').map(({ id, source, target, kind, origin, card, label }) => ({ id, source, target, kind, origin, card, label })), notes: S.extra.notes });

/* ═══════════ eventos del inspector ═══════════ */
async function onPanelClick(e) {
  const go = e.target.closest('[data-go]'); if (go) { e.preventDefault(); selectNode(go.dataset.go, { fly: true, line: go.dataset.line ? +go.dataset.line : null }); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; const d = b.dataset;
  switch (d.act) {
    case 'tab': S.tab = d.tab; renderPanel(); break;
    case 'open-code': openCode(d.id, d.line ? +d.line : null); break;
    case 'fly': flyToNode(d.id); break;
    case 'focus-nb': focusNeighborhood(d.id); break;
    case 'focus-module': { const c = S.world.communities[+d.i]; setFocus(c.files, c.name); break; }
    case 'focus-folder': focusFolder(d.path); break;
    case 'focus-ids': setFocus(d.ids.split(',').filter((id) => S.N[id]), d.label); break;
    case 'insight': { const i = S.world.insights.find((x) => x.id === d.id); if (i) { setFocus(i.nodes, i.title); if (i.nodes.length === 1) S.sel = i.nodes[0]; renderCrumbs(); } break; }
    case 'dup-open': S.dupOpen = S.dupOpen === d.id ? null : d.id; S.dupCmp = null; renderPanel(); requestRender(); if (S.dupOpen) loadDupCompare(d.id); break;
    case 'dup-pair': S.dupPair = d.id + ':' + d.i; loadDupCompare(d.id); break;
    case 'ins-filter': S.insightFilter = d.f; renderPanel(); break;
    case 'tl-go': if (S.world.timeline.length) { setTimeline(+d.i); } break;
    case 'trace-sym': traceSymbol(d.id); break;
    case 'trace-clear': S.trace = null; S.path = null; S.pathMsg = ''; renderFocusChip(); renderPanel(); requestRender(); break;
    case 'open-use': { selectNode(d.id, { tab: 'code', fly: true }); const f = S.codeState; await loadCode(d.id); const cs = S.codeState; if (cs?.text) { const rx = new RegExp(`\\b${d.word.replace(/[$]/g, '\\$')}\\b`); const ls = cs.text.split('\n'); const ix = ls.findIndex((l) => rx.test(l) && !/^\s*(import|export)\b.*from/.test(l)); if (ix >= 0) { cs.line = ix + 1; renderPanel(); scrollToLine(); } } break; }
    case 'path-find': {
      const a = $('#pathA').value, bb = $('#pathB').value; S.pathA = a; S.pathB = bb; if (!a || !bb) { S.pathMsg = 'Elige los dos archivos.'; renderPanel(); break; }
      const p = findPath(a, bb); if (p) { S.path = { ids: p }; S.trace = null; S.focusSet = null; S.pathMsg = ''; renderFocusChip(); renderPanel(); fitView(true, p); } else { S.path = null; S.pathMsg = 'No hay camino entre esos dos archivos.'; renderPanel(); } requestRender(); break;
    }
    case 'code-mode': { const cs = S.codeState; if (!cs) break; if (d.mode === 'edit' && !LIVE) break; cs.mode = d.mode; renderPanel(); break; }
    case 'goto-line': { const cs = S.codeState; cs.line = +d.line; if (cs.mode === 'edit') { $('#codebox').scrollTop = (cs.line - 4) * 19.2; } else { scrollToLine(); } break; }
    case 'save': saveCode(); break;
    case 'force-save': saveCode(true); break;
    case 'reload-code': { const id = S.codeState.id; S.codeState.dirty = false; S.codeState.conflict = false; await loadCode(id, null, true); break; }
    case 'copy-prompt': { const ta = $('#promptOut'); await copyText(buildPrompt(), ta); break; }
    case 'sample-ai': S.aiDraft = JSON.stringify(S.world.meta.sampleAI, null, 2); renderPanel(); break;
    case 'import-ai': {
      S.aiDraft = $('#aiIn').value;
      try { const r = parseAI(S.aiDraft); S.aiDraft = ''; saveExtra(); rebuildEdges(); renderPanel(); requestRender(); $('#aiMsg').textContent = `${r.added} sugerencia(s) nuevas, ${r.skipped} omitidas`; }
      catch (err) { $('#aiMsg').textContent = 'No pude leer el JSON: ' + err.message; }
      break;
    }
    case 'accept': { const x = S.extra.edges.find((y) => y.id === d.id); if (x) { x.status = 'accepted'; saveExtra(); rebuildEdges(); renderPanel(); requestRender(); } break; }
    case 'accept-all': S.extra.edges.forEach((x) => { if (x.status === 'pending') x.status = 'accepted'; }); saveExtra(); rebuildEdges(); renderPanel(); requestRender(); break;
    case 'reject': { const i = S.extra.edges.findIndex((y) => y.id === d.id); if (i >= 0) { S.extra.edges.splice(i, 1); saveExtra(); rebuildEdges(); renderPanel(); requestRender(); } break; }
    case 'accept-note': { const s = S.extra.suggestNotes.splice(+d.i, 1)[0]; S.extra.notes[s.id] = s.text; S.N[s.id].note = s.text; saveExtra(); renderPanel(); break; }
    case 'reject-note': S.extra.suggestNotes.splice(+d.i, 1); saveExtra(); renderPanel(); break;
    case 'drop-action': S.extra.actions = S.extra.actions.filter((x) => x.id !== d.id); saveExtra(); renderPanel(); break;
    case 'add-rel': {
      const s = $('#mSrc').value, t = $('#mDst').value; if (s === t) { toast('Elige dos archivos distintos'); break; }
      S.extra.edges.push({ id: `m:${s}→${t}:${S.extra.edges.length}`, source: s, target: t, kind: 'relation', origin: 'manual', status: 'accepted', card: $('#mCard').value, label: $('#mLabel').value.trim(), symbols: [], refs: 0, lines: [] });
      saveExtra(); rebuildEdges(); renderPanel(); requestRender(); toast('Relación agregada'); break;
    }
    case 'export': await copyText(JSON.stringify(overridesOut(), null, 2), $('#exportOut')); break;
    case 'save-project': try { await Backend.saveOverrides(overridesOut()); S.extra.edges = S.extra.edges.filter((x) => x.status === 'pending'); S.extra.notes = {}; saveExtra(); toast('Guardado en .codegraph/overrides.json'); } catch (err) { toast('No se pudo guardar: ' + err.message); } break;
    case 'clear-extra': S.extra = { edges: [], notes: {}, suggestNotes: [], actions: [] }; for (const n of S.nodes) delete n.note; saveExtra(); rebuildEdges(); renderPanel(); requestRender(); break;
  }
}
function onPanelInput(e) {
  const t = e.target;
  if (t.id === 'note' && S.sel) { S.extra.notes[S.sel] = t.value; S.N[S.sel].note = t.value; saveExtra(); }
  else if (t.id === 'aiIn') S.aiDraft = t.value;
  else if (t.id === 'traceQ') { S.traceQuery = t.value; const pos = t.selectionStart; renderPanel(); const q = $('#traceQ'); q.focus(); q.setSelectionRange(pos, pos); }
}
function onPanelChange(e) {
  const t = e.target;
  if (t.id === 'codeLayer' && S.codeState) { S.codeState.layer = t.value; renderPanel(); }
  else if (t.id === 'pathA') S.pathA = t.value; else if (t.id === 'pathB') S.pathB = t.value;
}
function onPanelKey() {}


/* ═══════════ DUPLICACIÓN (DRY) ═══════════ */
const SEV_DUP = { costosa: ['Se paga', 'warn'], latente: ['Latente', ''], inofensiva: ['Inofensiva', 'ok'] };
function dupGroupCard(g, withFiles = true) {
  const open = S.dupOpen === g.id, who = g.owners.map((o) => S.world.authors[o]).filter(Boolean);
  return `<div class="card"><div class="row" style="align-items:flex-start"><div class="grow"><div style="font-weight:600">${esc(g.name)}() × ${g.copies}</div>
    <div class="muted">${esc(g.type)}${g.type === 'similar' ? ' · ' + Math.round(g.sim * 100) + '% parecidas' : ''} · ~${g.lines} líneas${g.coCount ? ` · cambiaron juntas en ${g.coCount} commits` : ''}${who.length > 1 ? ' · ' + esc(who.join(' y ')) : ''}</div></div>
    <span class="tag ${SEV_DUP[g.sev][1]}" title="Costo ${g.score}/100">${SEV_DUP[g.sev][0]} · ${g.score}</span></div>
    ${withFiles ? `<div class="list">${g.units.map((u) => `<button class="item" data-act="open-code" data-id="${esc(u.file)}" data-line="${u.start}"><span class="top"><span class="mono grow">${esc(short(S.N[u.file]))}:${u.start}</span><span class="tag">${u.loc} líneas</span></span></button>`).join('')}</div>` : ''}
    ${g.suggest ? `<div class="act">→ ${esc(g.suggest.text)}${g.suggest.warn?.length ? ' <b>Ojo:</b> ' + esc(g.suggest.warn.join('; ')) : ''}</div>` : ''}
    <div class="row wrap"><button class="btn small" data-act="dup-open" data-id="${g.id}">${open ? 'Ocultar comparación' : 'Comparar copias'}</button><button class="btn small" data-act="focus-ids" data-ids="${esc(g.files.join(','))}" data-label="${esc(g.name + '() duplicada')}">Ver en el mundo</button></div>
    ${open ? `<div id="dupCmp-${g.id}">${dupCompareHtml(g)}</div>` : ''}</div>`;
}
function dupSection(n) {
  const gs = (S.world.dupes?.groups || []).filter((g) => n.dup.groups.includes(g.id));
  return `<section class="blk"><h3>Código duplicado · ${Math.round(n.dup.pct * 100)}% del archivo</h3>${gs.map((g) => dupGroupCard(g, false)).join('')}</section>`;
}
function dupesBlock() {
  const d = S.world.dupes; if (!d) return '';
  const cs = d.constants;
  return `<section class="blk"><h3>Duplicación (DRY)</h3><div class="muted">${d.groups.length} grupo${d.groups.length === 1 ? '' : 's'} de copias · ${cs.length} constante${cs.length === 1 ? '' : 's'} repetida${cs.length === 1 ? '' : 's'} · ${d.stats.units} funciones analizadas. «Se paga» = las copias cambian juntas; «latente» = parecidas pero hoy se editan por separado.</div>
    ${d.groups.length ? d.groups.map((g) => dupGroupCard(g)).join('') : '<div class="muted">No se encontraron funciones duplicadas.</div>'}
    ${cs.length ? `<div class="list">${cs.map((c) => `<button class="item" data-act="focus-ids" data-ids="${esc([...new Set(c.at.map((a) => a.file))].join(','))}" data-label="${esc(String(c.value))} repetido"><span class="top"><span class="mono grow">${esc(c.kind === 'num' ? c.value : '"' + c.value + '"')}</span><span class="tag ${c.sev === 'media' ? 'warn' : ''}">×${c.count} en ${c.files} archivos</span></span>${c.existing ? `<span class="muted">Ya existe ${esc(c.existing.name)} en ${esc(c.existing.file.split('/').pop())}</span>` : ''}</button>`).join('')}</div>` : ''}</section>`;
}
function dupCompareHtml(g) {
  const st = S.dupCmp && S.dupCmp.id === g.id ? S.dupCmp : null;
  if (!st) return '<div class="muted">Cargando…</div>';
  const [ia, ib] = (S.dupPair && S.dupPair.startsWith(g.id + ':') ? S.dupPair.split(':')[1].split(',').map(Number) : [0, 1]);
  const A = st.src[ia], B = st.src[ib]; if (!A || !B) return '<div class="muted">No se pudo leer el código de las copias.</div>';
  const norm = (l) => l.replace(/\s+/g, ' ').trim(), setB = new Set(B.lines.map(norm)), setA = new Set(A.lines.map(norm));
  const col = (X, other, u) => `<div class="cmpcol"><div class="mono muted" style="margin-bottom:4px">${esc(short(S.N[u.file]))}:${u.start}</div>${X.lines.map((l, i) => `<div class="cmpl${other.has(norm(l)) ? '' : ' diff'}"><span class="ln">${u.start + i}</span>${esc(l) || ' '}</div>`).join('')}</div>`;
  const pairs = g.units.length > 2 ? `<div class="row wrap">${g.units.map((u, i) => i).flatMap((i) => g.units.map((u, j) => j > i ? `<button class="btn small" data-act="dup-pair" data-id="${g.id}" data-i="${i},${j}">${i + 1} ↔ ${j + 1}</button>` : '')).join('')}</div>` : '';
  return `${pairs}<div class="cmp">${col(A, setB, g.units[ia])}${col(B, setA, g.units[ib])}</div><div class="muted">Las líneas marcadas son las que solo existen en una de las copias.</div>`;
}
async function loadDupCompare(id) {
  const g = S.world.dupes.groups.find((x) => x.id === id); if (!g) return;
  const src = [];
  for (const u of g.units) { try { const f = await Backend.file(u.file); src.push({ lines: f.text.split('\n').slice(u.start - 1, u.end) }); } catch { src.push(null); } }
  S.dupCmp = { id, src }; const box = document.getElementById('dupCmp-' + id); if (box) box.innerHTML = dupCompareHtml(g);
}


/* ═══════════ DATOS: impacto, percentiles, tendencia ═══════════ */
function impactSection(n) {
  const im = n.impact; if (!im) return '';
  if (!im.total) return `<section class="blk"><h3>Si cambias este archivo</h3><div class="muted">Ningún otro archivo del proyecto depende de él, ni directa ni indirectamente.</div></section>`;
  const mx = Math.max(...im.levels, 1);
  return `<section class="blk"><h3>Si cambias este archivo</h3>
    <div>Puede afectar a <b>${im.total}</b> archivo${im.total === 1 ? '' : 's'}: ${im.direct} directo${im.direct === 1 ? '' : 's'}${im.total > im.direct ? ` y ${im.total - im.direct} indirecto${im.total - im.direct === 1 ? '' : 's'}` : ''}, hasta ${im.depth} salto${im.depth === 1 ? '' : 's'}.</div>
    <div>${im.levels.map((c, i) => `<div class="row"><span class="muted" style="width:62px">${i === 0 ? 'directos' : 'a ' + (i + 1) + ' saltos'}</span><span class="bar grow"><i style="width:${(c / mx) * 100}%;background:${css(T.warn, 1 - i * 0.25)}"></i></span><span class="mono muted" style="width:26px;text-align:right">${c}</span></div>`).join('')}</div>
    <div class="row wrap"><button class="btn small" data-act="focus-ids" data-ids="${esc([n.id, ...im.ids].join(','))}" data-label="${esc('Impacto de ' + stem(n))}">Ver en el mundo</button></div></section>`;
}
function dataLine(n) {
  const g = n.git; if (!g || !g.tracked || n.isTest) return '';
  const arrow = { subiendo: '↗ cambia cada vez más', bajando: '↘ cambia cada vez menos', estable: '→ ritmo estable' }[g.trend];
  const fx = g.fixes ? `${g.fixes} de ${g.commits} commits son correcciones (${Math.round(g.fixRate.lo * 100)}–${Math.round(g.fixRate.hi * 100)}%)` : 'sin commits de corrección';
  return `<div class="muted" title="Percentil dentro de este proyecto. Con pocos commits los datos son poco fiables.">Cambios: percentil ${n.pct.churn} · tamaño: percentil ${n.pct.loc} · ${arrow} · ${fx} · confianza ${esc(g.confidence)}${n.outlier?.length ? ' · <b style="color:var(--warn)">atípico en ' + esc(n.outlier.join(', ')) + '</b>' : ''}</div>`;
}
