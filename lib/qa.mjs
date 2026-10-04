// code-graph · lib/qa.mjs — motor de preguntas: responde con los datos recogidos, dice cuánta confianza
// tiene y cómo cuestionar la respuesta. Puro (sin DOM ni Node): lo usan el visor y la CLI (ask.mjs).
// Una respuesta = { id, title, headline, rows:[{id?, text, tag?}], conf:{level, why}, challenge:[…], follow:[idPregunta] }

const pct = (x) => Math.round(x * 100) + '%';
const plural = (n, a, b) => (n === 1 ? a : b);
const stem = (n) => (n.label || n.id).replace(/\.[^.]+$/, '');
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function ctx(w) {
  const files = w.nodes.filter((n) => n.kind === 'file' && !n.isTest && !n.gen && !n.aux), all = w.nodes.filter((n) => n.kind === 'file');
  const commits = w.meta?.git?.available ? w.meta.git.commits : 0;
  const dyn = w.edges.filter((e) => e.kind === 'dynamic').length;
  const dynFiles = w.nodes.filter((n) => n.dyn && !n.isTest).length, bridges = w.edges.filter((e) => e.kind === 'bridge').length;
  const langs = Object.keys(w.meta?.languages || {});
  const reflective = langs.some((l) => ['csharp', 'java', 'kotlin', 'python', 'php'].includes(l));
  return { w, files, all, commits, dyn, dynFiles, bridges, reflective, byId: new Map(w.nodes.map((n) => [n.id, n])), authors: w.authors || [] };
}
const grade = (n, minHigh, minMid) => (n >= minHigh ? 'alta' : n >= minMid ? 'media' : 'baja');
/** confianza de una respuesta basada en historial git */
function histConf(c, n, what) {
  if (!c.commits) return { level: 'baja', why: 'No hay historial git: no se pueden medir cambios ni autores.' };
  const level = grade(Math.min(n, c.commits), 12, 5);
  return { level, why: `${what}: ${n} ${plural(n, 'evidencia', 'evidencias')} sobre ${c.commits} commits.` };
}
/** confianza de una respuesta basada solo en el grafo de imports */
function graphConf(c, what) {
  const limits = [];
  if (c.dyn) limits.push(`${c.dyn} imports dinámicos que el grafo no sigue`);
  if (c.dynFiles) limits.push(`${c.dynFiles} ${plural(c.dynFiles, 'archivo usa', 'archivos usan')} reflexión o carga dinámica`);
  if (c.reflective) limits.push('lenguajes con reflexión/inyección (los enlaces por tipo son aproximados)');
  return { level: limits.length ? 'media' : 'alta', why: `${what}. ${limits.length ? 'Límites: ' + limits.join('; ') + '.' : 'Grafo estático completo para este proyecto.'}` };
}
const row = (n, text, tag) => ({ id: n.id, text, tag });
const noData = (title, msg) => ({ id: 'none', title, headline: msg, rows: [], conf: { level: 'baja', why: 'Sin datos suficientes.' }, challenge: [], follow: ['risk', 'hidden', 'dead'] });

// ───────────── catálogo de preguntas ─────────────
export const QUESTIONS = [
  { id: 'risk', title: '¿Qué es lo más riesgoso de tocar?', rx: /riesg|peligros|fragil|delicad|risk|cuidado/, run(c) {
    const top = c.files.filter((n) => n.risk).sort((a, b) => b.risk.score - a.risk.score).slice(0, 5);
    if (!top.length) return noData(this.title, 'No hay métricas de riesgo.');
    const [t] = top, parts = Object.entries(t.risk.parts).map(([k, v]) => [k, v * (t.risk.weights?.[k] || 0)]).sort((a, b) => b[1] - a[1]);
    const total = parts.reduce((s, p) => s + p[1], 0) || 1, LAB = { fanIn: 'muchos dependen de él', churn: 'cambia seguido', cycle: 'está en un ciclo', untested: 'poca cobertura', owner: 'lo conoce una sola persona', size: 'tamaño', dup: 'código duplicado' };
    const dom = parts[0];
    return { id: this.id, title: this.title, headline: `${stem(t)} (riesgo ${t.risk.score}/100). Principal motivo: ${LAB[dom[0]]} (${pct(dom[1] / total)} del puntaje).`,
      rows: top.map((n) => row(n, `riesgo ${n.risk.score} · ${n.fanIn} dependientes · ${n.git?.c90 ?? 0} cambios/90 d${n.tested ? '' : ' · sin pruebas'}`, n.risk.level)),
      conf: ['churn', 'owner'].includes(dom[0]) ? histConf(c, t.git?.commits || 0, 'El motivo principal sale del historial') : graphConf(c, 'El motivo principal es estructural (se mide en el grafo, no depende de cuántos commits tenga)'),
      challenge: [`El puntaje es una suma ponderada de ${Object.keys(t.risk.parts).length} señales, no una medición directa de fallos: ${stem(t)} puede ser estable aunque puntúe alto.`,
        top[1] ? `La diferencia entre #1 y #2 es de ${t.risk.score - top[1].risk.score} puntos; si es pequeña, el orden es poco fiable.` : '',
        'Que cambie seguido puede ser sana evolución, no fragilidad: revisa si esos cambios son correcciones (fix) o mejoras.'].filter(Boolean), follow: ['impact', 'tests', 'owner'] };
  } },
  { id: 'impact', title: '¿Qué se rompe si cambio…?', needsFile: true, rx: /rompe|romper|afecta|afectar|impact|depend|cambio en|tocar|borro|cambiar/, run(c, f) {
    const list = f ? [f] : c.files.filter((n) => n.impact).sort((a, b) => b.impact.total - a.impact.total).slice(0, 5);
    if (!list.length || !list[0].impact) return noData(this.title, 'No hay radio de impacto calculado.');
    const t = list[0], ids = (t.impact.ids || []).map((i) => c.byId.get(i)).filter(Boolean);
    const direct = ids.slice(0, t.impact.direct), tests = (t.testedBy || []).length;
    return { id: this.id, title: f ? `¿Qué se rompe si cambio ${stem(f)}?` : this.title,
      headline: f ? `${stem(t)} afecta a ${t.impact.capped ? 'al menos ' : ''}${t.impact.total} ${plural(t.impact.total, 'archivo', 'archivos')} (${t.impact.direct} directos, hasta ${t.impact.depth} ${plural(t.impact.depth, 'nivel', 'niveles')}); ${t.impact.prod} de producción.` : `El mayor radio de impacto es ${stem(t)}: ${t.impact.total} archivos dependen de él directa o indirectamente.`,
      rows: f ? ids.slice(0, 12).map((n, i) => row(n, i < t.impact.direct ? 'depende directamente' : 'indirecto', n.isTest ? 'prueba' : '')) : list.map((n) => row(n, `${n.impact.total} afectados (${n.impact.direct} directos)`)),
      conf: graphConf(c, 'Calculado sobre los imports del proyecto'),
      challenge: [...(t.impact.capped ? ['En un proyecto tan grande el cálculo se detiene en un tope: el alcance real es mayor.'] : []), 'Solo cuenta dependencias por import; no ve contratos externos (HTTP, base de datos, archivos) ni llamadas por reflexión.', tests ? `${tests} ${plural(tests, 'prueba lo importa', 'pruebas lo importan')} directamente: son tu red de seguridad, pero no garantizan que cubran lo que cambies.` : `Ninguna prueba importa ${stem(t)} directamente${t.coverage === 'indirecta' ? ' (solo hay cobertura indirecta)' : ''}: poco te avisaría si algo se rompe.`, 'Depender de un archivo no significa usar la parte que cambiarás; mira los símbolos de cada arista.'], follow: ['tests', 'hidden'] };
  } },
  { id: 'hidden', title: '¿Qué archivos cambian juntos sin importarse?', rx: /junto|acopl|co-?cambi|oculto|tunel|coupl/, run(c) {
    const hid = (c.w.coChange || []).filter((x) => x.hidden).slice(0, 6);
    if (!c.commits) return noData(this.title, 'Sin historial git no se puede medir.');
    if (!hid.length) return { id: this.id, title: this.title, headline: 'No hay pares que cambien juntos de forma recurrente sin estar conectados por imports.', rows: [], conf: histConf(c, 0, 'Sin pares'), challenge: ['Con poco historial es normal no ver acoplamiento oculto: aún no hay suficientes commits.'], follow: ['risk'] };
    const t = hid[0];
    return { id: this.id, title: this.title, headline: `${hid.length} ${plural(hid.length, 'par', 'pares')} cambian juntos sin importarse. El más fuerte: ${stem(c.byId.get(t.a))} ↔ ${stem(c.byId.get(t.b))} (${t.count} commits, ${pct(t.strength)}).`,
      rows: hid.map((x) => ({ id: x.a, text: `↔ ${x.b} · ${x.count} commits juntos · confianza ${pct(x.confAB)}/${pct(x.confBA)} · lift ${x.lift}`, tag: 'oculto' })),
      conf: histConf(c, t.count, 'Co-cambio observado'),
      challenge: ['Cambiar juntos puede ser coincidencia de commits grandes (refactors masivos) en vez de dependencia real.', `Lift ${t.lift}: valores cercanos a 1 sugieren que el par cambia junto por azar dada su frecuencia individual.`, 'Revisa el diff de los commits compartidos antes de crear una dependencia explícita.'], follow: ['dup', 'impact'] };
  } },
  { id: 'dup', title: '¿Dónde la duplicación cuesta más?', rx: /duplic|dry|copia|repet|clon/, run(c) {
    const g = (c.w.dupes?.groups || []).filter((x) => !x.test);
    if (!c.w.dupes) return noData(this.title, 'La detección de duplicados no se ejecutó.');
    if (!g.length) return { id: this.id, title: this.title, headline: 'No se detectó duplicación relevante.', rows: [], conf: { level: 'media', why: 'La detección cubre solo JavaScript/TypeScript.' }, challenge: ['Los demás lenguajes del proyecto no se analizan para duplicados todavía.'], follow: ['risk'] };
    const t = [...g].sort((a, b) => b.score - a.score).slice(0, 5);
    return { id: this.id, title: this.title, headline: `${g.length} ${plural(g.length, 'grupo', 'grupos')} de duplicación. Peor: ${t[0].name === '(anónima)' ? 'una función anónima de ' + (t[0].units?.[0]?.file || '?') : t[0].name} (${t[0].copies} copias de ${t[0].lines} líneas, ${t[0].sev}; han cambiado juntas ${t[0].coCount} veces).`,
      rows: t.map((x) => { return { id: x.units?.[0]?.file, text: `${x.name} · ${x.copies} copias en ${(x.files || []).join(', ')} · ${x.sev} · puntaje ${x.score}`, tag: x.sev }; }),
      conf: histConf(c, t[0].coCount || 0, 'El costo se infiere del co-cambio de las copias'),
      challenge: ['“Costosa” = las copias han cambiado juntas; “latente” = parecidas pero cambian por separado y podrían divergir a propósito.', 'Dos funciones parecidas pueden ser distintas por dominio; extraer una abstracción puede acoplar cosas que evolucionan distinto.', g.some((x) => x.suggest?.warn?.length) ? 'Alguna sugerencia de extracción tiene advertencias (p. ej. dependencia circular): léelas antes de extraer.' : ''].filter(Boolean), follow: ['hidden', 'risk'] };
  } },
  { id: 'tests', title: '¿Qué importante no tiene pruebas?', rx: /prueba|test|cobertura|coverage/, run(c) {
    const list = c.files.filter((n) => n.coverage === 'ninguna' && n.role !== 'orphan').sort((a, b) => (b.risk?.score || 0) - (a.risk?.score || 0)).slice(0, 6);
    if (!list.length) return { id: this.id, title: this.title, headline: 'Todo archivo relevante tiene alguna prueba (directa o indirecta).', rows: [], conf: graphConf(c, 'Cobertura por imports de pruebas'), challenge: ['Cobertura “indirecta” significa que una prueba lo importa por otro archivo, no que lo ejercite.'], follow: ['risk'] };
    return { id: this.id, title: this.title, headline: `${list.length} archivos relevantes sin pruebas. El más delicado: ${stem(list[0])} (riesgo ${list[0].risk?.score ?? '?'}, ${list[0].fanIn} dependientes).`,
      rows: list.map((n) => row(n, `riesgo ${n.risk?.score ?? '?'} · ${n.fanIn} dependientes · ${n.git?.c90 ?? 0} cambios/90 d`, 'sin pruebas')),
      conf: graphConf(c, 'La cobertura se infiere de qué archivos importan las pruebas, no de ejecutarlas'),
      challenge: ['No mide cobertura de líneas: un archivo “con prueba directa” puede estar poco probado.', 'Puede haber pruebas end-to-end que lo ejerciten sin importarlo.'], follow: ['risk', 'impact'] };
  } },
  { id: 'owner', title: '¿Quién conoce este código? (factor autobús)', needsFile: false, rx: /quien|autor|bus|propiet|conoce|owner|equipo/, run(c, f) {
    if (!c.commits) return noData(this.title, 'Sin historial git no hay autores.');
    const A = c.authors;
    if (f?.git?.tracked) { const g = f.git; return { id: this.id, title: `¿Quién conoce ${stem(f)}?`, headline: `${A[g.owner] ?? 'Nadie'} concentra ${pct(g.ownerShare)} de los ${g.commits} commits; factor autobús ${g.busFactor}.`,
      rows: g.authors.map((x) => ({ text: `${A[x.a]} · ${x.commits} commits · ${pct(x.share)}` })), conf: histConf(c, g.commits, 'Autoría por commits'),
      challenge: ['Commits no miden conocimiento: alguien puede haber revisado o diseñado sin firmar los commits.', 'Renombres, formateos masivos o squash pueden atribuir mal.'], follow: ['risk'] }; }
    const solo = c.files.filter((n) => n.flags?.includes('propietario-único')).sort((a, b) => (b.risk?.score || 0) - (a.risk?.score || 0)).slice(0, 6);
    return { id: this.id, title: this.title, headline: solo.length ? `${solo.length}+ archivos dependen de una sola persona. El de más riesgo: ${stem(solo[0])} (${A[solo[0].git.owner]}).` : 'No hay archivos con propietario único y suficiente historial.',
      rows: solo.map((n) => row(n, `${A[n.git.owner]} · ${pct(n.git.ownerShare)} de ${n.git.commits} commits`, 'propietario único')),
      conf: histConf(c, solo[0]?.git.commits || 0, 'Autoría por commits'), challenge: ['Un equipo pequeño hará que casi todo tenga propietario único: compara contra el tamaño del equipo.', 'Los commits no capturan quién revisa o diseña.'], follow: ['risk', 'impact'] };
  } },
  { id: 'dead', title: '¿Qué puedo borrar con seguridad?', rx: /borr|muert|huerfan|sin uso|elimin|dead|unused|limpi/, run(c) {
    const orph = c.files.filter((n) => n.role === 'orphan').slice(0, 6);
    const syms = (c.w.symbols || []).filter((s) => { const f = c.byId.get(s.file); return f && !f.aux && !f.gen && !f.isTest; }).filter((s) => !s.total && !(s.uses || []).some((u) => !u.test)).slice(0, 4);
    if (!orph.length && !syms.length) return { id: this.id, title: this.title, headline: 'No hay archivos huérfanos ni símbolos exportados sin uso.', rows: [], conf: graphConf(c, 'Basado en imports'), challenge: ['Esto solo descarta lo que el grafo ve usado.'], follow: ['risk'] };
    return { id: this.id, title: this.title, headline: `${orph.length} ${plural(orph.length, 'archivo huérfano', 'archivos huérfanos')} y ${syms.length} ${plural(syms.length, 'símbolo', 'símbolos')} exportados sin uso.`,
      rows: [...orph.map((n) => row(n, `nadie lo importa · ${n.lines} líneas · último cambio ${n.git?.last ? n.git.last.slice(0, 10) : '?'}`, 'huérfano')), ...syms.map((s) => ({ id: s.file, text: `símbolo ${s.name} sin usos`, tag: 'sin uso' }))],
      conf: graphConf(c, 'Un archivo “huérfano” es uno que nadie importa'),
      challenge: ['Puede ser un punto de entrada (script, CLI, tarea programada) que se ejecuta desde fuera.', 'Puede cargarse por nombre en tiempo de ejecución (plugins, rutas, DI), invisible al grafo.', 'Antes de borrar: busca el nombre en configuración y despliegue, y confirma en git que nadie lo toca.'], follow: ['hidden'] };
  } },
  { id: 'cycles', title: '¿Hay dependencias circulares?', rx: /ciclo|circular|cycle/, run(c) {
    const cy = c.w.cycles || [];
    if (!cy.length) return { id: this.id, title: this.title, headline: 'No hay ciclos entre archivos de producción.', rows: [], conf: graphConf(c, 'Componentes fuertemente conectados'), challenge: ['No ve ciclos a través de llamadas dinámicas.'], follow: ['risk'] };
    return { id: this.id, title: this.title, headline: `${cy.length} ${plural(cy.length, 'ciclo', 'ciclos')}; el mayor involucra ${Math.max(...cy.map((x) => x.length))} archivos.`,
      rows: cy.slice(0, 4).flatMap((g) => g.slice(0, 4).map((id) => ({ id, text: 'participa en un ciclo', tag: 'ciclo' }))), conf: graphConf(c, 'Componentes fuertemente conectados'),
      challenge: ['Un ciclo de imports solo falla si hay inicialización circular; muchos lenguajes lo toleran.', 'Romperlo suele requerir extraer un tercer módulo o invertir la dependencia con eventos.'], follow: ['risk', 'impact'] };
  } },
  { id: 'generated', title: '¿Qué código es generado?', rx: /generad|autogen|codegen|minific/, run(c) {
    const g = c.all.filter((n) => n.gen);
    if (!g.length) return { id: this.id, title: this.title, headline: 'No se detectó código generado (marcas @generated, nombres .g.cs / .pb.go / .min.js…).', rows: [], conf: { level: 'media', why: 'Se detecta por marcas en la cabecera y por el nombre; un generador sin marca pasa desapercibido.' }, challenge: ['Un archivo generado sin cabecera ni nombre típico no se reconoce.'], follow: ['risk', 'dead'] };
    return { id: this.id, title: this.title, headline: `${g.length} ${plural(g.length, 'archivo generado', 'archivos generados')}: se excluyen del riesgo y de los rankings.`,
      rows: g.slice(0, 10).map((n) => row(n, `${n.lines} líneas · ${n.gen}`, 'generado')), conf: { level: 'alta', why: 'La marca o el nombre del archivo lo declara.' },
      challenge: ['Si alguien edita a mano un archivo generado, el siguiente build lo sobrescribe.', 'Excluirlos del riesgo oculta que muchos módulos dependan de ellos: mira sus dependientes.'], follow: ['risk', 'impact'] };
  } },
  { id: 'dynamic', title: '¿Dónde falla el grafo por reflexión?', rx: /reflex|dinamic|reflect|eval|inyecc/, run(c) {
    const d = c.all.filter((n) => n.dyn && !n.isTest).sort((a, b) => b.dyn.length - a.dyn.length).slice(0, 8);
    if (!d.length) return { id: this.id, title: this.title, headline: 'No se detectó reflexión ni carga dinámica de código.', rows: [], conf: graphConf(c, 'Búsqueda de patrones conocidos'), challenge: ['Solo se buscan patrones habituales por lenguaje; la inyección de dependencias por convención no se ve.'], follow: ['impact', 'dead'] };
    return { id: this.id, title: this.title, headline: `${d.length} ${plural(d.length, 'archivo usa', 'archivos usan')} reflexión o carga dinámica: sus dependencias reales pueden ser más de las dibujadas.`,
      rows: d.map((n) => row(n, `${[...new Set(n.dyn.map((x) => x.what))].join(', ')} (línea ${n.dyn[0].line})`, 'reflexión')), conf: { level: 'media', why: 'Detectado por patrones; no se sabe a qué apunta cada uso.' },
      challenge: ['Un uso de reflexión puede ser inofensivo (leer un atributo) o cargar medio sistema.', 'El impacto y el código muerto calculados para estos archivos son una cota inferior.'], follow: ['impact', 'dead'] };
  } },
  { id: 'recursion', title: '¿Qué funciones son recursivas?', rx: /recurs/, run(c) {
    const r = c.all.filter((n) => n.rec).slice(0, 8);
    if (!r.length) return { id: this.id, title: this.title, headline: 'No se detectó recursión dentro de un mismo archivo.', rows: [], conf: { level: 'media', why: 'Grafo de llamadas por nombre dentro de cada archivo; no ve recursión entre archivos ni por callbacks.' }, challenge: ['Las llamadas se emparejan por nombre: una función homónima de otra clase puede dar falsos positivos.'], follow: ['cycles'] };
    return { id: this.id, title: this.title, headline: `${r.length} ${plural(r.length, 'archivo contiene', 'archivos contienen')} funciones recursivas.`,
      rows: r.flatMap((n) => n.rec.map((x) => row(n, `${x.kind === 'mutua' ? x.names.join(' ⇄ ') : x.names[0] + '() se llama a sí misma'} · línea ${x.line}`, x.kind))).slice(0, 12), conf: { level: 'media', why: 'Coincidencia de nombres dentro del archivo, sin resolver tipos.' },
      challenge: ['Comprueba que existe un caso base y qué profundidad alcanza con entradas grandes (desbordamiento de pila).', 'Puede ser un falso positivo si el método llamado es de otro objeto con el mismo nombre.'], follow: ['cycles', 'risk'] };
  } },
  { id: 'since', title: '¿Qué cambió desde la última vez?', rx: /desde|ultima vez|novedad|que cambio|since|diferenc/, run(c) {
    const d = c.w.since;
    if (!d) return { id: this.id, title: this.title, headline: 'Aún no hay una vista anterior con la que comparar: esta visita queda guardada como referencia.', rows: [], conf: { level: 'baja', why: 'Es la primera vez que se abre este proyecto en este navegador.' }, challenge: [], follow: ['health'] };
    const rows = [...d.newRisk.map((x) => ({ id: x.id, text: `riesgo ${x.from} → ${x.to}`, tag: 'sube' })), ...d.added.map((id) => ({ id, text: 'archivo nuevo', tag: 'nuevo' })), ...d.removed.map((id) => ({ text: `${id} ya no existe`, tag: 'borrado' })), ...d.states.map((x) => ({ id: x.id, text: `estado ${x.from} → ${x.to}`, tag: 'estado' }))].slice(0, 14);
    return { id: this.id, title: this.title, headline: `Desde ${d.when}: ${d.added.length} nuevos, ${d.removed.length} borrados, ${d.newRisk.length} con más riesgo, ${d.states.length} cambiaron de estado${d.health != null ? `; salud ${d.health > 0 ? '+' : ''}${d.health}` : ''}.`,
      rows, conf: { level: 'alta', why: 'Comparación exacta entre dos fotos guardadas en este navegador.' }, challenge: ['Solo compara con la última visita guardada en este navegador, no con una versión concreta del repositorio.'], follow: ['risk', 'health'] };
  } },
  { id: 'health', title: '¿Cómo está el proyecto en general?', rx: /salud|general|estado|resumen|health|empeor|mejor|tendencia/, run(c) {
    const h = c.w.health; if (!h) return noData(this.title, 'No hay índice de salud.');
    const alta = c.w.insights.filter((i) => i.sev === 'alta');
    return { id: this.id, title: this.title, headline: `Salud ${h.score}/100 (${h.grade}) con ${alta.length} ${plural(alta.length, 'hallazgo', 'hallazgos')} de atención alta y ${c.w.insights.length} en total.`,
      rows: alta.slice(0, 6).map((i) => ({ id: i.nodes?.[0], text: i.title, tag: 'alta' })), conf: histConf(c, c.commits, 'La salud combina estructura e historial'),
      challenge: ['La nota agrega señales con pesos fijados por la herramienta: úsala para comparar contra sí mismo en el tiempo, no contra otros proyectos.', 'Un proyecto joven o pequeño tiene poca evidencia: la nota se mueve mucho con pocos cambios.'], follow: ['risk', 'hidden', 'dead'] };
  } },
];

/** archivo mencionado en la pregunta (el nombre más largo que aparezca) */
export function findFile(c, q) {
  const nq = norm(q); let best = null, bl = 0;
  for (const n of c.all) for (const key of [n.id, n.label, stem(n)]) { const k = norm(key); if (k.length >= 3 && k.length > bl && new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(nq)) { best = n; bl = k.length; } }
  return best;
}
/** devuelve la respuesta a una pregunta libre o por id */
export function ask(world, text, opts = {}) {
  const c = ctx(world), q = text || '', nq = norm(q);
  let file = opts.file ? c.byId.get(opts.file) : findFile(c, q);
  let item = QUESTIONS.find((x) => x.id === opts.id) || QUESTIONS.find((x) => x.rx.test(nq));
  if (!item && file) item = QUESTIONS.find((x) => x.id === 'impact');
  if (!item) return { id: 'none', title: q, headline: 'No entendí la pregunta. Prueba con una de estas:', rows: [], conf: { level: 'baja', why: 'Sin coincidencia.' }, challenge: [], follow: QUESTIONS.map((x) => x.id) };
  if ((item.id === 'owner' || item.id === 'impact') && !file && opts.sel) file = c.byId.get(opts.sel);
  const a = item.run(c, file); a.q = q; a.file = file?.id || null; return a;
}
/** preguntas sugeridas; si hay un archivo seleccionado, preguntas sobre él */
export function suggest(world, sel) {
  const c = ctx(world), f = sel ? c.byId.get(sel) : null, out = [];
  if (f && f.kind === 'file') { out.push({ id: 'impact', file: f.id, text: `¿Qué se rompe si cambio ${stem(f)}?` }); if (c.commits) out.push({ id: 'owner', file: f.id, text: `¿Quién conoce ${stem(f)}?` }); }
  for (const x of QUESTIONS) if (x.id !== 'impact' || !f) out.push({ id: x.id, text: x.title });
  return out.slice(0, 9);
}
/** evidencia en texto, para dársela a una IA y que responda sin inventar */
export function evidenceText(a) {
  return [`PREGUNTA: ${a.q || a.title}`, `HALLAZGO: ${a.headline}`, 'EVIDENCIA:', ...a.rows.map((r) => `- ${r.id ? r.id + ': ' : ''}${r.text}`), `CONFIANZA: ${a.conf.level} — ${a.conf.why}`, 'LÍMITES CONOCIDOS:', ...a.challenge.map((x) => `- ${x}`)].join('\n');
}

// ───────────── «desde la última vez»: foto compacta del mundo y su diferencia ─────────────
/** foto pequeña (id → [riesgo, estado, líneas]) para guardar entre visitas */
export function snapshotOf(w) {
  const f = {}; for (const n of w.nodes) if (n.kind === 'file' && !n.isTest) f[n.id] = [n.risk?.score ?? 0, n.state || '', n.loc || 0];
  return { t: Date.now(), health: w.health?.score ?? null, f };
}
/** diferencia entre una foto anterior y el mundo actual */
export function diffSince(prev, w, ago = '') {
  const cur = snapshotOf(w), added = [], removed = [], newRisk = [], states = [];
  for (const [id, v] of Object.entries(cur.f)) { const p = prev.f?.[id]; if (!p) { added.push(id); continue; } if (v[0] - p[0] >= 8) newRisk.push({ id, from: p[0], to: v[0] }); if (v[1] !== p[1] && p[1]) states.push({ id, from: p[1], to: v[1] }); }
  for (const id of Object.keys(prev.f || {})) if (!(id in cur.f)) removed.push(id);
  newRisk.sort((a, b) => (b.to - b.from) - (a.to - a.from));
  const lines = Object.values(cur.f).reduce((s, v) => s + v[2], 0) - Object.values(prev.f || {}).reduce((s, v) => s + v[2], 0);
  return { when: ago || new Date(prev.t).toLocaleString(), t: prev.t, added, removed, newRisk, states, lines, health: prev.health != null && cur.health != null ? cur.health - prev.health : null,
    empty: !added.length && !removed.length && !newRisk.length && !states.length };
}
