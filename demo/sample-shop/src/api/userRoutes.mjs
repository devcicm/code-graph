import { route } from './router.mjs';
import { createUser, getUser } from '../services/userService.mjs';

route('POST', '/users', ({ name, email }) => createUser(name, email));
route('GET', '/users', ({ id }) => getUser(id));

// Paginación de listados
export function paginate(list, params = {}) {
  const size = Math.min(Math.max(parseInt(params.limit, 10) || 20, 1), 50);
  const current = Math.max(parseInt(params.page, 10) || 1, 1);
  const from = (current - 1) * size;
  const items = list.slice(from, from + size);
  const total = Math.ceil(list.length / size);
  return { items, page: current, limit: size, pages: total, hasNext: current < total, hasPrev: current > 1, total: list.length };
}
