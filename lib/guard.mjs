// code-graph · lib/guard.mjs — guardarraíles para quien edita (persona o agente de IA):
//   plan(world, files)     → qué hay que saber ANTES de tocar esos archivos
//   fingerprint(world)     → foto compacta (serializable) del estado estructural
//   check(prevFp, world)   → qué empeoró (o mejoró) DESPUÉS de editar
// Puro y determinista: no usa modelos. Cada aviso trae su evidencia.

const stem = (n) => (n.label || n.id).replace(/\.[^.]+$/, '');
const uniq = (a) => [...new Set(a)];
const cycSig = (c) => [...c].sort().join('|');

/** ───────────── antes de editar ───────────── */
export function plan(w, files) {
  const byId = new Map(w.nodes.map((n) => [n.id, n])), warnings = [], per = [], tests = new Map(), rippled = new Map();
  const dupBy = new Map(); for (const g of w.dupes?.groups || []) for (const u of g.units) (dupBy.get(u.file) || dupBy.set(u.file, []).get(u.file)).push(g);
  const bridges = w.edges.filter((e) => e.kind === 'bridge');
  for (const id of files) {
    const n = byId.get(id);
    if (!n || n.kind !== 'file') { per.push({ id, known: false }); warnings.push(`${id}: no está en el análisis (archivo nuevo o ruta distinta): no hay datos previos.`); continue; }
    const imp = n.impact, deps = (imp?.ids || []).map((i) => byId.get(i)).filter(Boolean);
    deps.forEach((d, i) => { if (!files.includes(d.id) && !d.isTest) rippled.set(d.id, Math.min(rippled.get(d.id) ?? 2, i < (imp.direct || 0) ? 1 : 2)); });
    for (const t of n.testedBy || []) tests.set(t, 'prueba directa de ' + stem(n));
    deps.forEach((d, i) => { for (const t of d.testedBy || []) if (!tests.has(t)) tests.set(t, 'prueba de ' + stem(d) + (i < (imp?.direct || 0) ? ', que depende de ' : ', afectado indirectamente por ') + stem(n)); });
    for (const t of deps.filter((d) => d.isTest)) if (!tests.has(t.id)) tests.set(t.id, 'prueba afectada por el cambio');
    const together = (w.coChange || []).filter((c) => c.a === id || c.b === id).map((c) => ({ id: c.a === id ? c.b : c.a, count: c.count, strength: c.strength, linked: !c.hidden })).filter((c) => !files.includes(c.id)).slice(0, 5);
    const dups = (dupBy.get(id) || []).map((g) => ({ name: g.name, copies: g.units.length, files: uniq(g.units.map((u) => u.file)).filter((f) => f !== id), type: g.type }));
    const br = bridges.filter((e) => e.source === id || e.target === id).map((e) => ({ other: e.source === id ? e.target : e.source, via: (e.specs || []).slice(0, 2).join(', '), dir: e.source === id ? 'llama a' : 'la llaman desde' }));
    const cyc = (w.cycles || []).find((c) => c.includes(id));
    per.push({ id, known: true, role: n.role, risk: n.risk?.score ?? 0, level: n.risk?.level, state: n.state, flags: n.flags || [], loc: n.loc, impact: imp ? { total: imp.total, direct: imp.direct, depth: imp.depth, capped: !!imp.capped } : null, dependents: deps.filter((d) => !d.isTest).slice(0, 8).map((d) => d.id), together, dups, bridges: br, cycle: cyc || null, owner: n.git?.owner != null ? w.authors[n.git.owner] : null, ownerShare: n.git?.ownerShare });
    if (n.gen) warnings.push(`${id} es código GENERADO (${n.gen}): no lo edites a mano; cambia el generador o su plantilla.`);
    if (n.aux) warnings.push(`${id} vive en una carpeta de ejemplos/herramientas (${n.aux}), fuera del producto.`);
    if (n.dyn) warnings.push(`${id} usa reflexión o carga dinámica (${uniq(n.dyn.map((x) => x.what)).join(', ')}): hay dependientes que el grafo no ve; el impacto real puede ser mayor.`);
    if (cyc) warnings.push(`${id} está en un ciclo con ${cyc.filter((x) => x !== id).slice(0, 3).join(', ')}: un cambio de interfaz puede propagarse en círculo.`);
    if (imp?.capped) warnings.push(`${id}: el cálculo de impacto se cortó por tamaño; el alcance real es mayor.`);
    if (!n.isTest && n.coverage === 'ninguna' && n.fanIn >= 1) warnings.push(`${id} no tiene pruebas y lo usan ${n.fanIn} archivos: añade una antes de cambiarlo.`);
    for (const c of together) if (!c.linked) warnings.push(`${id} suele cambiar junto con ${c.id} (${c.count} commits) aunque no se importan: revisa si también hay que tocar ese.`);
    for (const d of dups) warnings.push(`${id} contiene ${d.name}(), copiada en ${d.files.join(', ') || 'otro lugar del mismo archivo'}: si lo cambias, cambia las copias.`);
    for (const b of br) warnings.push(`${id} ${b.dir} ${b.other} por HTTP (${b.via}): el contrato no lo comprueba ningún compilador.`);
  }
  const limits = []; const dynFiles = w.nodes.filter((n) => n.dyn && !n.isTest).length, dyn = w.edges.filter((e) => e.kind === 'dynamic').length;
  if (dyn) limits.push(`${dyn} imports dinámicos que el grafo no sigue`); if (dynFiles) limits.push(`${dynFiles} archivos con reflexión`);
  const data = { files: per, ripple: [...rippled].map(([id, d]) => ({ id, direct: d === 1 })), tests: [...tests].map(([id, why]) => ({ id, why })), warnings, limits };
  return { data, text: planText(data) };
}
function planText(d) {
  const o = ['PLAN DE CAMBIO'];
  for (const f of d.files) {
    if (!f.known) continue;
    o.push(`\n▸ ${f.id} — ${f.role}, riesgo ${f.risk} (${f.level}), estado ${f.state}${f.owner ? `, lo conoce sobre todo ${f.owner}` : ''}`);
    if (f.impact) o.push(`  impacto: ${f.impact.capped ? 'al menos ' : ''}${f.impact.total} archivos (${f.impact.direct} directos, profundidad ${f.impact.depth})${f.dependents.length ? '; entre ellos ' + f.dependents.slice(0, 5).join(', ') : ''}`);
  }
  if (d.tests.length) { o.push('\nPRUEBAS A CORRER'); for (const t of d.tests.slice(0, 12)) o.push(`  • ${t.id} — ${t.why}`); } else o.push('\nPRUEBAS A CORRER\n  (ninguna conocida: nada prueba estos archivos ni a sus dependientes directos)');
  if (d.warnings.length) { o.push('\nAVISOS'); for (const x of d.warnings.slice(0, 14)) o.push('  ! ' + x); }
  if (d.limits.length) o.push('\nLÍMITES: ' + d.limits.join('; ') + '. El grafo es estático: lo que se carga por nombre en ejecución no aparece.');
  o.push('\nCuando termines, llama a check_change para ver qué empeoró.');
  return o.join('\n');
}

/** ───────────── foto y comparación ───────────── */
export function fingerprint(w) {
  const f = {};
  for (const n of w.nodes) if (n.kind === 'file') f[n.id] = [n.risk?.score ?? 0, n.fanIn || 0, n.coverage || '', (n.flags || []).join(','), n.loc || 0, n.isTest ? 1 : 0, n.gen ? 1 : 0, n.aux ? 1 : 0];
  return { t: Date.now(), health: w.health?.score ?? null, f, cycles: (w.cycles || []).map(cycSig),
    dups: (w.dupes?.groups || []).filter((g) => !g.test).map((g) => `${g.name}|${uniq(g.units.map((u) => u.file)).sort().join(',')}`),
    bridges: w.edges.filter((e) => e.kind === 'bridge').map((e) => `${e.source}→${e.target}`) };
}
export function check(prev, w) {
  const cur = fingerprint(w), P = prev.f, C = cur.f, R = []; // R: { sev: 'revisar'|'nota', text, id? }
  const added = Object.keys(C).filter((id) => !P[id]), removed = Object.keys(P).filter((id) => !C[id]);
  for (const c of w.cycles || []) if (!prev.cycles.includes(cycSig(c))) R.push({ sev: 'revisar', id: c[0], text: `Ciclo nuevo entre ${c.slice(0, 4).join(', ')}${c.length > 4 ? '…' : ''}.` });
  for (const [id, v] of Object.entries(C)) {
    const p = P[id]; if (!p || v[5] || v[6] || v[7]) continue;
    if (v[0] - p[0] >= 8 || (v[0] >= 55 && p[0] < 55)) R.push({ sev: v[0] >= 55 ? 'revisar' : 'nota', id, text: `${id}: el riesgo sube de ${p[0]} a ${v[0]}.` });
    if (v[1] - p[1] >= 3) R.push({ sev: 'nota', id, text: `${id}: ahora lo usan ${v[1]} archivos (antes ${p[1]}); se está volviendo un punto central.` });
    if (v[6] && v[4] !== p[4]) R.push({ sev: 'revisar', id, text: `${id} es código generado y cambió de tamaño: la próxima generación lo sobrescribirá.` });
    if (v[3].includes('reflexión') && !p[3].includes('reflexión')) R.push({ sev: 'nota', id, text: `${id}: ahora usa reflexión o carga dinámica (el grafo ya no ve todo lo que depende de él).` });
  }
  for (const id of added) { const v = C[id]; if (v[5] || v[6] || v[7]) continue; if (v[2] === 'ninguna' && v[4] >= 8) R.push({ sev: 'revisar', id, text: `${id} es nuevo (${v[4]} líneas) y no tiene pruebas.` }); else R.push({ sev: 'nota', id, text: `${id} es nuevo.` }); }
  for (const id of removed) if (P[id][1] > 0 && !P[id][5]) R.push({ sev: 'revisar', id, text: `${id} se borró y lo usaban ${P[id][1]} archivos: comprueba que ya no se referencie.` });
  for (const d of cur.dups) if (!prev.dups.includes(d)) { const [name, files] = d.split('|'); if (files.split(',').some((f) => added.includes(f) || (C[f] && P[f] && C[f][4] !== P[f][4]))) R.push({ sev: 'revisar', text: `Duplicación nueva: ${name}() aparece en ${files.split(',').join(', ')}.` }); }
  for (const b of cur.bridges) if (!prev.bridges.includes(b)) R.push({ sev: 'nota', text: `Puente HTTP nuevo: ${b}.` });
  const resolved = prev.cycles.filter((c) => !cur.cycles.includes(c)).length + prev.dups.filter((d) => !cur.dups.includes(d)).length;
  const hd = prev.health != null && cur.health != null ? cur.health - prev.health : null;
  if (hd != null && hd <= -3) R.push({ sev: 'revisar', text: `La salud del proyecto baja ${-hd} puntos (${prev.health} → ${cur.health}).` });
  const verdict = R.some((r) => r.sev === 'revisar') ? 'revisar' : 'ok';
  const data = { verdict, issues: R, added, removed, healthDelta: hd, resolved };
  const o = [`REVISIÓN DEL CAMBIO: ${verdict === 'ok' ? 'sin empeoramientos detectados' : 'conviene revisar ' + R.filter((r) => r.sev === 'revisar').length + ' cosa(s)'}`];
  for (const r of R.filter((x) => x.sev === 'revisar')) o.push('  ✘ ' + r.text);
  for (const r of R.filter((x) => x.sev === 'nota').slice(0, 10)) o.push('  · ' + r.text);
  if (resolved) o.push(`  ✔ ${resolved} problema(s) que existían ya no están.`);
  if (hd != null) o.push(`  salud ${prev.health} → ${cur.health} (${hd >= 0 ? '+' : ''}${hd})`);
  o.push('Límite: compara la estructura (imports, ciclos, duplicación, pruebas); no ejecuta el código ni sustituye a las pruebas.');
  return { data, text: o.join('\n') };
}
