// Enrutador mínimo: registra handlers por método y ruta.
const routes = [];
export const route = (method, path, handler) => routes.push({ method, path, handler });
export const dispatch = (method, path, body) => routes.find((r) => r.method === method && r.path === path)?.handler(body);
