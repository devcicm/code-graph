// Bus de eventos mínimo (publicar / suscribirse).
const handlers = new Map();
export function on(evt, fn) { (handlers.get(evt) || handlers.set(evt, []).get(evt)).push(fn); }
export function emit(evt, payload) { (handlers.get(evt) || []).forEach((fn) => fn(payload)); }
