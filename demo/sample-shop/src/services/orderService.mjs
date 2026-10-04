import { Order } from '../models/index.mjs';
import { reserve } from './inventoryService.mjs';
import { charge } from './paymentService.mjs';
import { logger } from '../utils/logger.mjs';
import { assert } from '../utils/validate.mjs';
import { emit } from '../events/bus.mjs';

const orders = [];
export function placeOrder(user, lines) {
  const items = lines.map(({ sku, qty }) => {
    const product = reserve(sku, qty);
    assert(product, `sin stock: ${sku}`);
    return { product, qty };
  });
  const order = new Order(user, items);
  orders.push(order);
  charge(order);
  return order;
}
export function markPaid(order) { order.status = 'paid'; logger.info('pagada', order.id); emit('order:paid', order); }
export const listOrders = () => orders.slice();

export const taxPart = (subtotal) => +(subtotal * 0.16).toFixed(2);

// @set pagos
