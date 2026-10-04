// code-graph · languages/index.mjs — registro de adaptadores de lenguaje
//
// Un adaptador es un objeto { id, name, exts, ignore, lexer, relSyntax, isTest(id),
//   parse(raw) → { code, comments, imports, exports, defs, loc, lines },
//   resolve(spec, fromAbs, ctx) → ruta absoluta | null,
//   countRefs?(code, local), nsMembers?(code, local) }
// El núcleo (analyze.mjs, métricas, visor) no conoce ningún lenguaje concreto.
import { extname } from 'node:path';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import javascript from './javascript.mjs';
import { declarative } from './declarative.mjs';
import { BUILTIN } from './specs.mjs';

const adapters = [];
export function register(a) {
  if (!a || !a.id || !Array.isArray(a.exts) || typeof a.parse !== 'function') throw new Error('Adaptador inválido');
  const i = adapters.findIndex((x) => x.id === a.id); if (i >= 0) adapters.splice(i, 1);
  adapters.push(a);
}
export const list = () => adapters.slice();
export const byId = (id) => adapters.find((a) => a.id === id);
export const adapterFor = (file) => { const e = extname(file).toLowerCase(); return adapters.find((a) => a.exts.includes(e)) || null; };
export const allExts = () => new Set(adapters.flatMap((a) => a.exts));
export const ignoredDirs = () => new Set(adapters.flatMap((a) => a.ignore || []));

register(javascript);
for (const spec of BUILTIN) register(declarative(spec));

/** Lenguajes y reglas añadidas por el usuario en .codegraph/config.json → "languages". */
export function loadUserLanguages(root) {
  let cfg = null; try { cfg = JSON.parse(readFileSync(join(root, '.codegraph', 'config.json'), 'utf8')); } catch { return []; }
  const added = [];
  for (const [id, spec] of Object.entries(cfg.languages || {})) {
    if (spec === false) { const i = adapters.findIndex((a) => a.id === id); if (i >= 0) adapters.splice(i, 1); continue; }
    try { register(declarative({ id, name: id, ...spec })); added.push(id); } catch (e) { console.warn('lenguaje', id, 'ignorado:', e.message); }
  }
  return added;
}
