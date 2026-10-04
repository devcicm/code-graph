import { stamp } from './format.mjs';

export const logger = {
  info: (...a) => console.log(`[${stamp()}] INFO `, ...a),
  warn: (...a) => console.warn(`[${stamp()}] WARN `, ...a),
};
