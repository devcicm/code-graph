// code-graph · lib/assemble.mjs — arma el visor: plantilla + módulos JS + datos
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIEWER = join(dirname(fileURLToPath(import.meta.url)), '..', 'viewer');
const esc = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, ' ');

/** world: instantánea a incrustar (modo estático) o null; live: {token, root, abs} en modo servidor. */
export function assemble({ world = null, live = null, full = false } = {}) {
  let tpl = readFileSync(join(VIEWER, 'world.template.html'), 'utf8');
  tpl = tpl.replace(/<!--@include (\S+?)-->/g, (_, f) => { const t = readFileSync(join(VIEWER, f), 'utf8'); if (!f.endsWith('.mjs')) return t; const names = [...t.matchAll(/^export (?:async )?(?:function|const|let|class)\s+(\w+)/gm)].map((m) => m[1]); const ns = f.split('/').pop().replace(/\.mjs$/, '').toUpperCase(); return `const ${ns} = (() => {\n${t.replace(/^export /gm, '')}\nreturn { ${names.join(', ')} };\n})();`; });
  tpl = tpl.replace('/*__WORLD_JSON__*/null', () => (world ? esc(world) : 'null')).replace('/*__LIVE__*/null', () => (live ? esc(live) : 'null'));
  if (!full) return tpl; // fragmento: <title>, <style>, <body>… para publicarlo como Artifact
  return `<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>:root{color-scheme:dark}body{margin:0}</style>\n${tpl}\n</head><body></body></html>`;
}
