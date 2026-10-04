import { listOrders } from './orderService.mjs';
import { money } from '../utils/format.mjs';

export function report() {
  const rows = listOrders();
  return `${rows.length} órdenes, total ${money(rows.reduce((s, o) => s + o.total, 0))}`;
}

// Línea de resumen de una lista de montos
export function summaryLine(label, amounts) {
  const total = amounts.reduce((s, a) => s + a, 0);
  const avg = amounts.length ? total / amounts.length : 0;
  const max = amounts.reduce((m, a) => (a > m ? a : m), 0);
  const min = amounts.length ? amounts.reduce((m, a) => (a < m ? a : m), Infinity) : 0;
  return `${label}: ${amounts.length} movimientos, total ${money(total)}, promedio ${money(avg)}, rango ${money(min)}-${money(max)}`;
}
export const taxOf = (total) => +(total * 0.16).toFixed(2);
