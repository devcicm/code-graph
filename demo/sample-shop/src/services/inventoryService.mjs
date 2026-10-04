import { Product } from '../models/index.mjs';
import { logger } from '../utils/logger.mjs';
import { isPositive } from '../utils/validate.mjs';

const catalog = new Map();
export function addProduct(sku, name, price, stock) {
  const p = new Product(sku, name, price, stock);
  catalog.set(sku, p);
  return p;
}
export function reserve(sku, qty) {
  const p = catalog.get(sku);
  if (!p || !isPositive(qty) || p.stock < qty) { logger.warn('sin stock', sku); return null; }
  p.stock -= qty;
  return p;
}
