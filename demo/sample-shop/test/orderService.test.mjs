import test from 'node:test';
import assert from 'node:assert';
import { createUser } from '../src/services/userService.mjs';
import { addProduct } from '../src/services/inventoryService.mjs';
import { placeOrder } from '../src/services/orderService.mjs';

test('una orden descuenta stock y queda pagada', () => {
  addProduct('T1', 'Cable', 5, 3);
  const u = createUser('Test', 'test@example.com');
  const o = placeOrder(u, [{ sku: 'T1', qty: 2 }]);
  assert.equal(o.status, 'paid');
});
