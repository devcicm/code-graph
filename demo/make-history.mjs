#!/usr/bin/env node
// Crea un repositorio git de prueba a partir de demo/sample-shop con un historial
// sintético pero realista: 3 autores, ~340 días, renombre, archivo borrado,
// archivos que siempre cambian juntos, un archivo dormido y cambios sin commit.
//   node demo/make-history.mjs [destino]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'sample-shop');

const A = { name: 'Ana Ruiz', email: 'ana@shop.dev' };
const M = { name: 'Marco Díaz', email: 'marco@shop.dev' };
const L = { name: 'Lucía Torres', email: 'lucia@shop.dev' };

// [días atrás, autor, mensaje, [archivos]]  — "R:viejo>nuevo" renombra, "D:ruta" borra
const PLAN = [
  [340, A, 'Estructura inicial del proyecto', ['src/utils/helpers.mjs', 'src/utils/logger.mjs', 'src/utils/validate.mjs', 'src/models/user.mjs', 'src/models/product.mjs']],
  [332, L, 'Prueba de conexión a base de datos', ['src/utils/oldDb.mjs']],
  [325, A, 'Modelo de órdenes', ['src/models/order.mjs', 'src/models/index.mjs']],
  [312, M, 'Servicios de usuarios e inventario', ['src/services/userService.mjs', 'src/services/inventoryService.mjs']],
  [300, M, 'Orden y pago', ['src/services/orderService.mjs', 'src/services/paymentService.mjs']],
  [298, L, 'Quitar prueba de base de datos', ['D:src/utils/oldDb.mjs']],
  [295, M, 'Corrige el pago de la orden', ['src/services/orderService.mjs', 'src/services/paymentService.mjs']],
  [290, A, 'Punto de entrada', ['src/index.mjs']],
  [270, L, 'Helper de compatibilidad', ['src/utils/legacy.mjs']],
  [262, L, 'Ajuste del helper de compatibilidad', ['src/utils/legacy.mjs']],
  [250, A, 'Renombra helpers a format', ['R:src/utils/helpers.mjs>src/utils/format.mjs']],
  [230, A, 'Reporte de órdenes', ['src/services/reportService.mjs']],
  [200, L, 'Pruebas de usuarios', ['test/userService.test.mjs']],
  [190, M, 'Ajusta cálculo de totales', ['src/services/orderService.mjs', 'src/services/paymentService.mjs']],
  [160, A, 'Direcciones de envío', ['src/models/address.mjs']],
  [150, M, 'Configuración e impuestos', ['src/config/settings.mjs', 'src/services/pricingService.mjs', 'src/models/order.mjs']],
  [140, L, 'Bus de eventos y notificaciones', ['src/events/bus.mjs', 'src/services/notificationService.mjs']],
  [120, M, 'Envío gratis sobre el umbral', ['src/services/pricingService.mjs', 'src/models/order.mjs', 'src/services/orderService.mjs']],
  [100, A, 'API: enrutador y rutas', ['src/api/router.mjs', 'src/api/orderRoutes.mjs', 'src/api/userRoutes.mjs', 'src/api/health.mjs']],
  [85, M, 'Precios con impuesto en la orden', ['src/services/orderService.mjs', 'src/services/paymentService.mjs', 'src/services/pricingService.mjs', 'src/models/order.mjs']],
  [75, A, 'Paginación en la API', ['src/api/orderRoutes.mjs', 'src/api/userRoutes.mjs']],
  [70, L, 'Pruebas de órdenes y precios', ['test/orderService.test.mjs', 'test/pricing.test.mjs']],
  [55, M, 'Descuentos en la orden', ['src/services/orderService.mjs', 'src/services/paymentService.mjs', 'src/services/pricingService.mjs', 'src/models/order.mjs']],
  [45, M, 'Paginación: límite máximo', ['src/api/orderRoutes.mjs', 'src/api/userRoutes.mjs']],
  [40, M, 'Reintentos de cobro', ['src/services/paymentService.mjs', 'src/services/orderService.mjs']],
  [28, A, 'Valida correos en usuarios', ['src/services/userService.mjs', 'src/utils/validate.mjs', 'src/api/userRoutes.mjs']],
  [21, M, 'Redondeo de totales', ['src/services/orderService.mjs', 'src/services/pricingService.mjs', 'src/models/order.mjs']],
  [18, A, 'Paginación: totales y navegación', ['src/api/orderRoutes.mjs', 'src/api/userRoutes.mjs']],
  [14, L, 'Notificaciones por evento', ['src/services/notificationService.mjs', 'src/events/bus.mjs']],
  [9, M, 'Emite evento al pagar', ['src/services/orderService.mjs', 'src/services/paymentService.mjs']],
  [5, A, 'Stock: validaciones', ['src/services/inventoryService.mjs']],
  [3, M, 'Hotfix en el estado de pago', ['src/services/orderService.mjs']],
];

const git = (cwd, args, env = {}) => execFileSync('git', ['-c', 'safe.directory=*', ...args], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

export const defaultRepoDir = () => join(tmpdir(), 'code-graph-shop-repo');

export function makeHistory(dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  git(dest, ['init', '-q', '-b', 'main']);
  git(dest, ['config', 'core.autocrlf', 'false']);

  const finalOf = (p) => {
    if (p === 'src/utils/helpers.mjs') return readFileSync(join(SRC, 'src/utils/format.mjs'), 'utf8');
    if (p === 'src/utils/oldDb.mjs') return '// Conexión de prueba (temporal)\nexport const connect = () => ({ ok: true });\n';
    return readFileSync(join(SRC, p), 'utf8');
  };
  // en qué commits se toca cada archivo → para crecer de forma gradual
  const touches = new Map();
  PLAN.forEach(([, , , files], i) => files.forEach((f) => { if (!f.startsWith('R:') && !f.startsWith('D:')) (touches.get(f) || touches.set(f, []).get(f)).push(i); }));
  const contentAt = (f, i) => {
    const full = finalOf(f), list = touches.get(f), k = list.indexOf(i);
    if (k === list.length - 1) return full;
    const lines = full.split('\n'), keep = Math.max(1, Math.min(lines.length - 2, Math.ceil(lines.length * (0.55 + 0.45 * (k / Math.max(1, list.length - 1))))));
    return lines.slice(0, keep).join('\n') + '\n';
  };

  const now = Date.now();
  PLAN.forEach(([days, who, msg, files], i) => {
    for (const f of files) {
      if (f.startsWith('D:')) { git(dest, ['rm', '-q', f.slice(2)]); continue; }
      if (f.startsWith('R:')) { const [from, to] = f.slice(2).split('>'); mkdirSync(dirname(join(dest, to)), { recursive: true }); git(dest, ['mv', from, to]); writeFileSync(join(dest, to), finalOf(from)); continue; }
      mkdirSync(dirname(join(dest, f)), { recursive: true });
      writeFileSync(join(dest, f), contentAt(f, i));
    }
    git(dest, ['add', '-A']);
    const when = new Date(now - days * 86400000 - (i % 7) * 3600000).toISOString();
    git(dest, ['commit', '-q', '-m', msg], { GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
  });

  // copia lo que quede del proyecto de ejemplo (sin sobrescribir lo versionado) y deja trabajo sin commit
  const fin = join(dest, 'src/services/inventoryService.mjs');
  writeFileSync(fin, readFileSync(fin, 'utf8') + "\nexport function restock(sku, qty) {\n  const p = catalog.get(sku);\n  if (p) p.stock += qty;\n  return p;\n}\n");
  writeFileSync(join(dest, 'src/services/discountService.mjs'),
    "import { withTax } from './pricingService.mjs';\nimport { FREE_SHIPPING_FROM } from '../config/settings.mjs';\n\n// Descuentos por volumen (en desarrollo)\nexport const volumeDiscount = (subtotal) => (subtotal > FREE_SHIPPING_FROM * 3 ? withTax(subtotal) * 0.95 : withTax(subtotal));\n");
  const usr = join(dest, 'src/models/user.mjs');
  writeFileSync(usr, readFileSync(usr, 'utf8').replace('export class User', '// Usuario de la tienda\nexport class User'));
  return dest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dest = process.argv[2] || defaultRepoDir();
  makeHistory(dest);
  console.log('✔ repo de prueba en', dest);
  console.log(git(dest, ['log', '--oneline', '-5']));
  console.log(git(dest, ['status', '--short']));
}
