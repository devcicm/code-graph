// code-graph · lib/dupes.mjs — detección de duplicación (DRY) sin dependencias
//
//  1. tokeniza (comentarios, cadenas, plantillas y regex fuera de juego)
//  2. extrae funciones, flechas y métodos con su rango de líneas
//  3. clones exactos/parametrizados por hash del cuerpo normalizado
//  4. casi-clones: fragmentos (shingles) de 5 tokens + índice invertido + Jaccard
//     – los fragmentos que aparecen en demasiadas funciones se descartan (boilerplate)
//     – solo se comparan funciones que comparten fragmentos raros (evita O(n²))
//  5. constantes mágicas repetidas y funciones con el mismo nombre en archivos distintos
// El costo (co-cambio, autores) se calcula después, en metrics.mjs, con el historial de git.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KW = new Set('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield await async get set null undefined true false'.split(' '));
const NOT_METHOD = new Set('if for while switch catch function return typeof await with super import export'.split(' '));
const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const TRIVIAL_STR = new Set(['function', 'string', 'object', 'number', 'boolean', 'undefined', 'symbol', 'bigint', 'utf8', 'utf-8', 'error', 'close', 'data', 'end', 'true', 'false', 'null', 'default', 'GET', 'POST']);
const TRIVIAL_NUM = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 20, 24, 30, 32, 50, 60, 64, 100, 127, 128, 200, 255, 256, 360, 404, 500, 1000, 1024, -1, -2]);
const COMMON_NAMES = new Set(['constructor', 'default', 'handler', 'render', 'init', 'main', 'run', 'test', 'setup', 'teardown', 'toString', 'toJSON', 'create', 'update', 'delete', 'remove', 'index', 'handle', 'start', 'stop', 'build', 'get', 'set', 'then', 'catch', 'callback', 'validate', 'format']);
const RX_ID = /[\p{L}_$][\p{L}\p{N}_$]*/uy, RX_NUM = /(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?|\.\d+)n?/y;
const RX_OP = /=>|===|!==|\.\.\.|\*\*=?|<<=?|>>>?=?|&&=?|\|\|=?|\?\?=?|\?\.|[-+*/%&|^<>!=]=?|\+\+|--|[\s\S]/y;

// ───────────── tokenizador ─────────────
export function tokenize(src) {
  const T = []; let i = 0, line = 1; const n = src.length;
  const prevSig = () => T[T.length - 1];
  const regexOk = () => { const p = prevSig(); if (!p) return true; if (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 're') return false; if (p.t === 'id') return false; if (p.t === 'kw') return !['this', 'super', 'null', 'true', 'false', 'undefined'].includes(p.v); return !(p.v === ')' || p.v === ']' || p.v === '}'); };
  const skipTpl = (j) => { // j apunta justo después del ` ; devuelve el índice tras el ` de cierre
    while (j < n) { const c = src[j]; if (c === '\\') { j += 2; continue; } if (c === '`') return j + 1; if (c === '$' && src[j + 1] === '{') { j += 2; let d = 1; while (j < n && d) { const x = src[j]; if (x === '{') d++; else if (x === '}') d--; else if (x === '`') { j = skipTpl(j + 1) - 1; } else if (x === '"' || x === "'") { j = skipStr(j) - 1; } j++; } continue; } j++; }
    return j;
  };
  const skipStr = (j) => { const q = src[j]; j++; while (j < n && src[j] !== q && src[j] !== '\n') { if (src[j] === '\\') j++; j++; } return j + 1; };
  const push = (t, v, from, to) => { T.push({ t, v, line }); for (let k = from; k < to; k++) if (src[k] === '\n') line++; };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2), end = e < 0 ? n : e + 2; for (let k = i; k < end; k++) if (src[k] === '\n') line++; i = end; continue; }
    if (c === '"' || c === "'") { const e = skipStr(i); push('str', src.slice(i + 1, e - 1), i, e); i = e; continue; }
    if (c === '`') { const e = skipTpl(i + 1); const startLine = line; push('tpl', src.slice(i, e), i, e); T[T.length - 1].line = startLine; i = e; continue; }
    if (c === '/' && regexOk()) { let j = i + 1, cls = false; while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; } j++; while (/[a-z]/i.test(src[j] || '')) j++; push('re', src.slice(i, j), i, j); i = j; continue; }
    RX_ID.lastIndex = i; let m = RX_ID.exec(src);
    if (m) { push(KW.has(m[0]) ? 'kw' : 'id', m[0], i, i + m[0].length); i += m[0].length; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) { RX_NUM.lastIndex = i; m = RX_NUM.exec(src); if (m) { push('num', m[0], i, i + m[0].length); i += m[0].length; continue; } }
    RX_OP.lastIndex = i; m = RX_OP.exec(src); push('p', m[0], i, i + m[0].length); i += m[0].length;
  }
  return T;
}

function pairBrackets(T) {
  const match = new Array(T.length).fill(-1), st = [];
  const open = { '(': ')', '[': ']', '{': '}' };
  T.forEach((tk, i) => {
    if (tk.t !== 'p') return;
    if (open[tk.v]) st.push(i);
    else if (tk.v === ')' || tk.v === ']' || tk.v === '}') { const j = st.pop(); if (j != null) { match[j] = i; match[i] = j; } }
  });
  return match;
}

// ───────────── unidades (funciones, flechas, métodos) ─────────────
export function extractUnits(T) {
  const match = pairBrackets(T), units = [], seen = new Set();
  const add = (from, to, name, kind, openParen) => {
    if (to <= from || to >= T.length) return; const key = from + ':' + to; if (seen.has(key)) return; seen.add(key);
    let params = 0; if (openParen != null && match[openParen] > openParen + 1) { let d = 0; params = 1; for (let k = openParen + 1; k < match[openParen]; k++) { const v = T[k].t === 'p' ? T[k].v : ''; if (v === '(' || v === '[' || v === '{') d++; else if (v === ')' || v === ']' || v === '}') d--; else if (v === ',' && d === 0) params++; } }
    units.push({ from, to, name, kind, params, startLine: T[from].line, endLine: T[to].line });
  };
  const nameBefore = (s) => { const a = T[s - 1], b = T[s - 2]; if (a && a.v === '=' && b && (b.t === 'id' || b.t === 'kw')) return b.v; if (a && a.v === ':' && b && (b.t === 'id' || b.t === 'str')) return b.v; return null; };
  for (let i = 0; i < T.length; i++) {
    const tk = T[i];
    if (tk.t === 'kw' && tk.v === 'function') {
      let j = i + 1; if (T[j] && T[j].v === '*') j++;
      let name = null; if (T[j] && T[j].t === 'id') { name = T[j].v; j++; }
      if (!T[j] || T[j].v !== '(' || match[j] < 0) continue;
      let k = match[j] + 1; if (T[k] && T[k].v === ':') { while (k < T.length && T[k].v !== '{') k++; }
      if (T[k] && T[k].v === '{' && match[k] > 0) add(i, match[k], name || nameBefore(i) || '(anónima)', 'function', j);
    } else if (tk.t === 'p' && tk.v === '=>') {
      let s, open = null;
      if (T[i - 1] && T[i - 1].v === ')' && match[i - 1] >= 0) { s = match[i - 1]; open = s; } else if (T[i - 1] && T[i - 1].t === 'id') s = i - 1; else continue;
      const asyncKw = T[s - 1] && T[s - 1].v === 'async' ? s - 1 : s;
      let end;
      if (T[i + 1] && T[i + 1].v === '{' && match[i + 1] > 0) end = match[i + 1];
      else { let d = 0, k = i + 1; for (; k < T.length; k++) { const v = T[k].t === 'p' ? T[k].v : ''; if (v === '(' || v === '[' || v === '{') d++; else if (v === ')' || v === ']' || v === '}') { if (d === 0) break; d--; } else if ((v === ';' || v === ',') && d === 0) break; } end = k - 1; }
      add(asyncKw, end, nameBefore(asyncKw) || '(anónima)', nameBefore(asyncKw) ? 'function' : 'callback', open);
    } else if (tk.t === 'id' && T[i + 1] && T[i + 1].v === '(' && match[i + 1] > 0 && !NOT_METHOD.has(tk.v)) {
      const k = match[i + 1] + 1;
      if (T[k] && T[k].v === '{' && match[k] > 0) { const p = T[i - 1]; if (!p || p.v === '{' || p.v === '}' || p.v === ';' || p.v === ',' || (p.t === 'kw' && ['static', 'async', 'get', 'set'].includes(p.v)) || p.v === '*') add(p && p.t === 'kw' && ['static', 'async', 'get', 'set'].includes(p.v) ? i - 1 : i, match[k], tk.v, 'method', i + 1); }
    }
  }
  return units;
}


// ───────────── otros lenguajes (llaves o indentación) ─────────────
const GEN_EXT = { cs: 'brace', java: 'brace', kt: 'brace', kts: 'brace', go: 'brace', rs: 'brace', php: 'brace', c: 'brace', h: 'brace', cc: 'brace', cpp: 'brace', hpp: 'brace', swift: 'brace', scala: 'brace', dart: 'brace', py: 'indent' };
const GEN_KW = new Set('abstract as async await base bool break byte case catch char class const continue def default defer delete do double else elif enum except extends fn false final finally float for foreach from func function go goto if impl implements import in int interface internal is lambda let lock long match mod mut namespace new nil none null object override package pass private protected pub public raise readonly ref return sealed self short static string struct super switch this throw throws trait true try type typeof unsafe use using val var virtual void volatile when where while with yield'.split(' '));
const GEN_NOT_FN = new Set('if for while switch catch foreach using lock when elif return sizeof typeof nameof new fixed synchronized else with match await throw defer go func fn def'.split(' '));
export function tokenizeGeneric(src, ext) {
  const T = [], n = src.length, hash = ext === 'py'; let i = 0, line = 1;
  const nl = (a, b) => { for (let k = a; k < b; k++) if (src[k] === '\n') line++; };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (hash ? c === '#' : (c === '/' && src[i + 1] === '/')) { while (i < n && src[i] !== '\n') i++; continue; }
    if (!hash && c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2), end = e < 0 ? n : e + 2; nl(i, end); i = end; continue; }
    if ((c === '"' || c === "'") && src.startsWith(c.repeat(3), i) && (hash || c === '"')) { const e = src.indexOf(c.repeat(3), i + 3), end = e < 0 ? n : e + 3; T.push({ t: 'str', v: src.slice(i + 3, end - 3), line }); nl(i, end); i = end; continue; }
    if (c === "'" && ext === 'rs' && !(src[i + 2] === "'" || src[i + 1] === '\\')) { T.push({ t: 'p', v: "'", line }); i++; continue; }
    if (c === '"' || c === "'" || (c === '`' && ext === 'go')) { let j = i + 1; while (j < n && src[j] !== c && (c === '`' || src[j] !== '\n')) { if (src[j] === '\\' && c !== '`') j++; j++; } T.push({ t: 'str', v: src.slice(i + 1, j), line }); nl(i, j + 1); i = j + 1; continue; }
    RX_ID.lastIndex = i; let m = RX_ID.exec(src);
    if (m) { T.push({ t: GEN_KW.has(m[0]) ? 'kw' : 'id', v: m[0], line }); i += m[0].length; continue; }
    if (/[0-9]/.test(c)) { RX_NUM.lastIndex = i; m = RX_NUM.exec(src); if (m) { T.push({ t: 'num', v: m[0], line }); i += m[0].length; continue; } }
    RX_OP.lastIndex = i; m = RX_OP.exec(src); T.push({ t: 'p', v: m[0], line }); i += m[0].length;
  }
  return T;
}
export function extractUnitsGeneric(T, ext, src) {
  const units = [];
  if (GEN_EXT[ext] === 'indent') {
    const lines = src.split('\n'), ind = (l) => lines[l - 1].match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
    for (let i = 0; i < T.length - 2; i++) {
      if (!(T[i].t === 'kw' && T[i].v === 'def' && T[i + 1].t === 'id' && T[i + 2].v === '(')) continue;
      const start = T[i].line, base = ind(start); let end = start;
      for (let l = start + 1; l <= lines.length; l++) { if (!lines[l - 1].trim()) continue; if (ind(l) <= base) break; end = l; }
      let to = i; while (to + 1 < T.length && T[to + 1].line <= end) to++;
      const from = T[i - 1] && T[i - 1].v === 'async' ? i - 1 : i;
      units.push({ from, to, name: T[i + 1].v, kind: 'function', params: 0, startLine: start, endLine: T[to].line });
    }
    return units;
  }
  const match = pairBrackets(T);
  for (let i = 1; i < T.length; i++) {
    if (T[i].v !== '(' || match[i] < 0 || !(T[i - 1].t === 'id' || (T[i - 1].t === 'kw' && ['init', 'constructor'].includes(T[i - 1].v)))) continue;
    const nm = T[i - 1].v; if (GEN_NOT_FN.has(nm) || (T[i - 2] && (T[i - 2].v === 'new' || T[i - 2].v === '.'))) continue;
    let k = match[i] + 1, steps = 0, open = -1;
    while (k < T.length && steps++ < 16) { const v = T[k].v; if (v === '{') { open = k; break; } if (v === ';' || v === '}' || v === '=' || v === ',') break; k++; }
    if (open < 0 || match[open] < 0) continue;
    // incluir modificadores/tipo de retorno de la misma línea
    let from = i - 1; while (from > 0 && T[from - 1].line === T[i - 1].line && T[from - 1].v !== '{' && T[from - 1].v !== '}' && T[from - 1].v !== ';' && i - from < 6) from--;
    units.push({ from, to: match[open], name: nm, kind: 'function', params: match[i] > i + 1 ? 1 : 0, startLine: T[from].line, endLine: T[match[open]].line });
  }
  return units;
}

// ───────────── utilidades ─────────────
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function normalize(T, from, to) {
  const norm = [], raw = [];
  for (let i = from; i <= to; i++) {
    const t = T[i], prev = T[i - 1];
    raw.push(t.t === 'str' ? '"' + t.v : t.v);
    if (t.t === 'id') norm.push(prev && (prev.v === '.' || prev.v === '?.') ? t.v : 'I');
    else if (t.t === 'str') norm.push('S'); else if (t.t === 'num') norm.push('N'); else if (t.t === 'tpl') norm.push('T'); else if (t.t === 're') norm.push('R'); else norm.push(t.v);
  }
  return { norm, raw };
}
class DSU { constructor(n) { this.p = Array.from({ length: n }, (_, i) => i); } f(x) { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; } u(a, b) { a = this.f(a); b = this.f(b); if (a !== b) this.p[b] = a; } }

/**
 * files: [{ id, isTest }]   root: carpeta del proyecto
 * opts: { minTokens=40, minLines=5, threshold=0.8, k=5, maxDF, exclude:[regex strings], magic=true }
 */
export function detectDuplicates(root, files, opts = {}) {
  const minTokens = opts.minTokens ?? 40, minLines = opts.minLines ?? 5, threshold = opts.threshold ?? 0.8, K = opts.k ?? 5;
  const exclude = (opts.exclude || []).map((r) => new RegExp(r));
  const units = [], literals = [], defs = [];
  let nFiles = 0;
  for (const f of files) {
    const ext = f.id.split('.').pop().toLowerCase(), isGen = !CODE_EXT.test(f.id) && GEN_EXT[ext];
    if ((!CODE_EXT.test(f.id) && !isGen) || exclude.some((r) => r.test(f.id)) || f.gen || f.aux) continue;
    let src; try { src = readFileSync(join(root, f.id), 'utf8'); } catch { continue; }
    if (src.length > 400000) continue; nFiles++;
    const T = isGen ? tokenizeGeneric(src, ext) : tokenize(src);
    for (const u of isGen ? extractUnitsGeneric(T, ext, src) : extractUnits(T)) {
      const loc = u.endLine - u.startLine + 1, len = u.to - u.from + 1;
      if (len < minTokens || loc < minLines) continue;
      // funciones triviales: una sola sentencia "return …;" sin lógica
      const { norm, raw } = normalize(T, u.from, u.to);
      units.push({ file: f.id, isTest: !!f.isTest, name: u.name, kind: u.kind, params: u.params, start: u.startLine, end: u.endLine, loc, len, norm, hash: fnv(norm.join(' ')), rawHash: fnv(raw.join(' ')) });
    }
    if (opts.magic !== false) {
      const skipIdx = new Set(); // cadenas de bloques `import (...)` / `import "x"` (Go, etc.)
      for (let i = 0; i < T.length; i++) if (T[i].t === 'kw' && T[i].v === 'import') { if (T[i + 1]?.v === '(') { let j = i + 2; while (j < T.length && T[j].v !== ')') skipIdx.add(j++); } else { skipIdx.add(i + 1); skipIdx.add(i + 2); } }
      for (let i = 0; i < T.length; i++) {
        if (skipIdx.has(i)) continue;
        const t = T[i], p = T[i - 1], q = T[i - 2], r = T[i - 3], nx = T[i + 1];
        if (t.t !== 'num' && t.t !== 'str') continue;
        if (t.t === 'str' && (p && (p.v === 'from' || p.v === 'import' || (p.v === '(' && q && (q.v === 'require' || q.v === 'import'))))) continue;
        if (p && p.v === '(' && q && q.t === 'kw' && q.v === 'import') continue;
        if (t.t === 'str' && (t.v.length < 4 || TRIVIAL_STR.has(t.v) || /^\.{0,2}\//.test(t.v) || /^node:/.test(t.v) || t.v === 'use strict' || /^[\w-]+$/.test(t.v) && t.v.length < 6)) continue;
        if (t.t === 'str' && nx && nx.v === ':') continue; // clave de objeto
        let val; if (t.t === 'num') { val = Number(t.v.replace(/_/g, '').replace(/n$/, '')); if (!Number.isFinite(val) || TRIVIAL_NUM.has(val) || TRIVIAL_NUM.has(-val)) continue; if (p && p.v === '-') val = -val; } else val = t.v;
        const lit = { key: (t.t === 'num' ? 'n:' : 's:') + val, value: t.t === 'num' ? t.v : t.v, kind: t.t, file: f.id, line: t.line, isTest: !!f.isTest };
        if (p && p.v === '=' && q && q.t === 'id' && r && r.t === 'kw' && r.v === 'const') defs.push({ ...lit, name: q.v });
        else literals.push(lit);
      }
    }
  }

  // ── clones de funciones ──
  const dsu = new DSU(units.length), byHash = new Map();
  units.forEach((u, i) => (byHash.get(u.hash) || byHash.set(u.hash, []).get(u.hash)).push(i));
  for (const g of byHash.values()) for (let k = 1; k < g.length; k++) dsu.u(g[0], g[k]);
  const reps = [...byHash.values()].map((g) => g[0]);
  const shingles = new Map(); // repIdx -> Set
  for (const ri of reps) { const s = new Set(), nm = units[ri].norm; for (let k = 0; k + K <= nm.length; k++) s.add(fnv(nm.slice(k, k + K).join(' '))); shingles.set(ri, s); }
  const index = new Map(); for (const [ri, s] of shingles) for (const h of s) (index.get(h) || index.set(h, []).get(h)).push(ri);
  const maxDF = opts.maxDF ?? Math.max(8, Math.ceil(reps.length * 0.2));
  const rare = new Map(); // repIdx -> shingles raros
  for (const [ri, s] of shingles) rare.set(ri, new Set([...s].filter((h) => index.get(h).length <= maxDF)));
  const simOf = new Map(); // "a|b" -> similitud
  const cand = new Map();
  for (const [h, list] of index) { if (list.length < 2 || list.length > maxDF) continue; for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) { const k = list[a] < list[b] ? list[a] + '|' + list[b] : list[b] + '|' + list[a]; cand.set(k, (cand.get(k) || 0) + 1); } }
  for (const [k, shared] of cand) {
    const [a, b] = k.split('|').map(Number), A = rare.get(a), B = rare.get(b);
    if (A.size < 10 || B.size < 10 || shared < 0.5 * Math.min(A.size, B.size)) continue;
    const ua = units[a], ub = units[b];
    if (ua.file === ub.file && ua.start <= ub.end && ub.start <= ua.end) continue; // anidadas / solapadas
    let inter = 0; for (const h of A) if (B.has(h)) inter++;
    const sim = inter / (A.size + B.size - inter);
    if (sim >= threshold) { dsu.u(a, b); simOf.set(k, sim); }
  }
  const comps = new Map(); units.forEach((_, i) => (comps.get(dsu.f(i)) || comps.set(dsu.f(i), []).get(dsu.f(i))).push(i));
  const groups = [];
  for (const members of comps.values()) {
    if (members.length < 2) continue;
    // fuera las unidades anidadas dentro de otra del mismo grupo y archivo
    const keep = members.length > 60 ? members : members.filter((i) => !members.some((j) => j !== i && units[j].file === units[i].file && units[j].start <= units[i].start && units[j].end >= units[i].end && (units[j].end - units[j].start > units[i].end - units[i].start)));
    if (keep.length < 2) continue;
    const us = keep.map((i) => units[i]);
    const exact = us.every((u) => u.rawHash === us[0].rawHash), param = us.every((u) => u.hash === us[0].hash);
    let minSim = 1; if (!param) { const root = dsu.f(members[0]); for (const [k, v] of simOf) { const [x] = k.split('|').map(Number); if (dsu.f(x) === root) minSim = Math.min(minSim, v); } }
    const names = {}; us.forEach((u) => { if (u.name !== '(anónima)') names[u.name] = (names[u.name] || 0) + 1; });
    const name = Object.entries(names).sort((a, b) => b[1] - a[1])[0]?.[0] || '(anónima)';
    groups.push({ kind: 'function', name, type: exact ? 'exacto' : param ? 'parametrizado' : 'similar', sim: Math.round(minSim * 100) / 100,
      lines: Math.round(us.reduce((s, u) => s + u.loc, 0) / us.length), tokens: Math.round(us.reduce((s, u) => s + u.len, 0) / us.length),
      test: us.every((u) => u.isTest), units: us.map((u) => ({ file: u.file, name: u.name, start: u.start, end: u.end, loc: u.loc, params: u.params, test: u.isTest })).sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.start - b.start)) });
  }

  // ── constantes mágicas ──
  const constants = [];
  const lm = new Map(); for (const l of literals) if (!l.isTest) (lm.get(l.key) || lm.set(l.key, []).get(l.key)).push(l);
  for (const [key, occ] of lm) {
    const fs = new Set(occ.map((o) => o.file)); if (occ.length < 3 || fs.size < 2) continue;
    const def = defs.find((d) => d.key === key);
    constants.push({ value: occ[0].value, kind: occ[0].kind, count: occ.length, files: fs.size, existing: def ? { file: def.file, name: def.name, line: def.line } : null, at: occ.slice(0, 12).map((o) => ({ file: o.file, line: o.line })) });
  }
  constants.sort((a, b) => b.files - a.files || b.count - a.count);

  // ── homónimos (mismo nombre, archivos distintos, sin ser clones entre sí) ──
  const grouped = new Set(); groups.forEach((g) => g.units.forEach((u) => grouped.add(u.file + ':' + u.start)));
  const byName = new Map();
  for (const u of units) { if (u.isTest || u.name === '(anónima)' || u.name.length < 5 || COMMON_NAMES.has(u.name) || u.kind === 'callback' || grouped.has(u.file + ':' + u.start)) continue; (byName.get(u.name) || byName.set(u.name, []).get(u.name)).push(u); }
  const names = [];
  for (const [name, us] of byName) { const fs = new Set(us.map((u) => u.file)); if (fs.size >= 2) names.push({ name, params: [...new Set(us.map((u) => u.params))], units: us.map((u) => ({ file: u.file, start: u.start, end: u.end, loc: u.loc, params: u.params })) }); }
  names.sort((a, b) => b.units.length - a.units.length);

  return { groups, constants, names, stats: { files: nFiles, units: units.length, threshold, minTokens, minLines } };
}
