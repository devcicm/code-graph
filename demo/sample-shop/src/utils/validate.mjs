export const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
export const isPositive = (n) => Number.isFinite(n) && n > 0;
export function assert(cond, msg) { if (!cond) throw new Error(msg); }
