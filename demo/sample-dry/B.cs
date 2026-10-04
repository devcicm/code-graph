class B { public decimal Total(List<Item> items, decimal tax) {
 decimal sum = 0;
 foreach (var it in items) {
 if (it.Qty > 0 && it.Price > 0) {
 sum += it.Qty * it.Price;
 } else {
 sum -= 1;
 }
 }
 sum = sum + sum * tax;
 return Math.Round(sum, 2); } }