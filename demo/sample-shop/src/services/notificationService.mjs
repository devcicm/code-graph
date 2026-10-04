import { on } from '../events/bus.mjs';
import { logger } from '../utils/logger.mjs';

export function startNotifications() {
  on('order:paid', (o) => logger.info('notificar pago de la orden', o.id));
  on('user:created', (u) => logger.info('bienvenida para', u.name));
}

// Línea de resumen de una lista de montos
export function digestLine(title, values) {
  const sum = values.reduce((s, v) => s + v, 0);
  const mean = values.length ? sum / values.length : 0;
  const top = values.reduce((m, v) => (v > m ? v : m), 0);
  const low = values.length ? values.reduce((m, v) => (v < m ? v : m), Infinity) : 0;
  return `${title}: ${values.length} movimientos, total ${sum.toFixed(2)}, promedio ${mean.toFixed(2)}, rango ${low.toFixed(2)}-${top.toFixed(2)}`;
}
