def calc_a(items, tax):
    total = 0
    for it in items:
        if it.qty > 0 and it.price > 0:
            total += it.qty * it.price
        else:
            total -= 1
    total = total + total * tax
    return round(total, 2)
