// code-graph · languages/javascript.mjs — adaptador de JavaScript / TypeScript (ESM, CommonJS, import dinámico)
import { join, resolve, dirname } from 'node:path';

const CODE_EXT = ['.mjs', '.js', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'];
// ───────────────────────── 2. limpiar comentarios ─────────────────────────
// Devuelve el código sin comentarios (conservando saltos de línea) y los
// comentarios aparte, para leer las anotaciones @rel.
function splitComments(src) {
  let code = '', comments = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = i; while (j < n && src[j] !== '\n') j++;
      comments.push({ text: src.slice(i + 2, j), line });
      i = j;
    } else if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2); if (j < 0) j = n - 2;
      const text = src.slice(i + 2, j);
      comments.push({ text, line });
      const nl = (text.match(/\n/g) || []).length;
      code += '\n'.repeat(nl); line += nl; i = j + 2;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') line++; j++; }
      code += src.slice(i, j + 1); i = j + 1;
    } else { if (c === '\n') line++; code += c; i++; }
  }
  return { code, comments };
}

// ───────────────────────── 3. extraer imports / exports ─────────────────────────
const lineOf = (code, idx) => code.slice(0, idx).split('\n').length;

function parseClause(clause) {
  // "a, { b as c, d }" | "* as ns" | "{ x }" | "a"
  const names = []; // {name, local}
  let m;
  if ((m = clause.match(/\*\s+as\s+([\w$]+)/))) names.push({ name: '*', local: m[1] });
  const braces = clause.match(/\{([^}]*)\}/);
  if (braces) {
    for (const part of braces[1].split(',')) {
      const t = part.trim().replace(/^type\s+/, ''); if (!t) continue;
      const [name, , local] = t.split(/\s+(as)\s+/).length === 3 ? t.split(/\s+(as)\s+/) : [t, null, t];
      names.push({ name: name.trim(), local: (local || name).trim() });
    }
  }
  const def = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+[\w$]+/, '').replace(/,/g, ' ').trim();
  if (def && /^[\w$]+$/.test(def)) names.unshift({ name: 'default', local: def });
  return names;
}

function parseFile(code) {
  const imports = [];
  let m;
  const rxImport = /(^|[;\n}])\s*import\s+(type\s+)?([^'"()]*?)\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = rxImport.exec(code))) imports.push({ kind: 'import', spec: m[4], names: parseClause(m[3]), line: lineOf(code, m.index + m[1].length) });
  const rxSide = /(^|[;\n}])\s*import\s*['"]([^'"]+)['"]/g;
  while ((m = rxSide.exec(code))) imports.push({ kind: 'import', spec: m[2], names: [], line: lineOf(code, m.index), side: true });
  const rxRe = /(^|[;\n}])\s*export\s+(type\s+)?(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = rxRe.exec(code))) imports.push({ kind: 'reexport', spec: m[4], names: m[3].startsWith('*') ? [{ name: '*', local: '' }] : parseClause(m[3]).map((x) => ({ name: x.name, local: '' })), line: lineOf(code, m.index) });
  const rxDyn = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = rxDyn.exec(code))) imports.push({ kind: 'dynamic', spec: m[1], names: [], line: lineOf(code, m.index) });
  const rxReq = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = rxReq.exec(code))) {
    const before = code.slice(Math.max(0, m.index - 80), m.index);
    const decl = before.match(/(?:const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*=\s*$/);
    imports.push({ kind: 'require', spec: m[1], names: decl ? parseClause(decl[1]).map((x) => (x.name === 'default' ? { name: 'default', local: x.local } : x)) : [], line: lineOf(code, m.index) });
  }

  const exports = new Set();
  const rxExp = /\bexport\s+(?:async\s+)?(?:default\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([\w$]+)/g;
  while ((m = rxExp.exec(code))) exports.add(m[1]);
  const rxList = /\bexport\s*\{([^}]*)\}(?!\s*from)/g;
  while ((m = rxList.exec(code))) for (const p of m[1].split(',')) { const t = p.trim().split(/\s+as\s+/).pop(); if (t) exports.add(t); }
  if (/\bexport\s+default\b/.test(code)) exports.add('default');
  // re-exports también cuentan como exports del archivo
  for (const im of imports) if (im.kind === 'reexport') for (const n of im.names) if (n.name !== '*') exports.add(n.name);
  return { imports, exports: [...exports] };
}

// definiciones de primer nivel con número de línea (para buscar y trazar símbolos)
function parseDefs(code, exportsList) {
  const ex = new Set(exportsList), defs = [];
  const rx = [
    [/^(export\s+)?(default\s+)?(async\s+)?function\*?\s+([\w$]+)/, 'function', 4],
    [/^(export\s+)?(default\s+)?(abstract\s+)?class\s+([\w$]+)/, 'class', 4],
    [/^(export\s+)?(const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(async\s*)?(\([^)]*\)|[\w$]+)\s*=>/, 'function', 3],
    [/^(export\s+)?(const|let|var)\s+([\w$]+)/, 'const', 3],
    [/^(export\s+)?(interface|type|enum)\s+([\w$]+)/, 'type', 3],
  ];
  code.split('\n').forEach((ln, i) => {
    for (const [r, kind, g] of rx) { const m = ln.match(r); if (m) { defs.push({ name: m[g], kind, line: i + 1, exported: !!m[1] || ex.has(m[g]) }); break; } }
  });
  return defs.slice(0, 80);
}
const isTestPath = (id) => /(^|\/)(tests?|__tests__|spec)\//i.test(id) || /\.(test|spec)\.[^.]+$/.test(id);

// ───────────────────────── 4. resolver rutas ─────────────────────────
function makeResolver(fileSet) {
  return function resolveSpec(fromFile, spec) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // paquete externo
    const base = resolve(dirname(fromFile), spec);
    const tries = [base, ...CODE_EXT.map((e) => base + e), ...CODE_EXT.map((e) => join(base, 'index' + e))];
    // import './x.js' en TS puede apuntar a x.ts
    if (/\.(m?js|cjs)$/.test(base)) tries.push(...CODE_EXT.map((e) => base.replace(/\.(m?js|cjs)$/, e)));
    return tries.find((t) => fileSet.has(t)) || null;
  };
}

// ───────────────────────── 5. referencias (cuántas veces se usa lo importado) ─────────────────────────
function countRefs(code, local) {
  if (!local) return 0;
  const esc = local.replace(/[$]/g, '\\$');
  const rx = new RegExp(`(?<![\\w$.])${esc}(?![\\w$])`, 'g');
  // quitar líneas de import/export-from para no contarlas como uso
  const body = code.replace(/^\s*(import|export)\b[^\n;]*?from\s*['"][^'"]+['"];?/gm, '');
  return (body.match(rx) || []).length;
}
function nsMembers(code, local) {
  const rx = new RegExp(`(?<![\\w$.])${local}\\.([\\w$]+)`, 'g');
  const set = new Map(); let m; while ((m = rx.exec(code))) set.set(m[1], (set.get(m[1]) || 0) + 1);
  return set;
}
const lines = (s) => s.split('\n').length;
const resolvers = new WeakMap();

/** Contrato de adaptador (ver PLAN.md · A2). parse() devuelve el modelo intermedio de un archivo. */
export default {
  id: 'javascript',
  name: 'JavaScript / TypeScript',
  exts: CODE_EXT,
  ignore: ['node_modules', 'dist', 'build', 'coverage', '.next', '.cache'],
  lexer: { line: ['//'], block: [['/*', '*/']], strings: ['"', "'", '`'], keywords: 'import export from default const let var function return if else for while do switch case break continue new class extends async await try catch finally throw typeof instanceof in of this super static get set yield null undefined true false interface type enum implements public private protected readonly abstract declare namespace module as is keyof'.split(' ') },
  relSyntax: '//',
  isTest: isTestPath,
  parse(raw) {
    const { code, comments } = splitComments(raw);
    const { imports, exports } = parseFile(code);
    return { code, comments, imports, exports, defs: parseDefs(code, exports), loc: code.split('\n').filter((l) => l.trim()).length, lines: lines(raw) };
  },
  /** Devuelve la ruta absoluta del archivo importado, o null si es un paquete externo / no resuelto. */
  resolve(spec, fromAbs, ctx) {
    let r = resolvers.get(ctx.fileSet); if (!r) { r = makeResolver(ctx.fileSet); resolvers.set(ctx.fileSet, r); }
    return r(fromAbs, spec);
  },
  countRefs, nsMembers,
};
