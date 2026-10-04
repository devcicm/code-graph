#!/usr/bin/env node
// code-graph · mcp.mjs — servidor MCP (stdio, JSON-RPC) para que una IA consulte el proyecto con evidencia real.
// Registro: { "command": "node", "args": ["/ruta/code-graph/mcp.mjs", "/ruta/al/proyecto"] }
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { buildSnapshot } from './lib/snapshot.mjs';
import { ask, QUESTIONS, evidenceText } from './lib/qa.mjs';
import { plan, fingerprint, check } from './lib/guard.mjs';
import { review } from './lib/pr.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = resolve(process.argv[2] || '.');
let world = null; const get = () => (world ||= buildSnapshot(root, { externals: false }));
const TOOLS = [
  { name: 'ask', description: 'Responde una pregunta sobre el proyecto (riesgo, impacto, acoplamiento oculto, duplicación, pruebas, autoría, código muerto, ciclos, salud) con evidencia, confianza y límites.', inputSchema: { type: 'object', properties: { question: { type: 'string' }, file: { type: 'string', description: 'id del archivo (ruta relativa), opcional' } }, required: ['question'] } },
  { name: 'impact', description: 'Qué archivos se ven afectados si se cambia un archivo.', inputSchema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] } },
  { name: 'plan_change', description: 'ANTES de editar: dado el/los archivos que vas a tocar, devuelve radio de impacto, pruebas a correr, archivos que suelen cambiar junto con ellos, duplicados, ciclos, puentes HTTP y avisos (código generado, reflexión…). Guarda una foto para comparar después.', inputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' }, description: 'rutas relativas al proyecto' } }, required: ['files'] } },
  { name: 'check_change', description: 'DESPUÉS de editar: vuelve a analizar y compara con la foto de plan_change. Informa ciclos nuevos, riesgo que sube, archivos nuevos sin pruebas, duplicación nueva, archivos borrados que se usaban y cambio en la salud.', inputSchema: { type: 'object', properties: {} } },
  { name: 'review_pr', description: 'Resumen de riesgo (Markdown) de los cambios frente a una rama o commit base: archivos, qué revisar, pruebas a correr y quién debería revisar. Úsalo para describir un PR.', inputSchema: { type: 'object', properties: { base: { type: 'string', description: 'rama o commit base; por defecto HEAD' } } } },
  { name: 'refresh', description: 'Vuelve a analizar el proyecto (tras editar archivos).', inputSchema: { type: 'object', properties: {} } },
  { name: 'questions', description: 'Lista las preguntas que se pueden hacer.', inputSchema: { type: 'object', properties: {} } },
];
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const BASE = join(root, '.codegraph', 'guard-baseline.json');
function call(name, a = {}) {
  if (name === 'plan_change') { const w = get(); const p = plan(w, a.files || []); try { mkdirSync(join(root, '.codegraph'), { recursive: true }); writeFileSync(BASE, JSON.stringify(fingerprint(w))); } catch {} return text(p.text); }
  if (name === 'review_pr') return text(review(root, a.base || 'HEAD').markdown);
  if (name === 'check_change') { let prev; try { prev = JSON.parse(readFileSync(BASE, 'utf8')); } catch { return text('No hay foto previa: llama primero a plan_change antes de editar.'); } world = null; return text(check(prev, get()).text); }
  if (name === 'refresh') { world = null; get(); return text('Proyecto reanalizado.'); }
  if (name === 'questions') return text(QUESTIONS.map((q) => `${q.id}: ${q.title}`).join('\n'));
  if (name === 'impact') return text(evidenceText(ask(get(), '¿qué se rompe si cambio?', { id: 'impact', file: a.file })));
  if (name === 'ask') return text(evidenceText(ask(get(), a.question, a.file ? { file: a.file } : {})));
  throw new Error('herramienta desconocida: ' + name);
}
const send = (o) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...o }) + '\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return; // notificaciones
  try {
    if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'code-graph', version: '0.4' } } });
    else if (m.method === 'tools/list') send({ id: m.id, result: { tools: TOOLS } });
    else if (m.method === 'tools/call') send({ id: m.id, result: call(m.params.name, m.params.arguments) });
    else if (m.method === 'ping') send({ id: m.id, result: {} });
    else send({ id: m.id, error: { code: -32601, message: 'método no soportado' } });
  } catch (e) { send({ id: m.id, result: { ...text('Error: ' + e.message), isError: true } }); }
});
