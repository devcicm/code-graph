import { randomUUID } from 'node:crypto';
import { User } from './user.mjs';
import { Product } from './product.mjs';

// @rel User N:1 pertenece a
// @rel Product N:M contiene
export class Order {
  constructor(user, items) {
    if (!(user instanceof User)) throw new Error('user inválido');
    if (!items.every((p) => p.product instanceof Product)) throw new Error('item inválido');
    this.id = randomUUID().slice(0, 8);
    this.user = user;
    this.items = items;
    this.status = 'new';
  }
  get total() { return this.items.reduce((s, i) => s + i.product.price * i.qty, 0); }
}
