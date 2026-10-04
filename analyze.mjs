#!/usr/bin/env node
// code-graph · analyze.mjs
// Escanea un proyecto y produce graph.json: nodos (archivos), aristas (import,
// reexport, dynamic, require, relation) con símbolos, referencias y cardinalidad.
// Sin dependencias. Node >= 18.
//
// Uso:
//   node analyze.mjs <dir> [--out graph.json] [--externals] [--overrides ov.json] [--prompt ai-prompt.md]

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, extname, basename, sep, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatedReason, dynamicUses, recursion, markAux } from './lib/signals.mjs';
import { findBridges } from './lib/bridges.mjs';
import { adapterFor, allExts, ignoredDirs, loadUserLanguages, byId } from './languages/index.mjs';

const IGNORE_ALWAYS = new Set(['.git']);
const toPosix = (p) => p.split(sep).join('/');

// ───────────────────────── 1. descubrir archivos ─────────────────────────
function walk(dir, exts, ignore, out = []) {
  for (const name of readdirSync(dir)) {
    if (ignore.has(name) || IGNORE_ALWAYS.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, exts, ignore, out);
    else if (exts.has(extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

// ───────────────────────── 6. ciclos (Tarjan) ─────────────────────────
function findCycles(nodeIds, edges) {
  const adj = new Map(nodeIds.map((id) => [id, []]));
  for (const e of edges) if (e.kind !== 'relation' && e.kind !== 'dynamic' && !e.fromTest && adj.has(e.source) && adj.has(e.target)) adj.get(e.source).push(e.target);
  let idx = 0; const stack = [], on = new Set(), index = new Map(), low = new Map(), sccs = [];
  const strong = (v) => {
    index.set(v, idx); low.set(v, idx); idx++; stack.push(v); on.add(v);
    for (const w of adj.get(v)) {
      if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) { const comp = []; let w; do { w = stack.pop(); on.delete(w); comp.push(w); } while (w !== v); if (comp.length > 1) sccs.push(comp); }
  };
  for (const v of nodeIds) if (!index.has(v)) strong(v);
  return sccs;
}

// ───────────────────────── 7. pipeline principal ─────────────────────────
export function analyze(rootDir, opts = {}) {
  const root = resolve(rootDir);
  loadUserLanguages(root);
  const files = walk(root, allExts(), ignoredDirs());
  const fileSet = new Set(files);
  const ctx = { root, fileSet };
  const langCount = {};
  const nodes = new Map(); // id -> node
  const edgeMap = new Map();
  const rels = []; // anotaciones @rel pendientes

  const idOf = (abs) => toPosix(relative(root, abs));
  const addExternal = (spec, lang) => {
    let pkg;
    if (spec.startsWith('@')) pkg = spec.split('/').slice(0, 2).join('/');
    else if (lang === 'go') pkg = spec.split('/').slice(0, /\./.test(spec.split('/')[0]) ? 3 : 1).join('/');
    else if (spec.includes('/')) pkg = spec.split('/')[0];
    else if (lang === 'java' || lang === 'kotlin') pkg = spec.split('.').slice(0, 2).join('.');
    else if (lang && lang !== 'javascript') pkg = spec.split(/::|\./)[0];
    else pkg = spec;
    const id = `pkg:${pkg}`;
    if (!nodes.has(id)) nodes.set(id, { id, label: pkg, dir: '(externo)', ext: '', lines: 0, exports: [], kind: 'external', summary: spec.startsWith('node:') ? 'módulo de Node' : 'paquete externo' });
    return id;
  };

  // fase 1: leer y parsear todo
  const items = [];
  for (const abs of files) {
    const ad = adapterFor(abs); if (!ad) continue;
    const raw = readFileSync(abs, 'utf8');
    items.push({ abs, ad, raw, ir: ad.parse(raw) });
  }
  // fase 2: preparar índices globales por lenguaje (espacios de nombres, módulos Go…)
  for (const ad of new Set(items.map((x) => x.ad))) if (ad.prepare) ad.prepare(items.filter((x) => x.ad === ad), ctx);

  for (const { abs, ad, ir, raw } of items) {
    const { code, comments, imports, exports, defs, loc, lines } = ir;
    const id = idOf(abs); langCount[ad.id] = (langCount[ad.id] || 0) + 1;
    const dir = posix.dirname(id) === '.' ? '(raíz)' : posix.dirname(id);
    const firstComment = comments.find((c) => c.line <= 3 && !/@rel|@set/.test(c.text));
    nodes.set(id, {
      id, label: basename(abs), dir, lang: ad.id, ext: extname(abs).slice(1), lines, loc, exports,
      defs, isTest: ad.isTest(id), kind: 'file', summary: firstComment ? firstComment.text.replace(/^[\s*]+/, '').trim().slice(0, 140) : '',
    });
    { const nd = nodes.get(id), gen = generatedReason(id, raw); if (gen) nd.gen = gen;
      if (!nd.isTest) { const dy = dynamicUses(code, ad.id); if (dy.length) nd.dyn = dy; const rc = recursion(code, defs, ad.id); if (rc.length) nd.rec = rc; } }
    const tags = [...new Set(comments.flatMap((c) => [...c.text.matchAll(/@set\s+([\w.-]+)/g)].map((m) => m[1])))]; if (tags.length) nodes.get(id).tags = tags;
    for (const c of comments) {
      const m = c.text.match(/@rel\s+(\S+)\s+(1:1|1:N|N:1|N:M)(?:\s+(.*))?$/m);
      if (m) rels.push({ from: id, target: m[1], card: m[2], label: (m[3] || '').trim(), line: c.line });
    }

    // enlaces normalizados: { target(abs)|external, spec, kind, names[{name,local,count?}], line, side? }
    let links = [];
    if (ad.link) links = ad.link(ir, abs, ctx);
    else for (const im of imports) {
      const r = ad.resolve(im.spec, abs, ctx, im);
      const arr = Array.isArray(r) ? r : r ? [typeof r === 'string' ? { target: r } : r] : [];
      if (!arr.length) links.push({ external: true, spec: im.spec, kind: im.kind, names: im.names, line: im.line, side: im.side });
      else for (const x of arr) links.push({ target: x.target, spec: im.spec, kind: im.kind, names: x.names || im.names, line: im.line, side: im.side });
    }

    for (const im of links) {
      let target, external = false;
      if (im.target) target = idOf(im.target);
      else { external = true; if (!opts.externals) continue; target = addExternal(im.spec, ad.id); }
      if (target === id) continue;
      const key = `${id}→${target}|${im.kind}`;
      let e = edgeMap.get(key);
      if (!e) { e = { id: key, source: id, target, kind: im.kind, origin: 'code', symbols: [], refs: 0, lines: [], specs: [], external }; edgeMap.set(key, e); }
      e.lines.push(im.line); if (!e.specs.includes(im.spec)) e.specs.push(im.spec);
      for (const n of im.names) {
        if (e.symbols.some((s) => s.name === n.name && s.local === n.local)) continue;
        let count = 0, members;
        if (n.count !== undefined) count = n.count;
        else if (im.kind === 'import' || im.kind === 'require') {
          count = ad.countRefs ? ad.countRefs(code, n.local, ir) : 0;
          if (n.name === '*' && ad.nsMembers) { members = [...ad.nsMembers(code, n.local, ir)].map(([name, c]) => ({ name, count: c })); }
        }
        e.symbols.push({ name: n.name, local: n.local, count, ...(members ? { members } : {}) });
      }
      e.refs = e.symbols.reduce((s, x) => s + x.count, 0);
      if (im.kind === 'dynamic' || im.side) e.refs = Math.max(e.refs, 1);
    }
  }

  // @rel → aristas de relación (cardinalidad declarada en el código)
  const byStem = new Map();
  for (const n of nodes.values()) if (n.kind === 'file') { const k = basename(n.id).replace(/\.[^.]+$/, '').toLowerCase(); (byStem.get(k) || byStem.set(k, []).get(k)).push(n.id); }
  const warnings = [];
  for (const r of rels) {
    const t = r.target.toLowerCase();
    const direct = [...nodes.keys()].find((id) => id.toLowerCase() === t);
    const cands = direct ? [direct] : byStem.get(t.replace(/\.[^.]+$/, '')) || [];
    if (cands.length !== 1) { warnings.push(`@rel ${r.target} en ${r.from}:${r.line} — ${cands.length ? 'ambiguo' : 'no se encontró'}`); continue; }
    const key = `${r.from}→${cands[0]}|relation`;
    // la misma relación declarada desde ambos lados se conserva una sola vez
    const reverse = edgeMap.get(`${cands[0]}→${r.from}|relation`);
    if (reverse) { reverse.declaredBothSides = true; continue; }
    edgeMap.set(key, { id: key, source: r.from, target: cands[0], kind: 'relation', origin: 'code', card: r.card, label: r.label, symbols: [], refs: 0, lines: [r.line] });
  }

  // puentes HTTP entre lenguajes (heurístico)
  for (const b of findBridges(items.map((x) => ({ id: idOf(x.abs), lang: x.ad.id, raw: x.raw, isTest: nodes.get(idOf(x.abs))?.isTest })))) {
    const key = `${b.source}→${b.target}|bridge`; let e = edgeMap.get(key);
    if (!e) { e = { id: key, source: b.source, target: b.target, kind: 'bridge', origin: 'code', symbols: [], refs: 0, lines: [], specs: [], external: false, routes: [] }; edgeMap.set(key, e); }
    e.refs++; e.lines.push(b.line); e.specs.push(`${b.method} ${b.path}`); e.routes.push({ method: b.method, path: b.path, line: b.line, routeLine: b.routeLine });
  }

  let edges = [...edgeMap.values()];

  // overrides (aristas/notas aceptadas desde el visor o una IA)
  let notes = {};
  if (opts.overrides && existsSync(opts.overrides)) {
    const ov = JSON.parse(readFileSync(opts.overrides, 'utf8'));
    for (const e of ov.edges || []) {
      if (!nodes.has(e.source) || !nodes.has(e.target)) { warnings.push(`override ignorado: ${e.source} → ${e.target}`); continue; }
      const id = e.id || `${e.source}→${e.target}|${e.kind || 'relation'}:${e.origin || 'manual'}`;
      edges.push({ symbols: [], refs: 0, lines: [], ...e, id, status: undefined });
    }
    notes = ov.notes || {};
  }

  // métricas por nodo
  const fanIn = new Map(), fanOut = new Map(), fanOutInternal = new Map();
  for (const e of edges) {
    if (e.kind === 'relation') continue;
    if (nodes.get(e.source)?.isTest) { // las pruebas no cuentan como dependencias del sistema
      e.fromTest = true; const t = nodes.get(e.target);
      if (t && !e.external) (t.testedBy || (t.testedBy = new Set())).add(e.source);
      continue;
    }
    fanOut.set(e.source, (fanOut.get(e.source) || 0) + 1);
    fanIn.set(e.target, (fanIn.get(e.target) || 0) + 1);
    if (!e.external) fanOutInternal.set(e.source, (fanOutInternal.get(e.source) || 0) + 1);
  }
  const exportsOf = (id) => nodes.get(id)?.exports || [];
  for (const e of edges) {
    if (e.kind === 'relation' || e.external) continue;
    const total = exportsOf(e.target).length;
    const used = e.symbols.filter((s) => s.name !== '*').length || (e.symbols.some((s) => s.name === '*') ? total : 0);
    e.card = { symbols: used, exports: total, refs: e.refs, ratio: total ? +(used / total).toFixed(2) : null };
  }
  const reexp = new Map(); for (const e of edges) if (e.kind === 'reexport') reexp.set(e.source, (reexp.get(e.source) || 0) + 1);
  // en lenguajes que enlazan por tipo (C#, Java…), usarse entre archivos del mismo directorio es normal: no es un ciclo que valga la pena
  const NS_LANGS = new Set(['csharp', 'java', 'kotlin', 'scala', 'php', 'go']);
  const sccs = findCycles([...nodes.keys()], edges).filter((c) => !(c.every((id) => NS_LANGS.has(nodes.get(id)?.lang)) && new Set(c.map((id) => nodes.get(id).dir)).size === 1));
  const inCycle = new Set(sccs.flat());
  for (const e of edges) e.cycle = e.kind !== 'relation' && e.kind !== 'dynamic' && !e.fromTest && inCycle.has(e.source) && inCycle.has(e.target) && sccs.some((c) => c.includes(e.source) && c.includes(e.target));

  for (const n of nodes.values()) {
    n.fanIn = fanIn.get(n.id) || 0; n.fanOut = fanOut.get(n.id) || 0; n.cycle = inCycle.has(n.id);
    if (n.note = notes[n.id]) {} else delete n.note;
    n.testedBy = [...(n.testedBy || [])]; n.tested = n.testedBy.length > 0;
    n.role = n.kind === 'external' ? 'external' : n.isTest ? 'test'
      : n.fanIn === 0 && !(fanOutInternal.get(n.id)) ? 'orphan'
      : n.fanIn === 0 ? 'entry'
      : n.exports.length && n.fanOut > 0 && ((reexp.get(n.id) || 0) === n.fanOut) ? 'barrel'
      : n.fanIn >= 3 ? 'hub' : n.fanOut === 0 ? 'leaf' : 'module';
  }

  { let cfg = {}; try { cfg = JSON.parse(readFileSync(join(root, '.codegraph', 'config.json'), 'utf8')); } catch {}
    markAux([...nodes.values()], cfg.aux || [], cfg.auxOff === true); }
  const list = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    meta: { root: basename(root), generated: new Date().toISOString(), files: files.length, languages: langCount, langInfo: Object.fromEntries(Object.keys(langCount).map((k) => [k, { name: byId(k)?.name || k, lexer: byId(k)?.lexer || null }])), externals: !!opts.externals, tool: 'code-graph/0.3' },
    nodes: list,
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
    cycles: sccs,
    warnings,
  };
}

// ───────────────────────── 8. prompt para colaborar con una IA ─────────────────────────
export function buildPrompt(graph) {
  const files = graph.nodes.filter((n) => n.kind === 'file');
  const outs = new Map();
  for (const e of graph.edges) (outs.get(e.source) || outs.set(e.source, []).get(e.source)).push(`${e.kind}${e.card && typeof e.card === 'string' ? ':' + e.card : ''}→${e.target}`);
  const lines = files.map((n) => `- ${n.id} [${n.role}] exports: ${n.exports.join(', ') || '—'}${n.summary ? ` | ${n.summary}` : ''}\n    sale: ${(outs.get(n.id) || []).join('; ') || '—'}`);
  return `Eres un analista de arquitectura de software. Te paso el grafo de dependencias de un proyecto ("${graph.meta.root}") extraído automáticamente de sus imports.

Tu tarea: proponer relaciones que el análisis estático NO puede ver (relaciones de dominio entre entidades, referencias por id/string, convenciones, acoplamiento oculto) con su cardinalidad (1:1, 1:N, N:1, N:M), y notas breves sobre archivos importantes.

Reglas:
- Usa SOLO ids de la lista de archivos de abajo.
- No repitas aristas que ya existen en "sale".
- Responde ÚNICAMENTE con JSON válido, sin texto extra:
{"edges":[{"source":"<id>","target":"<id>","kind":"relation","card":"1:N","label":"<verbo corto>","reason":"<por qué>"}],
 "notes":{"<id>":"<nota de una línea>"}}

Archivos:
${lines.join('\n')}
`;
}

// ───────────────────────── CLI ─────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const dir = args.find((a, i) => !a.startsWith('--') && !['--out', '--overrides', '--prompt'].includes(args[i - 1]));
  if (!dir) { console.error('Uso: node analyze.mjs <dir> [--out graph.json] [--externals] [--overrides ov.json] [--prompt ai-prompt.md]'); process.exit(1); }
  const g = analyze(dir, { externals: args.includes('--externals'), overrides: get('--overrides') });
  const out = get('--out') || 'graph.json';
  writeFileSync(out, JSON.stringify(g, null, 2));
  if (get('--prompt')) writeFileSync(get('--prompt'), buildPrompt(g));
  console.log(`✔ ${g.nodes.length} nodos · ${g.edges.length} aristas · ${g.cycles.length} ciclo(s) → ${out}`);
  for (const w of g.warnings) console.warn('  ⚠', w);
}
