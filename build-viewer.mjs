#!/usr/bin/env node
// code-graph · build-viewer.mjs — visor ESTÁTICO (sin servidor) de un proyecto
//   viewer.html           página autónoma (doble clic y listo)
//   viewer.fragment.html  sin <html>/<body>, para publicarla como Artifact
// Uso: node build-viewer.mjs <proyecto> [outDir] [--externals]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot } from './lib/snapshot.mjs';
import { assemble } from './lib/assemble.mjs';

export function buildViewer(world, outDir, name = 'viewer') {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.html`), assemble({ world, full: true }));
  writeFileSync(join(outDir, `${name}.fragment.html`), assemble({ world }));
  return join(outDir, `${name}.html`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const [proj, out = 'dist'] = args;
  if (!proj) { console.error('Uso: node build-viewer.mjs <proyecto> [outDir] [--externals]'); process.exit(1); }
  const world = buildSnapshot(resolve(proj), { embedFiles: true, externals: process.argv.includes('--externals') });
  console.log('Visor escrito en', buildViewer(world, out));
}
