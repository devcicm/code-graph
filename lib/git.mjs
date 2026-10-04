// code-graph · lib/git.mjs
// Lectura de git sin dependencias: historial (con renombres), estado del árbol de trabajo,
// blame por línea y diff. Todo degrada con elegancia si la carpeta no es un repositorio.
import { execFileSync } from 'node:child_process';

const run = (cwd, args, opts = {}) =>
  execFileSync('git', ['-c', 'safe.directory=*', '-c', 'core.quotepath=off', ...args], { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], ...opts });
const tryRun = (cwd, args) => { try { return run(cwd, args); } catch { return null; } };

export function repoInfo(root) {
  if (tryRun(root, ['rev-parse', '--is-inside-work-tree'])?.trim() !== 'true') return null;
  const prefix = (tryRun(root, ['rev-parse', '--show-prefix']) || '').trim();
  const head = (tryRun(root, ['rev-parse', 'HEAD']) || '').trim();
  const branch = (tryRun(root, ['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim();
  return { prefix, head, branch, hasCommits: !!head };
}

/** Historial completo (más antiguo → más reciente) con seguimiento de renombres. */
export function readHistory(root, { max = 5000 } = {}) {
  const info = repoInfo(root); if (!info || !info.hasCommits) return null;
  const SEP = '\x1f';
  const fmt = `@@%H${SEP}%an${SEP}%aI${SEP}%s`;
  const ns = run(root, ['log', '--reverse', '--name-status', '-M', '--relative', `--max-count=${max}`, `--format=${fmt}`, '--', '.']);
  const nu = run(root, ['log', '--reverse', '--numstat', '--no-renames', '--relative', `--max-count=${max}`, '--format=@@%H', '--', '.']);

  const nums = new Map(); // hash -> Map(path -> [add, del])
  let cur = null;
  for (const ln of nu.split('\n')) {
    if (ln.startsWith('@@')) { cur = new Map(); nums.set(ln.slice(2), cur); continue; }
    const m = ln.match(/^(\d+|-)\t(\d+|-)\t(.+)$/); if (m && cur) cur.set(m[3], [m[1] === '-' ? 0 : +m[1], m[2] === '-' ? 0 : +m[2]]);
  }

  const commits = [], live = new Map(); // path -> rec
  const authors = new Map();
  let c = null;
  const newRec = (path, idx) => ({ path, born: idx, alive: true, commitIdx: [], dates: [], authors: new Map(), add: 0, del: 0, net: [], firstDate: null, lastDate: null });
  const touch = (rec, commit, nums_) => {
    if (!rec.commitIdx.length || rec.commitIdx[rec.commitIdx.length - 1] !== commit.i) {
      rec.commitIdx.push(commit.i); rec.dates.push(commit.t);
      rec.authors.set(commit.author, (rec.authors.get(commit.author) || 0) + 1);
      rec.firstDate ??= commit.date; rec.lastDate = commit.date;
    }
    if (nums_) { commit.add += nums_[0]; commit.del += nums_[1]; rec.add += nums_[0]; rec.del += nums_[1]; const prev = rec.net.length ? rec.net[rec.net.length - 1][1] : 0; rec.net.push([commit.i, Math.max(0, prev + nums_[0] - nums_[1])]); }
    commit.recs.add(rec);
  };

  for (const ln of ns.split('\n')) {
    if (ln.startsWith('@@')) {
      const [hash, author, date, msg] = ln.slice(2).split(SEP);
      c = { i: commits.length, hash, author, date, t: Date.parse(date), msg, recs: new Set(), added: new Set(), removed: new Set(), add: 0, del: 0 };
      commits.push(c); authors.set(author, (authors.get(author) || 0) + 1); continue;
    }
    if (!ln || !c) continue;
    const parts = ln.split('\t'); const st = parts[0][0]; const n = nums.get(c.hash);
    if (st === 'R' || st === 'C') {
      const [, from, to] = parts; let rec = live.get(from);
      if (st === 'R' && rec) { live.delete(from); rec.path = to; live.set(to, rec); rec.renamedFrom = (rec.renamedFrom || []).concat(from); }
      else { rec = newRec(to, c.i); live.set(to, rec); }
      touch(rec, c, null);
    } else if (st === 'D') {
      const rec = live.get(parts[1]); if (rec) { rec.alive = false; live.delete(parts[1]); c.removed.add(rec); }
    } else {
      const path = parts[1]; let rec = live.get(path);
      if (!rec) { rec = newRec(path, c.i); live.set(path, rec); c.added.add(rec); }
      touch(rec, c, n?.get(path));
    }
  }
  return {
    info, commits, files: live, authors: [...authors].map(([name, n]) => ({ name, commits: n })).sort((a, b) => b.commits - a.commits),
  };
}

/** Estado del árbol de trabajo: ruta (relativa a root) -> 'modified' | 'untracked' | 'added'. */
export function readStatus(root) {
  const info = repoInfo(root); if (!info) return new Map();
  const out = tryRun(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', '.']) || '';
  const m = new Map();
  for (const ln of out.split('\n')) {
    if (ln.length < 4) continue;
    const xy = ln.slice(0, 2); let p = ln.slice(3); if (p.includes(' -> ')) p = p.split(' -> ')[1];
    p = p.replace(/^"|"$/g, ''); if (info.prefix && p.startsWith(info.prefix)) p = p.slice(info.prefix.length);
    m.set(p, xy === '??' ? 'untracked' : xy[0] === 'A' ? 'added' : xy.includes('D') ? 'deleted' : 'modified');
  }
  return m;
}

/** Autoría y antigüedad por línea. */
export function readBlame(root, rel) {
  const out = tryRun(root, ['blame', '-w', '--line-porcelain', '--', rel]); if (out == null) return null;
  const authors = [], a = [], t = []; let curA = '', curT = 0;
  for (const ln of out.split('\n')) {
    if (ln.startsWith('author ')) curA = ln.slice(7);
    else if (ln.startsWith('author-time ')) curT = +ln.slice(12);
    else if (ln.startsWith('\t')) { let ix = authors.indexOf(curA); if (ix < 0) ix = authors.push(curA) - 1; a.push(ix); t.push(curT); }
  }
  return { authors, a, t };
}

export const readDiff = (root, rel) => tryRun(root, ['diff', 'HEAD', '--no-color', '--', rel]) || '';

export const headKey = (root) => repoInfo(root)?.head || null;
