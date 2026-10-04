#!/usr/bin/env node
// code-graph · ask.mjs — pregunta a los datos de un proyecto desde la terminal (Q5)
// Uso: node ask.mjs <dir> "¿qué se rompe si cambio orderService?" [--json] [--evidence]
//      node ask.mjs <dir> --list
import { resolve } from 'node:path';
import { buildSnapshot } from './lib/snapshot.mjs';
import { ask, suggest, evidenceText, QUESTIONS } from './lib/qa.mjs';

export function answer(dir, text, opts = {}) { return ask(buildSnapshot(resolve(dir), { externals: false }), text, opts); }
export function format(a) {
  const out = [`\n${a.title}`, `→ ${a.headline}`, `  Confianza ${a.conf.level}: ${a.conf.why}`];
  if (a.rows.length) { out.push('\nEvidencia:'); for (const r of a.rows) out.push(`  • ${r.id ? r.id + ' — ' : ''}${r.text}`); }
  if (a.challenge.length) { out.push('\nCuestiónala:'); for (const c of a.challenge) out.push(`  ? ${c}`); }
  if (a.follow?.length && a.id !== 'none') out.push('\nPara seguir: ' + a.follow.map((id) => QUESTIONS.find((q) => q.id === id)?.title).filter(Boolean).join(' · '));
  return out.join('\n') + '\n';
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), flags = new Set(args.filter((a) => a.startsWith('--'))), pos = args.filter((a) => !a.startsWith('--'));
  if (!pos.length) { console.error('Uso: node ask.mjs <dir> "pregunta" [--json] [--evidence] | --list'); process.exit(1); }
  const w = buildSnapshot(resolve(pos[0]), { externals: false });
  if (flags.has('--list')) { for (const s of suggest(w)) console.log('•', s.text); process.exit(0); }
  const a = ask(w, pos.slice(1).join(' '));
  console.log(flags.has('--json') ? JSON.stringify(a, null, 2) : flags.has('--evidence') ? evidenceText(a) : format(a));
}
