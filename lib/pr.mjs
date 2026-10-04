// code-graph · lib/pr.mjs — resumen de riesgo de un cambio frente a una rama/commit base (para PR o revisión)
// Compara el árbol de trabajo actual con <base>: usa guard.check (estructura) y guard.plan (qué probar y quién revisa).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSnapshot } from './snapshot.mjs';
import { plan, fingerprint, check } from './guard.mjs';

const git = (root, args, opts = {}) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], ...opts });

/** foto estructural del proyecto tal como estaba en <ref> (se extrae a una carpeta temporal) */
export function baseFingerprint(root, ref) {
  const tmp = mkdtempSync(join(tmpdir(), 'cg-base-'));
  try {
    const archive = spawnSync('git', ['-C', root, 'archive', ref], { maxBuffer: 1 << 28 });
    if (archive.error) throw archive.error;
    const tar = spawnSync('tar', ['-xf', '-', '-C', tmp], { input: archive.stdout, stdio: ['pipe', 'ignore', 'pipe'] });
    if (tar.error) throw tar.error;
    return fingerprint(buildSnapshot(tmp, { git: false, externals: false }));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
/** archivos cambiados respecto a <ref> (incluye lo que aún no está en commit) → { A:[], M:[], D:[] } */
export function changedSince(root, ref) {
  const out = { A: [], M: [], D: [] };
  for (const l of git(root, ['diff', '--name-status', '-M', ref]).split('\n').filter(Boolean)) {
    const [s, a, b] = l.split('\t'); const k = s[0];
    if (k === 'R') { out.D.push(a); out.A.push(b); } else if (out[k]) out[k].push(a);
  }
  for (const f of git(root, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) out.A.push(f);
  return out;
}

export function review(root, ref = 'HEAD', world = null) {
  const w = world || buildSnapshot(root, { externals: false }), base = baseFingerprint(root, ref), ch = changedSince(root, ref);
  const known = new Set(w.nodes.filter((n) => n.kind === 'file').map((n) => n.id));
  const touched = [...ch.A, ...ch.M].filter((f) => known.has(f)), res = check(base, buildSnapshot(root, { git: false, externals: false })), // misma medida a ambos lados: la base no trae historial, así que se compara sin él
     p = plan(w, ch.M.filter((f) => known.has(f)));
  const must = res.data.issues.filter((i) => i.sev === 'revisar'), cyc = must.some((i) => /Ciclo|generado/.test(i.text));
  const level = cyc || must.length >= 3 ? 'alto' : must.length ? 'medio' : 'bajo';
  const byId = new Map(w.nodes.map((n) => [n.id, n]));
  const owners = new Map(); for (const f of p.data.files) if (f.known && f.owner) owners.set(f.owner, (owners.get(f.owner) || 0) + 1);
  const L = [`## Riesgo del cambio: **${level}**`, '', `Frente a \`${ref}\`: ${ch.A.length} nuevo(s), ${ch.M.length} modificado(s), ${ch.D.length} borrado(s).`];
  if (touched.length) { L.push('', '### Archivos', ...touched.slice(0, 15).map((f) => { const n = byId.get(f); return `- \`${f}\` — riesgo ${n.risk?.score ?? 0}${n.gen ? ' · generado' : ''}${n.fanIn ? ` · lo usan ${n.fanIn}` : ''}${ch.A.includes(f) ? ' · nuevo' : ''}`; })); }
  if (must.length) L.push('', '### Qué revisar', ...must.map((i) => `- ${i.text}`));
  else L.push('', '### Qué revisar', '- No se detectaron empeoramientos estructurales.');
  const notes = res.data.issues.filter((i) => i.sev === 'nota').slice(0, 6); if (notes.length) L.push('', '### Notas', ...notes.map((i) => `- ${i.text}`));
  if (p.data.warnings.length) L.push('', '### Avisos de los archivos modificados', ...p.data.warnings.slice(0, 8).map((x) => `- ${x}`));
  L.push('', '### Pruebas a correr', ...(p.data.tests.length ? p.data.tests.slice(0, 12).map((t) => `- \`${t.id}\` — ${t.why}`) : ['- Ninguna conocida para los archivos modificados.']));
  if (owners.size) L.push('', '### Quién debería revisar', ...[...owners].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([o, n]) => `- ${o} (conoce ${n} de los archivos modificados)`));
  if (res.data.resolved) L.push('', `✔ ${res.data.resolved} problema(s) previos ya no están.`);
  if (res.data.healthDelta != null) L.push('', `Salud del proyecto: ${res.data.healthDelta >= 0 ? '+' : ''}${res.data.healthDelta}.`);
  L.push('', '_Análisis estructural (imports, ciclos, duplicación, pruebas): no ejecuta el código ni sustituye a las pruebas._');
  return { level, markdown: L.join('\n'), changed: ch, issues: res.data.issues };
}
