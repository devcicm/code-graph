import { logger } from '../utils/logger.mjs';
import { money } from '../utils/format.mjs';
import { markPaid } from './orderService.mjs'; // ciclo: orderService <-> paymentService

export function charge(order) {
  logger.info('cobrando', money(order.total));
  markPaid(order);
  return true;
}

export const fee = (amount) => +((amount * 0.16) / 4).toFixed(2);

// @set pagos
