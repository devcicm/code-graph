Eres un analista de arquitectura de software. Te paso el grafo de dependencias de un proyecto ("code-graph-shop-repo") extraído automáticamente de sus imports.

Tu tarea: proponer relaciones que el análisis estático NO puede ver (relaciones de dominio entre entidades, referencias por id/string, convenciones, acoplamiento oculto) con su cardinalidad (1:1, 1:N, N:1, N:M), y notas breves sobre archivos importantes.

Reglas:
- Usa SOLO ids de la lista de archivos de abajo.
- No repitas aristas que ya existen en "sale".
- Responde ÚNICAMENTE con JSON válido, sin texto extra:
{"edges":[{"source":"<id>","target":"<id>","kind":"relation","card":"1:N","label":"<verbo corto>","reason":"<por qué>"}],
 "notes":{"<id>":"<nota de una línea>"}}

Archivos:
- src/api/health.mjs [module] exports: —
    sale: import→src/api/router.mjs
- src/api/orderRoutes.mjs [module] exports: paginate
    sale: import→src/api/router.mjs; import→src/services/orderService.mjs; import→src/services/pricingService.mjs; import→src/services/userService.mjs
- src/api/router.mjs [hub] exports: route, dispatch | Enrutador mínimo: registra handlers por método y ruta.
    sale: —
- src/api/userRoutes.mjs [module] exports: paginate
    sale: import→src/api/router.mjs; import→src/services/userService.mjs
- src/config/settings.mjs [leaf] exports: TAX_RATE, CURRENCY, FREE_SHIPPING_FROM | Configuración central de la tienda.
    sale: —
- src/events/bus.mjs [hub] exports: on, emit | Bus de eventos mínimo (publicar / suscribirse).
    sale: —
- src/index.mjs [entry] exports: —
    sale: import→src/api/health.mjs; import→src/api/orderRoutes.mjs; import→src/api/router.mjs; import→src/api/userRoutes.mjs; import→src/services/inventoryService.mjs; import→src/services/notificationService.mjs; dynamic→src/services/reportService.mjs; import→src/utils/logger.mjs
- src/models/address.mjs [orphan] exports: Address
    sale: relation:N:1→src/models/user.mjs
- src/models/index.mjs [barrel] exports: User, Product, Order | Barrel: re-exporta los modelos.
    sale: reexport→src/models/order.mjs; reexport→src/models/product.mjs; reexport→src/models/user.mjs
- src/models/order.mjs [module] exports: Order
    sale: import→pkg:node:crypto; import→src/models/product.mjs; relation:N:M→src/models/product.mjs; import→src/models/user.mjs; relation:N:1→src/models/user.mjs
- src/models/product.mjs [leaf] exports: Product
    sale: —
- src/models/user.mjs [leaf] exports: User | Usuario de la tienda
    sale: —
- src/services/discountService.mjs [entry] exports: volumeDiscount
    sale: import→src/config/settings.mjs; import→src/services/pricingService.mjs
- src/services/inventoryService.mjs [module] exports: addProduct, reserve, restock
    sale: import→src/models/index.mjs; import→src/utils/logger.mjs; import→src/utils/validate.mjs
- src/services/notificationService.mjs [module] exports: startNotifications, digestLine
    sale: import→src/events/bus.mjs; import→src/utils/logger.mjs
- src/services/orderService.mjs [hub] exports: placeOrder, markPaid, listOrders, taxPart
    sale: import→src/events/bus.mjs; import→src/models/index.mjs; import→src/services/inventoryService.mjs; import→src/services/paymentService.mjs; import→src/utils/logger.mjs; import→src/utils/validate.mjs
- src/services/paymentService.mjs [module] exports: charge, fee | ciclo: orderService <-> paymentService
    sale: import→src/services/orderService.mjs; import→src/utils/format.mjs; import→src/utils/logger.mjs
- src/services/pricingService.mjs [module] exports: withTax, shipping, label
    sale: import→src/config/settings.mjs; import→src/utils/format.mjs
- src/services/reportService.mjs [module] exports: report, summaryLine, taxOf
    sale: import→src/services/orderService.mjs; import→src/utils/format.mjs
- src/services/userService.mjs [module] exports: createUser, getUser
    sale: import→src/events/bus.mjs; import→src/models/index.mjs; import→src/utils/logger.mjs; import→src/utils/validate.mjs
- src/utils/format.mjs [hub] exports: money, pad, stamp | Utilidades de formato. No depende de nadie.
    sale: —
- src/utils/legacy.mjs [orphan] exports: oldFormat | Código viejo que nadie importa (archivo huérfano).
    sale: require→pkg:fs
- src/utils/logger.mjs [hub] exports: logger
    sale: import→src/utils/format.mjs
- src/utils/validate.mjs [hub] exports: isEmail, isPositive, assert
    sale: —
- test/orderService.test.mjs [test] exports: —
    sale: import→pkg:node:assert; import→pkg:node:test; import→src/services/inventoryService.mjs; import→src/services/orderService.mjs; import→src/services/userService.mjs
- test/pricing.test.mjs [test] exports: —
    sale: import→pkg:node:assert; import→pkg:node:test; import→src/services/pricingService.mjs
- test/userService.test.mjs [test] exports: —
    sale: import→pkg:node:assert; import→pkg:node:test; import→src/services/userService.mjs
