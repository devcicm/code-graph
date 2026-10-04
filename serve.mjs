#!/usr/bin/env node
// code-graph · serve.mjs — servidor local con edición real.
//   node serve.mjs <proyecto> [--port 4173] [--externals] [--no-open]
// Seguridad: escucha solo en 127.0.0.1, exige un token de sesión, valida Host/Origin,
// confina toda ruta a la carpeta del proyecto y no toca .git ni node_modules.
import http from 'node:http';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync, watch } from 'node:fs';
import { resolve, join, sep, extname, relative } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSnapshot } from './lib/snapshot.mjs';
import { readBlame, readDiff } from './lib/git.mjs';
import { assemble } from './lib/assemble.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f), val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const dir = args.find((a, i) => !a.startsWith('--') && !['--port'].includes(args[i - 1]));
if (!dir || !existsSync(dir)) { console.error('Uso: node serve.mjs <proyecto> [--port 4173] [--externals] [--no-open]'); process.exit(1); }

const ROOT = resolve(dir), PORT = +val('--port', 4173), TOKEN = randomBytes(16).toString('hex');
const MAX_BODY = 2 * 1024 * 1024, MAX_FILE = 1024 * 1024;
let world = null, rev = 0, building = false, again = false;
const clients = new Set();

function refresh() {
  if (building) { again = true; return; }
  building = true;
  try { world = buildSnapshot(ROOT, { externals: flag('--externals') }); rev++; for (const c of clients) c.write(`event: world\ndata: ${rev}\n\n`); }
  catch (e) { console.error('✘ análisis:', e.message); }
  building = false; if (again) { again = false; setTimeout(refresh, 50); }
}

const safe = (rel) => {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) return null;
  const abs = resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null;
  const parts = relative(ROOT, abs).split(sep);
  if (parts.some((p) => p === '.git' || p === 'node_modules')) return null;
  return abs;
};
const tokenOk = (t) => { try { const a = Buffer.from(String(t || '')), b = Buffer.from(TOKEN); return a.length === b.length && timingSafeEqual(a, b); } catch { return false; } };
const hostOk = (h) => [`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(h || '');
const send = (res, code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, no) => { let n = 0; const ch = []; req.on('data', (d) => { n += d.length; if (n > MAX_BODY) { no(new Error('cuerpo demasiado grande')); req.destroy(); } else ch.push(d); }); req.on('end', () => ok(Buffer.concat(ch).toString('utf8'))); req.on('error', no); });

const server = createServer(async (req, res) => {
  try {
    if (!hostOk(req.headers.host)) return send(res, 403, { error: 'host no permitido' });
    const origin = req.headers.origin; if (origin && !hostOk(origin.replace(/^https?:\/\//, ''))) return send(res, 403, { error: 'origen no permitido' });
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/' && req.method === 'GET') return send(res, 200, assemble({ live: { token: TOKEN, root: world.meta.root, abs: ROOT }, full: true }), 'text/html; charset=utf-8');
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'no encontrado' });
    if (!tokenOk(req.headers['x-cg-token'] || url.searchParams.get('token'))) return send(res, 401, { error: 'token inválido' });

    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: hello\ndata: ${rev}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (url.pathname === '/api/world') return send(res, 200, world);
    if (url.pathname === '/api/file' && req.method === 'GET') {
      const abs = safe(url.searchParams.get('path')); if (!abs || !existsSync(abs)) return send(res, 404, { error: 'archivo no encontrado' });
      const st = statSync(abs); if (!st.isFile() || st.size > MAX_FILE) return send(res, 413, { error: 'archivo no legible (carpeta o demasiado grande)' });
      return send(res, 200, { text: readFileSync(abs, 'utf8'), mtimeMs: st.mtimeMs });
    }
    if (url.pathname === '/api/file' && req.method === 'PUT') {
      const b = JSON.parse(await readBody(req)); const abs = safe(b.path);
      if (!abs || !existsSync(abs) || !statSync(abs).isFile()) return send(res, 404, { error: 'solo se editan archivos existentes del proyecto' });
      if (typeof b.text !== 'string' || b.text.length > MAX_FILE) return send(res, 400, { error: 'contenido inválido' });
      const cur = statSync(abs); if (b.mtimeMs && Math.abs(cur.mtimeMs - b.mtimeMs) > 1) return send(res, 409, { error: 'el archivo cambió en disco; recárgalo antes de guardar', mtimeMs: cur.mtimeMs });
      writeFileSync(abs, b.text); const st = statSync(abs); refresh();
      return send(res, 200, { ok: true, mtimeMs: st.mtimeMs });
    }
    if (url.pathname === '/api/blame') { const p = url.searchParams.get('path'); return safe(p) ? send(res, 200, readBlame(ROOT, p) || { authors: [], a: [], t: [] }) : send(res, 400, { error: 'ruta inválida' }); }
    if (url.pathname === '/api/diff') { const p = url.searchParams.get('path'); return safe(p) ? send(res, 200, { diff: readDiff(ROOT, p) }) : send(res, 400, { error: 'ruta inválida' }); }
    if (url.pathname === '/api/search') {
      const q = (url.searchParams.get('q') || '').toLowerCase(); if (q.length < 2) return send(res, 200, []);
      const out = [];
      for (const n of world.nodes) {
        if (n.kind !== 'file') continue; let text; try { text = readFileSync(join(ROOT, n.id), 'utf8'); } catch { continue; }
        const lines = text.split('\n');
        for (let i = 0; i < lines.length && out.length < 120; i++) { const c = lines[i].toLowerCase().indexOf(q); if (c >= 0) out.push({ file: n.id, line: i + 1, col: c, text: lines[i].trim().slice(0, 160) }); }
      }
      return send(res, 200, out);
    }
    if (url.pathname === '/api/overrides' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req)); const d = join(ROOT, '.codegraph'); mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'overrides.json'), JSON.stringify({ edges: b.edges || [], notes: b.notes || {} }, null, 2)); refresh(); return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/theme') {
      const f = join(ROOT, '.codegraph', 'theme.json');
      if (req.method === 'GET') { let look = null; try { look = JSON.parse(readFileSync(f, 'utf8')).look; } catch {} return send(res, 200, { look }); }
      if (req.method === 'PUT') { const b = JSON.parse(await readBody(req)); mkdirSync(join(ROOT, '.codegraph'), { recursive: true }); writeFileSync(f, JSON.stringify({ look: b.look }, null, 2)); return send(res, 200, { ok: true }); }
    }
    if (url.pathname === '/api/sets') {
      const f = join(ROOT, '.codegraph', 'sets.json');
      if (req.method === 'GET') { let v = { views: [], custom: {} }; try { v = JSON.parse(readFileSync(f, 'utf8')); } catch {} return send(res, 200, v); }
      if (req.method === 'PUT') { const b = JSON.parse(await readBody(req)); mkdirSync(join(ROOT, '.codegraph'), { recursive: true }); writeFileSync(f, JSON.stringify({ views: b.views || [], custom: b.custom || {} }, null, 2)); return send(res, 200, { ok: true }); }
    }
    if (url.pathname === '/api/export' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req)); const name = String(b.name || 'export').replace(/[^\w-]/g, '').slice(0, 30) || 'export';
      if (typeof b.svg !== 'string' || !b.svg.startsWith('<svg') || b.svg.length > 2_000_000) return send(res, 400, { error: 'svg inválido' });
      const dir = join(ROOT, '.codegraph', 'exports'); mkdirSync(dir, { recursive: true });
      const file = `${name}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.svg`; writeFileSync(join(dir, file), b.svg);
      return send(res, 200, { ok: true, path: `.codegraph/exports/${file}` });
    }
    return send(res, 404, { error: 'no encontrado' });
  } catch (e) { return send(res, 500, { error: String(e.message || e) }); }
});

refresh();
if (!world) { console.error('No pude analizar el proyecto.'); process.exit(1); }

let timer = null;
try {
  watch(ROOT, { recursive: true }, (_, f) => {
    if (!f || /(^|[\\/])(node_modules|\.git[\\/](objects|logs|lfs))([\\/]|$)/.test(f)) return;
    clearTimeout(timer); timer = setTimeout(refresh, 350);
  });
} catch (e) { console.warn('⚠ sin vigilancia de archivos:', e.message); }

server.listen(PORT, '127.0.0.1', () => {
  const u = `http://127.0.0.1:${PORT}/`;
  console.log(`\n  Code Graph · ${world.meta.root}\n  ${world.nodes.filter((n) => n.kind === 'file').length} archivos · ${world.meta.git.available ? world.meta.git.commits + ' commits' : 'sin git'}\n\n  Abre ${u}\n  (solo esta máquina; Ctrl+C para salir)\n`);
  if (!flag('--no-open')) { const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'; try { spawn(cmd, process.platform === 'win32' ? ['/c', 'start', u] : [u], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch {} }
});
