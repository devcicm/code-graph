import { User } from '../models/index.mjs';
import { logger } from '../utils/logger.mjs';
import { isEmail, assert } from '../utils/validate.mjs';
import { emit } from '../events/bus.mjs';

const users = new Map();
export function createUser(name, email) {
  assert(isEmail(email), 'email inválido');
  const u = new User(users.size + 1, name, email);
  users.set(u.id, u);
  logger.info('usuario creado', u.name);
  emit('user:created', u);
  return u;
}
export const getUser = (id) => users.get(id);
