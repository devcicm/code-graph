import './api/orderRoutes.mjs';
import './api/userRoutes.mjs';
import './api/health.mjs';
import { dispatch } from './api/router.mjs';
import { addProduct } from './services/inventoryService.mjs';
import { startNotifications } from './services/notificationService.mjs';
import { logger } from './utils/logger.mjs';

startNotifications();
addProduct('A1', 'Teclado', 45, 10);
addProduct('B2', 'Mouse', 20, 5);
const ana = dispatch('POST', '/users', { name: 'Ana', email: 'ana@example.com' });
dispatch('POST', '/orders', { userId: ana.id, lines: [{ sku: 'A1', qty: 1 }, { sku: 'B2', qty: 2 }] });

const { report } = await import('./services/reportService.mjs'); // import dinámico
logger.info(report(), JSON.stringify(dispatch('GET', '/orders')));
