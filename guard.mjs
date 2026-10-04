#!/usr/bin/env node
// code-graph · guard.mjs — guardarraíles desde la terminal (los mismos que las herramientas MCP plan_change / check_change)
//   node guard.mjs <dir> plan <archivo> [<archivo>…]   → qué saber antes de editar (y guarda la foto)
//   node guard.mjs <dir> pr [base]                      → resumen de riesgo (Markdown) frente a una rama/commit (por defecto HEAD); código 1 si es alto
//   node guard.mjs <dir> check                          → qué empeoró desde esa foto  (sale con código 1 si hay que revisar)
import { resolve, join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildSnapshot } from './lib/snapshot.mjs';
import { plan, fingerprint, check } from './lib/guard.mjs';
import { review } from './lib/pr.mjs';

const [dir, cmd, ...files] = process.argv.slice(2);
if (!dir || !['plan', 'check', 'pr'].includes(cmd)) { console.error('Uso: node guard.mjs <dir> plan <archivos…> | check | pr [base]'); process.exit(2); }
if (cmd === 'pr') { const r = review(resolve(dir), files[0] || 'HEAD'); console.log(r.markdown); process.exit(r.level === 'alto' ? 1 : 0); }
const root = resolve(dir), base = join(root, '.codegraph', 'guard-baseline.json'), w = buildSnapshot(root, { externals: false });
if (cmd === 'plan') { const p = plan(w, files); mkdirSync(join(root, '.codegraph'), { recursive: true }); writeFileSync(base, JSON.stringify(fingerprint(w))); console.log(p.text); }
else { let prev; try { prev = JSON.parse(readFileSync(base, 'utf8')); } catch { console.error('No hay foto previa: ejecuta primero «plan».'); process.exit(2); } const r = check(prev, w); console.log(r.text); process.exit(r.data.verdict === 'ok' ? 0 : 1); }
