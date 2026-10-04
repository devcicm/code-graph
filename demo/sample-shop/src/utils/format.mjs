// Utilidades de formato. No depende de nadie.
export const money = (n) => `$${n.toFixed(2)}`;
export const pad = (n) => String(n).padStart(2, '0');
export const stamp = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
