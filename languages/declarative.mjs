// code-graph · languages/declarative.mjs — motor declarativo: un lenguaje = un objeto de datos
//
// spec = {
//   id, name, exts[], ignore[], tests: [regex], relSyntax,
//   lexer: { line[], block[[ini,fin]], triple[], strings[], keywords[] },
//   imports: [{ re, flags?, kind?, spec: nº de grupo, names?: nº de grupo, namesStyle?: 'python'|'pyimport',
//               multi?: true, each?: { re, spec, alias }, resolve?: estrategia }],
//   namespace: regex (1er grupo = espacio de nombres / paquete),
//   defs: [{ re, kind | kindGroup, name: nº de grupo, exported: 'always'|'noUnderscore'|'capitalized'|'public'|'group'|<nº de grupo> }],
//   resolver: 'dotted' | 'namespace' | 'go' | 'rust' | 'include' | 'file',   sep?: '.' | '\\'
// }
// Los datos se pueden añadir sin tocar código desde .codegraph/config.json → "languages".
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename, extname, resolve as presolve } from 'node:path';

const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lineOf = (code, idx) => { let n = 1; for (let i = 0; i < idx; i++) if (code.charCodeAt(i) === 10) n++; return n; };
const TYPE_KINDS = new Set(['class', 'interface', 'struct', 'enum', 'record', 'trait', 'object', 'type', 'union']);

/** Quita comentarios (devuelve los comentarios aparte) y, aparte, una copia sin el contenido de las cadenas. */
export function strip(src, lx = {}) {
  const line = lx.line || [], block = lx.block || [], triple = lx.triple || [], strs = lx.strings || [];
  let code = '', blank = '', i = 0, ln = 1; const n = src.length, comments = [];
  const starts = (t) => src.startsWith(t, i);
  while (i < n) {
    let hit = false;
    for (const [a, b] of block) if (starts(a)) { let j = src.indexOf(b, i + a.length); if (j < 0) j = n - b.length; const text = src.slice(i + a.length, j), nl = (text.match(/\n/g) || []).length; comments.push({ text, line: ln }); code += '\n'.repeat(nl); blank += '\n'.repeat(nl); ln += nl; i = j + b.length; hit = true; break; }
    if (hit) continue;
    for (const t of line) if (starts(t)) { let j = i; while (j < n && src[j] !== '\n') j++; comments.push({ text: src.slice(i + t.length, j), line: ln }); i = j; hit = true; break; }
    if (hit) continue;
    for (const t of triple) if (starts(t)) { let j = src.indexOf(t, i + t.length); j = j < 0 ? n : j + t.length; const s = src.slice(i, j), nl = (s.match(/\n/g) || []).length; code += s; blank += t + '\n'.repeat(nl) + t; ln += nl; i = j; hit = true; break; }
    if (hit) continue;
    const c = src[i];
    if (strs.includes(c)) {
      let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n' && c !== '`') break; j++; }
      const s = src.slice(i, j + 1), nl = (s.match(/\n/g) || []).length; code += s; blank += c + ' '.repeat(Math.max(0, s.length - 2 - nl)) + '\n'.repeat(nl) + c; ln += nl; i = j + 1; continue;
    }
    if (c === '\n') ln++; code += c; blank += c; i++;
  }
  return { code, blank, comments };
}

function parseNames(text, style) {
  const out = [];
  if (style === 'python') {
    for (let part of text.replace(/[()\\]/g, ' ').split(',')) { part = part.trim(); if (!part) continue; if (part === '*') { out.push({ name: '*', local: '' }); continue; } const [name, local] = part.split(/\s+as\s+/); out.push({ name: name.trim(), local: (local || name).trim() }); }
  }
  return out;
}

export function declarative(spec) {
  const lx = spec.lexer || {};
  const testRx = (spec.tests || []).map((r) => new RegExp(r, 'i'));
  const importPats = (spec.imports || []).map((p) => ({ ...p, rx: new RegExp(p.re, p.flags || 'gm'), eachRx: p.each ? new RegExp(p.each.re, 'gm') : null }));
  const defPats = (spec.defs || []).map((d) => ({ ...d, rx: new RegExp(d.re) }));
  const nsRx = spec.namespace ? new RegExp(spec.namespace, 'm') : null;
  const sep = spec.sep || '.';
  const norm = (s) => (sep === '.' ? s : s.split(sep).join('.'));

  function exportedOf(d, m, ln) {
    const e = d.exported ?? 'always', name = m[d.name];
    if (e === 'always') return true; if (e === 'noUnderscore') return !name.startsWith('_'); if (e === 'capitalized') return /^[A-Z]/.test(name);
    if (e === 'public') return /\bpublic\b/.test(ln) || !/\b(private|protected)\b/.test(ln); if (e === 'group') return !!m[d.exportGroup];
    return true;
  }

  function parse(raw) {
    const { code, blank, comments } = strip(raw, lx), spec0 = spec;
    const imports = [], importText = [];
    for (const p of importPats) {
      p.rx.lastIndex = 0; let m;
      while ((m = p.rx.exec(code))) {
        if (m[0] === '') { p.rx.lastIndex++; continue; }
        importText.push(m[0]); const line = lineOf(code, m.index);
        if (p.eachRx) { p.eachRx.lastIndex = 0; let q; const body = m[1] || ''; while ((q = p.eachRx.exec(body))) imports.push({ kind: p.kind || 'import', spec: q[p.each.spec], names: p.each.alias && q[p.each.alias] ? [{ name: '*', local: q[p.each.alias] }] : [], line, resolve: p.resolve }); continue; }
        const specs = p.multi ? m[p.spec].split(',').map((x) => x.trim()).filter(Boolean) : [m[p.spec]];
        for (const sp of specs) {
          let spec = sp, names = p.names && m[p.names] ? parseNames(m[p.names], p.namesStyle) : [];
          if (p.namesStyle === 'pyimport') { const [mod, alias] = sp.split(/\s+as\s+/); spec = mod.trim(); names = [{ name: '*', local: (alias || mod.split('.')[0]).trim() }]; }
          imports.push({ kind: spec0.lazyIndented && /^[ \t]/.test(m[0]) ? 'dynamic' : p.kind || 'import', spec: spec.trim(), names, line, resolve: p.resolve });
        }
      }
    }
    const defs = [], lines = code.split('\n');
    lines.forEach((ln, i) => {
      for (const d of defPats) { const m = ln.match(d.rx); if (m && m[d.name]) { defs.push({ name: m[d.name], kind: d.kindGroup ? mapKind(m[d.kindGroup]) : d.kind || 'function', line: i + 1, exported: exportedOf(d, m, ln) }); break; } }
    });
    const exports = [...new Set(defs.filter((d) => d.exported).map((d) => d.name))];
    const nm = nsRx ? code.match(nsRx) : null;
    return { code, blank, comments, imports, exports, defs: defs.slice(0, 200), loc: lines.filter((l) => l.trim()).length, lines: raw.split('\n').length, importText: importText.join('\n'),
      declares: { ns: nm ? norm(nm[1]) : null, types: defs.filter((d) => TYPE_KINDS.has(d.kind)).map((d) => d.name) } };
  }
  const mapKind = (k) => { k = (k || '').toLowerCase(); if (k.startsWith('record')) return 'record'; if (k === 'fn' || k === 'func') return 'function'; if (k === 'mod') return 'module'; if (k === 'const' || k === 'static') return 'const'; return k; };

  /** cuenta apariciones de `local` en el código sin cadenas ni sentencias de import */
  const countRefs = (code, local, ir) => {
    if (!local) return 0; const body = ir?.blank ?? code, rx = new RegExp(`(?<![\\w$.])${escRx(local)}(?![\\w$])`, 'g');
    return Math.max(0, (body.match(rx) || []).length - ((ir?.importText || '').match(rx) || []).length);
  };
  const nsMembers = (code, local, ir) => { const rx = new RegExp(`(?<![\\w$.])${escRx(local)}\\.([\\w$]+)`, 'g'), set = new Map(); let m; while ((m = rx.exec(ir?.blank ?? code))) set.set(m[1], (set.get(m[1]) || 0) + 1); return set; };

  // ───────── estrategias de resolución ─────────
  const exists = (ctx, p) => ctx.fileSet.has(p);
  const ancestors = (from, ctx) => { const out = []; let d = dirname(from); while (d.length >= ctx.root.length) { out.push(d); if (d === ctx.root) break; const up = dirname(d); if (up === d) break; d = up; } return out; };
  const firstFile = (ctx, list) => list.find((p) => exists(ctx, p)) || null;

  function resolveDotted(im, from, ctx) { // Python
    const spec = im.spec; const dots = (spec.match(/^\.+/) || [''])[0].length, mod = spec.slice(dots), parts = mod ? mod.split('.') : [];
    let roots; if (dots) { let d = dirname(from); for (let i = 1; i < dots; i++) d = dirname(d); roots = [d]; } else roots = [...new Set([ctx.root, join(ctx.root, 'src'), ...ancestors(from, ctx)])];
    const out = [];
    for (const r of roots) {
      const base = join(r, ...parts), mf = parts.length ? firstFile(ctx, [base + '.py', join(base, '__init__.py')]) : firstFile(ctx, [join(r, '__init__.py')]);
      const pkgDir = parts.length ? base : r;
      const subs = [];
      for (const n of im.names || []) { if (n.name === '*') continue; const s = firstFile(ctx, [join(pkgDir, n.name + '.py'), join(pkgDir, n.name, '__init__.py')]); if (s) subs.push({ target: s, names: [n] }); }
      if (mf && (!subs.length || (im.names || []).some((n) => !subs.some((s) => s.names[0] === n)))) out.push({ target: mf });
      out.push(...subs);
      if (out.length) return out;
    }
    return null;
  }
  function resolveInclude(im, from, ctx) { // C / C++
    const dirs = [dirname(from), ctx.root, join(ctx.root, 'include'), join(ctx.root, 'src'), ...ancestors(from, ctx).flatMap((d) => [d, join(d, 'include')])];
    for (const d of dirs) { const p = presolve(d, im.spec); if (exists(ctx, p)) return p; }
    return null;
  }
  function resolveFile(im, from, ctx) { // require/include de ruta (PHP, Ruby…)
    const p = presolve(dirname(from), im.spec); return exists(ctx, p) ? p : null;
  }
  function resolveRust(im, from, ctx) {
    const d = dirname(from), stem = basename(from, '.rs'), isRoot = ['mod', 'lib', 'main'].includes(stem);
    if (im.kind === 'mod') return firstFile(ctx, [join(d, im.spec + '.rs'), join(d, im.spec, 'mod.rs'), ...(isRoot ? [] : [join(d, stem, im.spec + '.rs'), join(d, stem, im.spec, 'mod.rs')])]);
    const parts = im.spec.split('::'); let base;
    if (parts[0] === 'crate') { let c = d; while (c.length >= ctx.root.length && !exists(ctx, join(c, 'lib.rs')) && !exists(ctx, join(c, 'main.rs'))) c = dirname(c); base = c.length >= ctx.root.length ? c : join(ctx.root, 'src'); parts.shift(); }
    else if (parts[0] === 'super') { base = isRoot ? dirname(d) : d; parts.shift(); while (parts[0] === 'super') { base = dirname(base); parts.shift(); } }
    else if (parts[0] === 'self') { base = isRoot ? d : join(d, stem); parts.shift(); }
    else return null;
    for (let k = parts.length; k > 0; k--) { const t = firstFile(ctx, [join(base, ...parts.slice(0, k)) + '.rs', join(base, ...parts.slice(0, k), 'mod.rs')]); if (t) return t; }
    return null;
  }
  const strategies = { dotted: resolveDotted, include: resolveInclude, file: resolveFile, rust: resolveRust };

  // ───────── enlace por espacio de nombres (C#, Java, Kotlin, PHP) ─────────
  const idents = (blank) => { const m = new Map(); for (const w of blank.match(/[A-Za-z_$][\w$]*/g) || []) m.set(w, (m.get(w) || 0) + 1); return m; };
  function linkNamespace(ir, abs, ctx) {
    const idx = ctx.ns.get(spec.id), words = idents(ir.blank), own = ir.declares.ns, visible = new Set(), direct = [], links = [], external = [];
    if (own) { const ps = own.split('.'); for (let k = ps.length; k > 0; k--) visible.add(ps.slice(0, k).join('.')); }
    for (const im of ir.imports) {
      if (im.resolve && im.resolve !== 'namespace') continue;
      let s = norm(im.spec).replace(/\.\*$/, '');
      if (idx.has(s)) { visible.add(s); continue; }
      const cut = s.lastIndexOf('.'), nsPart = s.slice(0, cut), type = s.slice(cut + 1);
      if (cut > 0 && idx.get(nsPart)?.has(type)) { direct.push([nsPart, type]); continue; }
      external.push(im);
    }
    const cand = new Map(); // tipo -> archivos
    const take = (ns, type) => { const files = idx.get(ns)?.get(type); if (files && !cand.has(type)) cand.set(type, files); };
    for (const ns of visible) for (const type of (idx.get(ns) || new Map()).keys()) take(ns, type);
    for (const [ns, type] of direct) take(ns, type);
    const byFile = new Map();
    for (const [type, files] of cand) {
      const c = words.get(type); if (!c) continue;
      if (ir.declares.types.includes(type) && c <= 1) continue; // solo la declaración propia
      for (const f of files) { if (f === abs) continue; (byFile.get(f) || byFile.set(f, []).get(f)).push({ name: type, local: type, count: ir.declares.types.includes(type) ? c - 1 : c }); }
    }
    for (const [target, names] of byFile) links.push({ target, kind: 'import', names, line: 1, spec: names.map((n) => n.name).join(', ') });
    for (const im of external) links.push({ external: true, spec: norm(im.spec), kind: 'import', names: [], line: im.line });
    return links;
  }

  // ───────── enlace Go: paquete = directorio ─────────
  function linkGo(ir, abs, ctx) {
    const links = [];
    { // mismo paquete (mismo directorio): se usan entre sí sin importarse
      const words = idents(ir.blank), sib = ctx.goDirs.get(dirname(abs)) || [], mine = new Set(ir.defs.map((d) => d.name));
      for (const f of sib) {
        if (f.abs === abs) continue; const names = [];
        for (const d of f.defs) { if (d.name.length < 4 || mine.has(d.name)) continue; const c = words.get(d.name); if (c) names.push({ name: d.name, local: d.name, count: c }); }
        if (names.length) links.push({ target: f.abs, kind: 'import', names, line: 1, spec: 'paquete ' + basename(dirname(abs)) });
      }
    }
    for (const im of ir.imports) {
      const s = im.spec; let dir = null;
      for (const mod of ctx.goMods || []) if (s === mod.name || s.startsWith(mod.name + '/')) { dir = join(mod.dir, s.slice(mod.name.length + 1)); break; }
      const files = dir ? ctx.goDirs.get(dir) : null;
      if (!files) { links.push({ external: true, spec: s, kind: 'import', names: [], line: im.line }); continue; }
      const alias = im.names[0]?.local || s.replace(/\/v\d+$/, '').split('/').pop(), rx = new RegExp(`(?<![\\w$.])${escRx(alias)}\\.([A-Za-z_]\\w*)`, 'g'), used = new Map(); let m;
      while ((m = rx.exec(ir.blank))) used.set(m[1], (used.get(m[1]) || 0) + 1);
      const byFile = new Map();
      for (const [name, count] of used) for (const f of files) if (f.defs.some((d) => d.name === name)) (byFile.get(f.abs) || byFile.set(f.abs, []).get(f.abs)).push({ name, local: alias + '.' + name, count });
      if (byFile.size) for (const [target, names] of byFile) links.push({ target, kind: 'import', names, line: im.line, spec: s });
      else if (files[0]) links.push({ target: files[0].abs, kind: 'import', names: [], line: im.line, spec: s });
    }
    return links;
  }

  const adapter = {
    id: spec.id, name: spec.name || spec.id, exts: spec.exts, ignore: spec.ignore || [], lexer: lx, relSyntax: spec.relSyntax || (lx.line?.[0] ?? '//'),
    isTest: (id) => testRx.some((r) => r.test(id)), parse, countRefs, nsMembers,
    resolve(spec2, from, ctx, im) { const st = strategies[im?.resolve || spec.resolver]; if (!st) return null; return st({ ...im, spec: spec2 }, from, ctx); },
    declarative: true,
  };
  if (spec.resolver === 'namespace') {
    adapter.prepare = (items, ctx) => { ctx.ns = ctx.ns || new Map(); const idx = new Map(); for (const { abs, ir } of items) { const ns = ir.declares.ns; if (!ns) continue; const m = idx.get(ns) || idx.set(ns, new Map()).get(ns); for (const t of ir.declares.types) (m.get(t) || m.set(t, []).get(t)).push(abs); } ctx.ns.set(spec.id, idx); };
    adapter.link = linkNamespace;
  } else if (spec.resolver === 'go') {
    adapter.prepare = (items, ctx) => {
      ctx.goDirs = new Map(); ctx.goMods = [];
      const seen = new Map();
      const modFor = (dir) => { // go.mod más cercano hacia arriba
        for (let d = dir; d.length >= ctx.root.length; d = dirname(d)) {
          if (seen.has(d)) return seen.get(d);
          try { const m = readFileSync(join(d, 'go.mod'), 'utf8').match(/^\s*module\s+(\S+)/m); if (m) { seen.set(d, { name: m[1], dir: d }); ctx.goMods.push(seen.get(d)); return seen.get(d); } } catch {}
          if (d === ctx.root || dirname(d) === d) break;
        }
        return null;
      };
      for (const { abs, ir } of items) { modFor(dirname(abs)); if (/_test\.go$/.test(abs)) continue; const d = dirname(abs); (ctx.goDirs.get(d) || ctx.goDirs.set(d, []).get(d)).push({ abs, defs: ir.defs }); }
    };
    adapter.link = linkGo;
  }
  return adapter;
}
