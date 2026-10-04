// @rel Order N:M aparece en
export class Product {
  constructor(sku, name, price, stock = 0) { Object.assign(this, { sku, name, price, stock }); }
}
