package x
func (s *S) Sum(items []Item, tax float64) float64 {
 total := 0.0
 for _, it := range items {
  if it.Qty > 0 && it.Price > 0 {
   total += it.Qty * it.Price
  } else {
   total -= 1
  }
 }
 total = total + total*tax
 return total
}
