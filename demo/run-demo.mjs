#!/usr/bin/env node
// Demo de extremo a extremo:  node demo/run-demo.mjs
//  1. crea un repo git de prueba con historial (3 autores, ~340 días)
//  2. genera la instantánea del "mundo" (grafo + git + estados + riesgo + módulos)
//  3. se autoverifica contra lo que SABEMOS que hay en el proyecto
//  4. escribe el prompt para IA, simula su respuesta y la acepta como overrides
//  5. construye los visores estáticos en demo/out/
import { writeFileSync, mkdirSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt, analyze } from '../analyze.mjs';
import { ask, suggest, snapshotOf, diffSince } from '../lib/qa.mjs';
import { resolve as setOf, regions as regionsOf, layoutVenn, distFor, catalog as setCatalog, recipe as setRecipe } from '../lib/sets.mjs';
import { plan as guardPlan, fingerprint as guardFp, check as guardCheck } from '../lib/guard.mjs';
import { review as prReview } from '../lib/pr.mjs';
import { execFileSync } from 'node:child_process';
import { detectDuplicates } from '../lib/dupes.mjs';
import { buildSnapshot } from '../lib/snapshot.mjs';
import { buildViewer } from '../build-viewer.mjs';
import { makeHistory, defaultRepoDir } from './make-history.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out'); mkdirSync(out, { recursive: true });
const C = { ok: (s) => `\x1b[32m✔\x1b[0m ${s}`, bad: (s) => `\x1b[31m✘\x1b[0m ${s}`, dim: (s) => `\x1b[2m${s}\x1b[0m` };

const repo = defaultRepoDir();
makeHistory(repo);
console.log(`\n[1] Repo de prueba con historial: ${repo}`);

const w = buildSnapshot(repo, { externals: true, embedFiles: true });
writeFileSync(join(out, 'world.json'), JSON.stringify({ ...w, files: undefined }, null, 2));
console.log(`[2] Mundo: ${w.nodes.length} nodos, ${w.edges.length} aristas, ${w.timeline.commits?.length ?? w.timeline.length ?? '?'} puntos de historia, ${w.communities.length} módulos, salud ${w.health.score}`);
console.table(w.nodes.filter((n) => n.kind === 'file' && !n.isTest).map((n) => ({ archivo: n.id, estado: n.state, riesgo: n.risk.score, 'lo importan': n.fanIn, módulo: w.communities[n.community]?.name ?? '', tests: n.tested })));

const node = (id) => w.nodes.find((n) => n.id === id);
const edge = (s, t, k = 'import') => w.edges.find((e) => e.source === s && e.target === t && e.kind === k);
const checks = [
  ['import con símbolos y usos', () => edge('src/services/userService.mjs', 'src/utils/validate.mjs')?.symbols.map((s) => `${s.name}:${s.count}`).join() === 'isEmail:1,assert:1'],
  ['re-export del barrel (3 modelos)', () => w.edges.filter((e) => e.source === 'src/models/index.mjs' && e.kind === 'reexport').length === 3],
  ['import dinámico', () => !!edge('src/index.mjs', 'src/services/reportService.mjs', 'dynamic')],
  ['ciclo orderService ↔ paymentService', () => w.cycles.length === 1 && w.cycles[0].includes('src/services/orderService.mjs')],
  ['cardinalidad @rel N:1 y N:M', () => edge('src/models/order.mjs', 'src/models/user.mjs', 'relation')?.card === 'N:1' && edge('src/models/order.mjs', 'src/models/product.mjs', 'relation')?.card === 'N:M'],
  ['git: 3 autores y ≥25 commits', () => w.authors.length === 3 && w.meta.git.commits >= 25],
  ['git: archivo borrado no aparece, renombre conserva historia', () => !node('src/utils/oldDb.mjs') && w.nodes.some((n) => n.git?.renamedFrom)],
  ['estado "huérfano" para helper sin uso', () => node('src/utils/legacy.mjs')?.state === 'huérfano'],
  ['riesgo: orderService es el nº1 del proyecto', () => [...w.nodes].filter((n) => n.kind === 'file' && !n.isTest).sort((a, b) => b.risk.score - a.risk.score)[0].id === 'src/services/orderService.mjs'],
  ['acoplamiento oculto (co-change sin import)', () => w.coChange.some((c) => c.hidden)],
  ['módulos detectados (≥3)', () => w.communities.length >= 3],
  ['cobertura de tests directa/indirecta/ninguna', () => new Set(w.nodes.filter((n) => !n.isTest).map((n) => n.tested)).size >= 2],
  ['DRY: paginate() duplicada y cuesta (copias que cambian juntas)', () => { const g = w.dupes.groups.find((x) => x.name === 'paginate'); return g && g.sev === 'costosa' && g.files.length === 2 && g.coCount >= 3; }],
  ['DRY: digestLine/summaryLine detectadas como latentes (renombradas, sin co-cambio)', () => { const g = w.dupes.groups.find((x) => x.units.some((u) => u.name === 'digestLine')); return g && g.sev === 'latente' && g.type === 'parametrizado'; }],
  ['DRY: 0.16 repetido y ya existe TAX_RATE', () => w.dupes.constants.some((c) => c.value === '0.16' && c.existing?.name === 'TAX_RATE')],
  ['DRY: sin falsos positivos entre funciones distintas (solo 2 grupos)', () => w.dupes.groups.length === 2],
  ['DRY: sugerencia de extracción y % duplicado por archivo', () => w.dupes.groups[0].suggest?.file === 'src/api/paginate.mjs' && w.nodes.find((n) => n.id === 'src/api/userRoutes.mjs').dup?.pct > 0.3],
  ['traza de símbolos disponible', () => Object.keys(w.symbols).length > 5],
  ...polyChecks(),
  ['Q: «lo más riesgoso» → orderService con evidencia, confianza y límites', () => { const a = ask(w, '¿qué es lo más riesgoso?'); return a.id === 'risk' && a.rows[0].id === 'src/services/orderService.mjs' && a.conf.level && a.challenge.length >= 2; }],
  ['Q: impacto de un archivo nombrado en la pregunta', () => { const a = ask(w, 'qué se rompe si cambio orderService'); return a.id === 'impact' && a.file === 'src/services/orderService.mjs' && a.rows.some((r) => r.id === 'src/api/orderRoutes.mjs'); }],
  ['Q: acoplamiento oculto y duplicación responden con datos', () => ask(w, 'cambian juntos').rows.length > 0 && ask(w, 'duplicación').headline.includes('paginate')],
  ['Q: pregunta sin sentido no inventa (pide reformular)', () => { const a = ask(w, 'blablabla'); return a.id === 'none' && a.rows.length === 0; }],
  ['Conjuntos: @set pagos detecta 2 archivos', () => setOf(w, 'tag:pagos').size === 2],
  ['Conjuntos: las regiones suman la unión y A∩B es simétrico', () => { const A = { key: 'dir:src/services', ids: setOf(w, 'dir:src/services') }, B = { key: 'cov:ninguna', ids: setOf(w, 'cov:ninguna') }; const r = regionsOf([A, B]), r2 = regionsOf([B, A]); const ab = r.regions.find((x) => x.mask === 3)?.n || 0, ba = r2.regions.find((x) => x.mask === 3)?.n || 0; return r.regions.reduce((s, x) => s + x.n, 0) === r.union && ab === ba && ab === [...A.ids].filter((i) => B.ids.has(i)).length; }],
  ['Conjuntos: el área del cruce en el dibujo coincide con los datos (2 círculos)', () => { const A = { ids: new Set(Array.from({ length: 40 }, (_, i) => 'a' + i)) }, B = { ids: new Set([...Array.from({ length: 15 }, (_, i) => 'a' + i), ...Array.from({ length: 10 }, (_, i) => 'b' + i)]) }; const L = layoutVenn([A, B]); const [c1, c2] = L.circles, d = Math.hypot(c2.x - c1.x, c2.y - c1.y); const lens = (d, r1, r2) => { const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)), b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2)); return a + b - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)); }; const frac = lens(d, c1.r, c2.r) / (Math.PI * c1.r * c1.r); return Math.abs(frac - 15 / 40) < 0.01; }],
  ['Conjuntos: recetas con datos (zona crítica, carpeta vs módulo) y catálogo con carpetas/módulos/etiquetas', () => { const c = setCatalog(w).map((g) => g.group); return setRecipe(w, 'critical').keys.length === 3 && setRecipe(w, 'folder-module').keys && c.includes('Carpetas') && c.includes('Módulos detectados') && c.includes('Etiquetas @set'); }],
  ['Conjuntos guardados: «saved:» resuelve ids y aparece en «Mis conjuntos»', () => { const w3 = { ...w, customSets: { critico: ['src/services/orderService.mjs', 'src/index.mjs', 'no/existe.mjs'] } }; return setOf(w3, 'saved:critico').size === 3 && setCatalog(w3).some((g) => g.group === 'Mis conjuntos' && g.items[0].key === 'saved:critico'); }],
  ['Q: sugerencias dependen del archivo seleccionado', () => suggest(w, 'src/services/orderService.mjs')[0].text.includes('orderService')],
];
function polyChecks() {
  const g = analyze(join(here, 'sample-poly'), { externals: true });
  const has = (a, b) => g.edges.some((e) => e.source === a && e.target === b && !e.external);
  return [
    ['M1 políglota: 7 lenguajes detectados', () => Object.keys(g.meta.languages).length === 7],
    ['DRY multilenguaje: clones en C#, Python y Go', () => { const d = detectDuplicates(join(here, 'sample-dry'), ['A.cs', 'B.cs', 'a.py', 'b.py', 'a.go', 'b.go'].map((id) => ({ id })), {}); const fs = d.groups.map((x) => x.units.map((u) => u.file.split('.').pop()).join()); return d.groups.length === 3 && fs.includes('cs,cs') && fs.includes('py,py') && fs.includes('go,go'); }],
    ['Preguntas: generado, reflexión y recursión responden con datos del sample-poly', () => { const wp = buildSnapshot(join(here, 'sample-poly'), { git: false, dupes: false }); return ask(wp, '¿qué código es generado?').rows.length === 1 && ask(wp, 'reflexión').rows.length >= 2 && ask(wp, 'recursión').rows.length >= 2 && !wp.nodes.find((n) => n.id === 'svc/internal/store/store.pb.go').flags.includes('hotspot') && wp.nodes.find((n) => n.id === 'svc/internal/store/store.pb.go').risk.score === 0; }],
    ['Venn de 4 conjuntos: ajuste razonable y números de regiones sin solaparse', () => { const U = Array.from({ length: 60 }, (_, i) => 'f' + i), sets = [U.slice(0, 30), U.slice(15, 45), U.slice(25, 55), [...U.slice(10, 20), ...U.slice(40, 60)]].map((a, i) => ({ key: 'k' + i, ids: new Set(a) })), L = layoutVenn(sets), pts = [...L.labels.values()]; let min = 1e9; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) min = Math.min(min, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])); return L.err < 0.5 && pts.length === regionsOf(sets).regions.length && min >= 9; }],
    ['Desde la última vez: detecta archivos nuevos/borrados y riesgo que sube', () => { const prev = snapshotOf(w); delete prev.f['src/index.mjs']; prev.f['src/models/order.mjs'][0] -= 20; prev.f['viejo.mjs'] = [1, 'estable', 3]; const d = diffSince(prev, w, 'ayer'); return d.added.includes('src/index.mjs') && d.removed.includes('viejo.mjs') && d.newRisk[0]?.id === 'src/models/order.mjs' && !d.empty && diffSince(snapshotOf(w), w).empty; }],
    ['Ejemplos fuera del producto: examples/ se marca «ejemplo», queda sin riesgo y fuera de los rankings', () => { const d = mkdtempSync(join(tmpdir(), 'cg-aux-')); for (const f of ['lib/a.js', 'lib/b.js', 'lib/c.js', 'examples/x/index.js']) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), f === 'lib/a.js' ? "import './b.js';\nimport './c.js';\nexport const a = 1;\n" : 'export const v = 1;\n'); } const wa = buildSnapshot(d, { git: false, dupes: false }), ex = wa.nodes.find((n) => n.id === 'examples/x/index.js'); return ex.aux === 'examples' && ex.risk.score === 0 && ex.flags.includes('ejemplo') && !ask(wa, '', { id: 'dead' }).rows.some((r) => r.id === ex.id) && !wa.nodes.find((n) => n.id === 'lib/a.js').aux; }],
    ['Go mismo paquete se enlaza sin import; Python con import diferido no forma ciclo; C# del mismo directorio no se reporta como ciclo', () => {
      const mk = (files) => { const d = mkdtempSync(join(tmpdir(), 'cg-t-')); for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); } return analyze(d); };
      const go = mk({ 'go.mod': 'module x\n', 'p/a.go': 'package p\nfunc Hello() string { return World() }\n', 'p/b.go': 'package p\nfunc World() string { return "w" }\n' });
      const py = mk({ 'a.py': 'import b\ndef f():\n    return b.g()\n', 'b.py': 'def g():\n    import a\n    return a.f\n' });
      const cs = mk({ 'A.cs': 'namespace N { class A { B b; } }', 'B.cs': 'namespace N { class B { A a; } }' });
      return go.edges.some((e) => e.source === 'p/a.go' && e.target === 'p/b.go') && py.cycles.length === 0 && cs.cycles.length === 0; }],
    ['Guardarraíles: plan_change avisa (ciclo, pruebas) y check_change detecta ciclo nuevo, archivo sin pruebas y duplicación', () => {
      const d = mkdtempSync(join(tmpdir(), 'cg-guard-')), put = (f, c) => { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); };
      const body = (n) => `export function calc${n}(items, tax) {\n  let total = 0;\n  for (const it of items) {\n    if (it.qty > 0 && it.price > 0) { total += it.qty * it.price; } else { total -= 1; }\n  }\n  total = total + total * tax;\n  return Math.round(total * 100) / 100;\n}\n`;
      put('src/a.mjs', "import { b } from './b.mjs';\nexport const a = () => b();\n" + body('A')); put('src/b.mjs', 'export const b = () => 1;\n'); put('src/main.mjs', "import { a } from './a.mjs';\na();\n"); put('test/a.test.mjs', "import { a } from '../src/a.mjs';\na();\n");
      const w0 = buildSnapshot(d, { git: false }), p = guardPlan(w0, ['src/a.mjs']), fp = guardFp(w0);
      const okPlan = p.data.tests.some((t) => t.id === 'test/a.test.mjs') && /impacto/.test(p.text) && p.data.files[0].dependents.includes('src/main.mjs');
      const clean = guardCheck(fp, buildSnapshot(d, { git: false })).data.verdict === 'ok';
      put('src/b.mjs', "import { a } from './a.mjs';\nexport const b = () => a;\n"); put('src/c.mjs', "import { b } from './b.mjs';\nexport const c = () => b();\n" + body('C')); put('src/main.mjs', "import { a } from './a.mjs';\nimport { c } from './c.mjs';\na(); c();\n");
      const r = guardCheck(fp, buildSnapshot(d, { git: false })).data;
      return okPlan && clean && r.verdict === 'revisar' && r.issues.some((i) => /Ciclo nuevo/.test(i.text)) && r.issues.some((i) => i.id === 'src/c.mjs' && /no tiene pruebas/.test(i.text)) && r.issues.some((i) => /Duplicación nueva/.test(i.text)); }],
    ['Resumen de PR: frente a la base detecta ciclo nuevo y archivo sin pruebas, y no marca lo que ya existía', () => {
      const d = mkdtempSync(join(tmpdir(), 'cg-pr-')), put = (f, c) => { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }, g = (...a) => execFileSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { stdio: 'ignore' });
      put('src/a.mjs', "import { b } from './b.mjs';\nexport const a = () => b();\n"); put('src/b.mjs', 'export const b = () => 1;\n'); put('src/main.mjs', "import { a } from './a.mjs';\na();\n"); put('test/a.test.mjs', "import { a } from '../src/a.mjs';\na();\n");
      g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'base'); const sinCambios = prReview(d, 'HEAD').level === 'bajo';
      put('src/b.mjs', "import { a } from './a.mjs';\nexport const b = () => a;\n"); put('src/c.mjs', "export const c = () => 1;\nexport const c2 = () => 2;\nexport const c3 = () => 3;\nexport const c4 = () => 4;\nexport const c5 = () => 5;\nexport const c6 = () => 6;\nexport const c7 = () => 7;\nexport const c8 = () => 8;\n"); put('src/main.mjs', "import { a } from './a.mjs';\nimport { c } from './c.mjs';\na(); c();\n");
      const r = prReview(d, 'HEAD'); return sinCambios && r.level === 'alto' && /Ciclo nuevo/.test(r.markdown) && /src\/c\.mjs.*no tiene pruebas/.test(r.markdown) && /test\/a\.test\.mjs/.test(r.markdown) && r.changed.A.includes('src/c.mjs'); }],
    ['Puentes: fetch("/api/orders/${id}") en JS → OrdersController (C#) por HTTP', () => g.edges.some((e) => e.kind === "bridge" && e.source === "web/app.js" && e.target === "api/Controllers/OrdersController.cs" && e.specs[0] === "GET /api/orders/:p")],
    ['Generado: store.pb.go se marca y store.go no', () => !!g.nodes.find((n) => n.id === "svc/internal/store/store.pb.go")?.gen && !g.nodes.find((n) => n.id === "svc/internal/store/store.go")?.gen],
    ['Reflexión: C# Activator/Type.GetType y Python getattr', () => !!g.nodes.find((n) => n.id === "api/Controllers/OrdersController.cs")?.dyn && !!g.nodes.find((n) => n.id === "tools/pkg/helpers.py")?.dyn],
    ['Recursión: fact() directa en JS e is_even⇄is_odd mutua en Python', () => g.nodes.find((n) => n.id === "web/app.js")?.rec?.[0]?.names[0] === "fact" && g.nodes.find((n) => n.id === "tools/pkg/helpers.py")?.rec?.some((r) => r.kind === "mutua" && r.names.join() === "is_even,is_odd")],
    ['M1 JS: web/app.js → util.js', () => has('web/app.js', 'web/util.js')],
    ['M1 C#: namespace + tipo usado (Service→Model, Program→Service)', () => has('api/Services/OrderService.cs', 'api/Models/Order.cs') && has('api/Program.cs', 'api/Services/OrderService.cs')],
    ['M1 Python: from pkg.helpers y from pkg import mod (con tests en subcarpeta)', () => has('tools/main.py', 'tools/pkg/helpers.py') && has('tools/tests/test_main.py', 'tools/pkg/helpers.py')],
    ['M1 Go: paquete interno con go.mod anidado y símbolo usado', () => g.edges.some((e) => e.source === 'svc/cmd/main.go' && e.target === 'svc/internal/store/store.go' && e.symbols.some((s) => s.name === 'Get'))],
    ['M1 Java: import de clase del proyecto, java.util externo', () => has('java/com/acme/svc/UserService.java', 'java/com/acme/model/User.java') && g.edges.some((e) => e.external && e.target === 'pkg:java.util')],
    ['M1 Rust: mod/use crate::', () => has('rust/src/lib.rs', 'rust/src/shapes.rs')],
    ['M1 C: #include "geo.h" desde otra carpeta', () => has('c/src/geo.c', 'c/include/geo.h')],
    ['M1 tests por lenguaje (test_*.py)', () => g.nodes.find((n) => n.id === 'tools/tests/test_main.py')?.isTest === true],
  ];
}
console.log('\n[3] Autoverificación');
let failed = 0;
for (const [name, fn] of checks) { let ok = false; try { ok = fn(); } catch {} console.log(ok ? C.ok(name) : C.bad(name)); if (!ok) failed++; }

// IA → overrides
const graphLike = { meta: w.meta, nodes: w.nodes, edges: w.edges, cycles: w.cycles };
writeFileSync(join(out, 'ai-prompt.md'), buildPrompt(graphLike));
const ai = JSON.parse(readFileSync(join(here, 'ai-response.example.json'), 'utf8'));
const overrides = { edges: ai.edges.map((e, i) => ({ id: `ai:${i}`, ...e, origin: 'ai' })), notes: ai.notes };
writeFileSync(join(out, 'overrides.json'), JSON.stringify(overrides, null, 2));
const w2 = buildSnapshot(repo, { externals: true, embedFiles: true, overrides: join(out, 'overrides.json') });
console.log(`\n[4] IA: +${w2.edges.length - w.edges.length} relaciones aceptadas, ${Object.keys(ai.notes).length} notas`);

buildViewer({ ...w, meta: { ...w.meta, sampleAI: ai } }, out);
buildViewer(w2, out, 'viewer.with-ai');
console.log(`\n[5] Visores en demo/out/:  viewer.html (estático) · viewer.with-ai.html\n    En vivo y con edición real:  node serve.mjs ${repo}\n`);
if (failed) { console.error(`${failed} verificación(es) fallaron`); process.exit(1); }
