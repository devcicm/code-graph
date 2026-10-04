import { route } from './router.mjs';
import { placeOrder, listOrders } from '../services/orderService.mjs';
import { getUser } from '../services/userService.mjs';
import { label } from '../services/pricingService.mjs';

route('POST', '/orders', ({ userId, lines }) => placeOrder(getUser(userId), lines));
route('GET', '/orders', () => listOrders().map((o) => ({ id: o.id, total: label(o.total) })));

// Paginación de listados (misma lógica que en userRoutes: candidata a compartirse)
export function paginate(rows, query = {}) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const start = (page - 1) * limit;
  const slice = rows.slice(start, start + limit);
  const pages = Math.ceil(rows.length / limit);
  return { items: slice, page, limit, pages, hasNext: page < pages, hasPrev: page > 1, total: rows.length };
}
