// code-graph · lib/stats.mjs — estadística pequeña y robusta para pocos datos
export const r2 = (x) => Math.round(x * 100) / 100;
export const sum = (a) => a.reduce((s, v) => s + v, 0);
const medSorted = (s) => { if (!s.length) return 0; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Se ordena una sola vez por arreglo (cache): evita O(N²·log N) al puntuar muchos archivos contra la misma muestra.
const CACHE = new WeakMap();
const info = (a) => { let c = CACHE.get(a); if (!c || c.n !== a.length) { const s = [...a].sort((x, y) => x - y), m = medSorted(s), d = medSorted(s.map((v) => Math.abs(v - m)).sort((x, y) => x - y)); c = { s, m, d, n: a.length }; CACHE.set(a, c); } return c; };
export const median = (a) => medSorted(info(a).s);
/** Desviación absoluta mediana: robusta ante valores extremos. */
export const mad = (a) => info(a).d;
/** z robusto (0,6745·(x−mediana)/MAD). > 3,5 suele considerarse atípico. */
export function robustZ(a, v) { const { m, d } = info(a); return d ? (0.6745 * (v - m)) / d : v > m ? 3.6 : 0; }
/** Rango percentil de v dentro de a (0-100): % de valores estrictamente menores + mitad de iguales. */
export function pctRank(a, v) {
  if (!a.length) return 0; const s = info(a).s, lo = (x, right) => { let l = 0, h = s.length; while (l < h) { const m = (l + h) >> 1; if (right ? s[m] <= x : s[m] < x) l = m + 1; else h = m; } return l; };
  const lt = lo(v, false), eq = lo(v, true) - lt; return Math.round((100 * (lt + eq / 2)) / a.length);
}
/** Pendiente por mínimos cuadrados de y sobre 0..n−1. */
export function slope(y) { const n = y.length; if (n < 2) return 0; const mx = (n - 1) / 2, my = sum(y) / n; let num = 0, den = 0; y.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; }); return den ? num / den : 0; }
/** Coeficiente de Gini (0 = reparto igual, 1 = todo en uno). */
export function gini(a) { const s = [...a].sort((x, y) => x - y), n = s.length, t = sum(s); if (!n || !t) return 0; let c = 0; s.forEach((v, i) => (c += (i + 1) * v)); return r2((2 * c) / (n * t) - (n + 1) / n); }
/** Intervalo de Wilson al 95 % para una proporción k/n. Con n pequeño el intervalo es ancho: eso es lo que importa mostrar. */
export function wilson(k, n, z = 1.96) { if (!n) return { p: 0, lo: 0, hi: 1 }; const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), w = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n)); return { p: r2(p), lo: r2(Math.max(0, (c - w) / d)), hi: r2(Math.min(1, (c + w) / d)) }; }
/** Reglas de asociación para co-cambio: soporte, confianza en ambos sentidos y lift. */
export function association(count, ca, cb, total) { const sup = count / Math.max(1, total); return { support: r2(sup), confAB: r2(count / Math.max(1, ca)), confBA: r2(count / Math.max(1, cb)), lift: r2(sup / Math.max(1e-9, (ca / total) * (cb / total))) }; }
/** Confianza cualitativa según el tamaño de muestra. */
export const confidence = (n) => (n >= 12 ? 'alta' : n >= 5 ? 'media' : 'baja');
export const FIX_RE = /\b(fix(es|ed)?|hotfix|bug|corrig\w*|arregl\w*|error(es)?|revert\w*|parche)\b/i;
