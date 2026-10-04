// Front web
import { fmt } from './util.js';
export const run = () => fmt('hola');
export const loadOrder = (id) => fetch(`/api/orders/${id}`).then((r) => r.json());
export function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); }
