// code-graph · lib/snapshot.mjs — une análisis + git + métricas en un "mundo" (world.json)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../analyze.mjs';
import { readHistory, readStatus, readBlame, readDiff, headKey } from './git.mjs';
import { buildWorld } from './metrics.mjs';
import { detectDuplicates } from './dupes.mjs';

let histCache = { key: '', value: null };

export function buildSnapshot(root, opts = {}) {
  const ovPath = opts.overrides ?? join(root, '.codegraph', 'overrides.json');
  const graph = analyze(root, { externals: !!opts.externals, overrides: existsSync(ovPath) ? ovPath : null });
  let hist = null;
  if (opts.git !== false) {
    const head = headKey(root);
    // el historial es caro: se reutiliza mientras HEAD no cambie
    const key = root + '|' + (head ?? '');
    if (head && histCache.key === key) hist = histCache.value; else { hist = readHistory(root); histCache = { key, value: hist }; }
  }
  const status = hist ? readStatus(root) : new Map();
  let dupes = null;
  if (opts.dupes !== false) {
    let cfg = {}; try { cfg = JSON.parse(readFileSync(join(root, '.codegraph', 'config.json'), 'utf8')).dupes || {}; } catch {}
    dupes = detectDuplicates(root, graph.nodes.filter((n) => n.kind === 'file'), { ...cfg, ...(opts.dupes || {}) });
  }
  const world = buildWorld(graph, hist, status, { now: opts.now, dupes });
  if (opts.embedFiles) embedFiles(root, world, hist);
  return world;
}

/** Para la versión estática: contenido, blame y diff de cada archivo dentro del propio HTML. */
function embedFiles(root, world, hist) {
  const files = {}; let total = 0;
  for (const n of world.nodes) {
    if (n.kind !== 'file') continue;
    let text; try { text = readFileSync(join(root, n.id), 'utf8'); } catch { continue; }
    if (text.length > 60000 || total + text.length > 3_000_000) continue; total += text.length;
    const f = { text };
    if (hist) { const b = readBlame(root, n.id); if (b) f.blame = b; if (n.git?.status === 'modified') f.diff = readDiff(root, n.id); }
    files[n.id] = f;
  }
  world.files = files;
}
