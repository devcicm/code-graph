import test from 'node:test';
import assert from 'node:assert';
import { createUser } from '../src/services/userService.mjs';

test('rechaza correos inválidos', () => {
  assert.throws(() => createUser('X', 'no-es-correo'));
});
