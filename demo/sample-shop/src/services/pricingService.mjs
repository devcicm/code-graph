import { TAX_RATE, FREE_SHIPPING_FROM } from '../config/settings.mjs';
import { money } from '../utils/format.mjs';

export function withTax(subtotal) { return +(subtotal * (1 + TAX_RATE)).toFixed(2); }
export function shipping(subtotal) { return subtotal >= FREE_SHIPPING_FROM ? 0 : 9.9; }
export const label = (subtotal) => `${money(withTax(subtotal) + shipping(subtotal))} con envío`;
