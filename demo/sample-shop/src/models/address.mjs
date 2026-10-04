// @rel User N:1 pertenece a
export class Address {
  constructor(street, city, zip) { Object.assign(this, { street, city, zip }); }
  toString() { return `${this.street}, ${this.city} ${this.zip}`; }
}
