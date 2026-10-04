import test from 'node:test';
import assert from 'node:assert';
import { withTax, shipping } from '../src/services/pricingService.mjs';

test('impuesto y envío', () => {
  assert.equal(withTax(100), 116);
  assert.equal(shipping(100), 0);
  assert.equal(shipping(10), 9.9);
});
