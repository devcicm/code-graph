package main

import (
	"fmt"
	"example.com/svc/internal/store"
)

func main() { fmt.Println(store.Get(1)) }
