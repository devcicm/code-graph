# Code Graph · Mundo — plan

De "archivos en un árbol" a un mundo que se recorre: cada archivo es un edificio (o un planeta, o un nodo), el tamaño dice cuánto pesa, el color dice qué le pasa, y el tiempo se puede rebobinar.

## Qué resuelve

Responder rápido, sin leer cientos de archivos: ¿qué hay aquí?, ¿qué depende de qué?, ¿qué está cambiando?, ¿dónde duele si toco algo?, ¿quién lo conoce?, ¿qué conviene hacer primero? Y poder tocar el código desde el mismo lugar.

## Tres vistas, un mismo mundo

| Vista | Metáfora | Para qué |
|---|---|---|
| **Ciudad** (por defecto) | Carpetas = distritos, archivos = edificios; altura = líneas / uso / cambios / riesgo | Orientarse, ver dónde está el peso |
| **Galaxia** | Módulos detectados (o carpetas) = sistemas; archivos = planetas que orbitan | Ver agrupaciones reales vs. carpetas |
| **Grafo** | Fuerzas: lo que se importa se atrae | Ver dependencias y ciclos |

Pasar de una a otra anima los mismos objetos; la cámara gira en pasos de 90° y se inclina de plano a isométrico.

## Lentes (qué dice el color y el tamaño)

Color: carpeta · módulo · estado · riesgo · autor principal · cobertura de tests · antigüedad. Tamaño: líneas · usos (fan-in) · cambios en 90 días · riesgo.

- **Estado** (ciclo de vida): nuevo, modificado sin commit, activo, estable, dormido, huérfano.
- **Riesgo** explicable (0-100): suma de ciclos, usos, cambios recientes, falta de tests, dueño único, tamaño. Cada punto tiene su motivo.
- **Cobertura**: test directo, indirecto o ninguno (por imports desde `test/`).

## Git y tiempo

Historial real (`git log -M`): autores, renombres, borrados, cambios sin commit. La **línea de tiempo** reproduce el crecimiento del proyecto commit a commit: los edificios aparecen y crecen. Pestaña Código: autoría por línea (blame) y cambios pendientes (diff).

## Ciencia de datos

- **Módulos** por propagación de etiquetas con ponderación inversa de hubs.
- **Acoplamiento temporal**: archivos que cambian juntos; "túneles ocultos" si no hay import entre ellos.
- **Matriz de acoplamiento** entre carpetas, **salud** del proyecto (0-100) y **hallazgos** priorizados con "qué conviene hacer".
- **Traza de símbolos**: de dónde sale una función, quién la usa, atravesando barrels; **camino** entre dos archivos.

## Duplicación (DRY)

`lib/dupes.mjs` tokeniza el código (sin regex frágiles) y extrae funciones, flechas y métodos. Detecta:

- **Clones** exactos, parametrizados (solo cambian nombres/literales) y similares (≥80 % de fragmentos de 5 tokens en común).
- **Constantes mágicas** repetidas en 3+ sitios de 2+ archivos (avisa si ya existe una constante con ese valor).
- **Homónimos**: mismo nombre en archivos distintos sin ser clones.
- Las variables locales no se analizan.

El costo sale de git: un grupo «se paga» si sus copias cambian juntas (≥50 % de los cambios del archivo menos tocado y ≥2 commits), si no es «latente» (parecidas, pero hoy se editan por separado). La puntuación (0-100) combina líneas, copias, co-cambio y autores distintos; entra al riesgo, la salud y los hallazgos. Cada grupo trae una sugerencia de extracción (carpeta destino, aviso si crearía una dependencia circular).

Contra falsos positivos: tamaño mínimo (40 tokens y 5 líneas), exclusión de tests con peso bajo, descarte de fragmentos presentes en demasiadas funciones (boilerplate) y severidad según co-cambio. Contra el costo cuadrático: índice invertido de fragmentos raros, solo se comparan funciones que comparten alguno. Configurable en `.codegraph/config.json` → `{"dupes": {"threshold": 0.85, "minTokens": 50, "exclude": ["generated/"]}}`.

En el visor: lente «Duplicación (DRY)», arcos magenta entre copias, sección en Hallazgos con comparación lado a lado y % duplicado en cada archivo.

## Buscar y moverse

Ctrl+K: archivos, símbolos y texto dentro del código. Enfoque por vecindad, por carpeta, migas de pan, minimapa, teclas (flechas giran, +/- zoom, 1/2/3 vistas, T tema).

## Editar sin fatiga

`serve.mjs` levanta un servidor **solo local** (127.0.0.1, token, comprobación de Host/Origin, rutas confinadas al proyecto). El visor abre el código del edificio, lo edita (Ctrl+S), detecta conflictos si el archivo cambió fuera (409) y el mundo se refresca solo (SSE). El visor estático (`viewer.html`) es solo lectura con todo incrustado.

## Colaboración con IA

El visor genera un prompt con ids válidos, símbolos, riesgo y dueños; la IA responde JSON (`edges`, `notes`, `actions`); cada sugerencia queda pendiente hasta aceptarla; lo aceptado sale como `overrides.json` y `analyze.mjs --overrides` lo fija. Cardinalidad por `// @rel Destino 1:N etiqueta`.

## Arquitectura

```
proyecto ──► analyze.mjs (imports, símbolos, ciclos) ─┐
   │                                                  ├─► lib/metrics.mjs ─► world ─► lib/assemble.mjs ─► viewer.html
   └─► lib/git.mjs (historial, status, blame, diff) ──┘        (estados, riesgo,           ▲
                                                                módulos, co-cambio)        │
                                         serve.mjs ── API local + SSE + edición ───────────┘
```

Sin dependencias (Node 22). Visor: Canvas 2D, un HTML autocontenido armado desde `viewer/world.template.html` + `viewer/js/*`.

## Uso

```bash
node demo/run-demo.mjs                      # crea repo de prueba con historial, se autoverifica, genera demo/out/*.html
node serve.mjs ./mi-proyecto                # mundo en vivo con edición real (http://127.0.0.1:4173)
node build-viewer.mjs ./mi-proyecto dist    # visor estático dist/viewer.html
node analyze.mjs ./mi-proyecto/src --out graph.json [--prompt p.md] [--overrides o.json]
```

## Fases siguientes

1. **Más lenguajes**: parser por extensión; C#/.NET (`using`, `ProjectReference`, Roslyn), Python, Go.
2. **Mejor JS/TS**: alias de `tsconfig`, monorepos, análisis por AST.
3. **Cardinalidad inferida** desde ORM/esquemas (Prisma, EF Core, SQL, OpenAPI).
4. **IA integrada** llamando a la API desde el visor; explicar rutas ("¿por qué A depende de Z?").
5. **Vista de runtime**: superponer trazas/errores/cobertura reales (logs, OpenTelemetry) sobre los edificios — estado vivo del sistema.
6. **Comparar commits / ramas / PR**, y extensión de VS Code que abre el archivo al hacer clic.
7. **Escala**: WebGL y niveles de detalle pasado el millar de archivos.

## Límites conocidos

Regex para imports y tokenizador propio para duplicación (no AST; TypeScript con tipos complejos puede perder alguna función); DRY comparado a nivel de archivo para el co-cambio; sin alias de ruta; el riesgo es una heurística explicable, no una verdad; la ciudad está pensada para decenas a pocos miles de archivos; git requerido para estados temporales.

---

# Plan 2 · Multilenguaje y exploración adelante/atrás

## A. Multilenguaje: el núcleo no sabe de lenguajes

**Principio.** Hoy `analyze.mjs` mezcla la orquestación con el análisis de JS/TS, y `lib/dupes.mjs` tokeniza solo JS. Todo lo demás (git, métricas, riesgo, módulos, co-cambio, visor) ya trabaja sobre nodos y aristas y no depende del lenguaje. El plan es sacar lo específico a *adaptadores* que producen un modelo común.

### A1. Modelo intermedio (IR) por archivo

```
file: { id, lang, loc, isTest, rels[@rel],
        imports: [{ spec, kind: import|reexport|dynamic|require|include|using|reflection, line, symbols:[{name,local,count}] }],
        exports: [nombre], declares: [tipos/espacios de nombres que define],
        uses: [identificadores/tipos referenciados],
        units: [{ name, kind, start, end, params, exported }],
        tokens (opcional, para duplicación) }
```

El núcleo resuelve las referencias (`resolve`), arma aristas, ciclos, roles y todo lo posterior. Ninguna métrica cambia.

### A2. Contrato de adaptador

```
{ id, exts, ignore, tests: regex,
  detectProject(root)            // tsconfig paths, .csproj, go.mod, pyproject, pom.xml, Cargo.toml…
  parse(src, file)  → IR         // imports, exports, declares, uses, units
  resolve(spec, fromId, ctx)     // → { target } | { external: paquete } | { unresolved }
  lexer: { line, block, strings, keywords }   // para resaltado y duplicación
  capabilities: { symbols, units, refs, reflection } }
```

### A3. Tres niveles de precisión (cero dependencias por defecto)

| Nivel | Qué es | Qué da |
|---|---|---|
| 0 · genérico | cualquier archivo de texto | líneas, git, estados, riesgo, duplicación (tokenizador genérico), sin aristas |
| 1 · declarativo/regex | archivo JSON (`languages/*.json`) con patrones de import, definiciones, comentarios y una estrategia de resolución | aristas, símbolos, ciclos, huérfanos |
| 2 · con motor | adaptador JS que usa un parser real si está disponible (tree-sitter wasm, Roslyn, TypeScript API) | referencias exactas, reflexión, tipos |

Siempre hay *degradación elegante*: si no hay motor se usa el nivel 1, y el visor muestra un indicador de **confianza del mapa** (porcentaje de imports resueltos) por lenguaje.

Estrategias de resolución integradas (se reutilizan entre lenguajes): ruta relativa (JS, C/C++ `#include "…"`), módulo con puntos (Python, Java, Kotlin, Scala), **índice de espacios de nombres** (C#, Java, Go, PHP, Swift: la dependencia es de un tipo, no de un archivo), `mod`/`crate` (Rust), paquete por directorio (Go).

### A4. Lenguajes y qué requiere cada uno

| Lenguaje | Dependencia | Particularidades |
|---|---|---|
| JS/TS (ya está) | `import`, `require`, `import()` | se extrae a `languages/javascript.mjs`; alias de `tsconfig` |
| **C#/.NET** | `using` + `namespace` | índice namespace→archivos, `partial`, `ProjectReference` entre `.csproj` como aristas de módulo, reflexión/DI como aristas punteadas; Roslyn como motor opcional |
| Python | `import`, `from … import`, relativos | `__init__.py`, layout `src/`, `pyproject` |
| Go | `import "mod/pkg"` | `go.mod`; el paquete es el directorio |
| Java/Kotlin | `package` + `import` | raíces de fuentes Maven/Gradle |
| Rust | `mod`, `use crate::` | workspace de Cargo |
| PHP | `use`, `require` | PSR-4 desde `composer.json` |
| C/C++ | `#include` | rutas de include |
| SQL/Proto/YAML | tablas, mensajes, claves | en fase de puentes |

**Reglas de usuario.** En `.codegraph/config.json` se pueden añadir lenguajes o patrones sin tocar código: `{ "languages": { "lua": { "exts": [".lua"], "imports": ["require\\([\"'](.+?)[\"']\\)"], "resolver": "dotted" } } }`.

### A5. Proyectos mixtos y puentes entre lenguajes

Cada archivo usa el adaptador de su extensión. Las aristas **entre** lenguajes salen de "puentes" opcionales: ruta HTTP (el `fetch('/api/units')` del dashboard ↔ el endpoint del backend, con OpenAPI como ancla), `.proto`/gRPC, P/Invoke y FFI, tablas SQL compartidas, variables de entorno. Es el caso de un panel JS que consume un backend C#.

### A6. Cambios por componente

- **analyze.mjs** → orquestador: recorre, elige adaptador por extensión, junta IR, resuelve, arma aristas. Los patrones `@rel` pasan a cada adaptador (según su sintaxis de comentario).
- **dupes.mjs** → tokenizador guiado por `lexer` del adaptador; extractor de unidades por estrategia: llaves (C#, Java, Go, Rust, JS), indentación (Python), personalizado.
- **metrics.mjs** → sin cambios de lógica; solo la detección de pruebas y de "entrada" pasa a ser por adaptador.
- **Visor** → lente "Lenguaje", resaltado del código dirigido por el `lexer` que viaja en el mundo, filtros por lenguaje, indicador de confianza.
- **serve.mjs** → vigila las extensiones de todos los adaptadores activos.

### A7. Pruebas

Un proyecto de ejemplo políglota (`demo/sample-poly`: frontend JS, API C#, script Python, servicio Go) con su grafo esperado y pruebas doradas por lenguaje. `run-demo.mjs` comprueba aristas, símbolos, ciclos y la confianza por lenguaje.

### A8. Fases

1. **M0 · Refactor sin cambios visibles:** extraer JS a un adaptador, IR y registro. El demo actual debe dar exactamente el mismo resultado.
2. **M1 · Motor declarativo + genérico + visor:** nivel 0 y 1, estrategias de resolución, lente de lenguaje, resaltado dirigido por datos, confianza del mapa.
3. **M2 · Lenguajes:** primero C# y Python (tu trabajo), luego Go, Java/Kotlin, Rust, PHP, C/C++.
4. **M3 · Puentes:** HTTP/OpenAPI, proto, SQL.
5. **M4 · Motores opcionales:** Roslyn y tree-sitter; reflexión y grafo de llamadas por función (ver recursión y radio de impacto).

**Riesgos y mitigación.** Regex impreciso → pruebas doradas, confianza visible y `overrides.json`. Tipos con el mismo nombre en espacios distintos → arista marcada como ambigua. Monorepos con varias raíces → `roots` en config. Rendimiento → el análisis por archivo es independiente y cacheable por hash.

---

## B. Exploración adelante/atrás

Hoy el visor no recuerda el recorrido: cada clic reemplaza el estado anterior. Hay tres ideas distintas bajo "ir adelante o atrás", y se tratan por separado.

### B1. Historial de navegación (como un navegador)

Una pila de *estados de vista*: `{ sel, selEdge, foco (ids + etiqueta), vista (ciudad/galaxia/grafo), pestaña, cámara, traza, camino, posición en la línea de tiempo, archivo y línea abierta, comparación de duplicados }`.

- **Qué crea una entrada:** seleccionar un nodo, enfocar vecindad/carpeta/módulo/hallazgo, abrir código en una línea, trazar un símbolo o un camino, cambiar de vista, soltar la línea de tiempo. **No** crea entrada: pasar el ratón, hacer pan o zoom (la cámara se guarda al salir de la entrada).
- **Semántica de navegador:** una navegación nueva descarta lo que había "adelante"; entradas consecutivas iguales se fusionan; máximo 100.
- **Controles:** botones ◀ ▶ junto a la búsqueda (el tooltip dice a dónde vas: «◀ orderService»), `Alt+←` y `Alt+→`, botones laterales del ratón, y un menú ▾ «Recorrido» con las últimas entradas con su etiqueta («Seleccionó orderService», «Enfocó módulo models», «Abrió format.mjs:12»).
- **Restaurar sin ensuciar:** `Nav.restore(estado)` usa las mismas funciones (`selectNode`, `setFocus`, `setMode`, `openCode`) con una bandera que evita registrar la restauración y vuela la cámara a la posición guardada. Si un archivo ya no existe (modo en vivo), la entrada se salta.
- **Seguridad de la edición:** si hay cambios sin guardar, volver atrás respeta la misma protección que cambiar de archivo.
- **Persistencia:** `sessionStorage` (sobrevive a recargar). En modo servidor local además se sincroniza con `history.pushState`, de modo que el botón Atrás del navegador funciona. En el artefacto publicado solo se admite `#ancla`, así que allí rige la pila propia.

### B2. Caminar por el grafo (adelante = dependencias, atrás = dependientes)

- Con un nodo seleccionado: `Shift+→` salta a la siguiente dependencia (ciclando por las que importa), `Shift+←` al siguiente archivo que lo usa; `Alt+↑` sube al padre (distrito/carpeta); `j`/`k` recorre la lista activa (resultados de búsqueda, hallazgos, copias de un grupo).
- Cada salto crea una entrada del historial, así que el camino recorrido se puede deshacer con B1.
- Panel «Recorrido»: miga de pan del camino (`A → B → C`) y botón para convertirlo en un *camino* resaltado en el mundo.

### B3. Tiempo adelante/atrás

Ya existen ‹ › en la línea de tiempo. Se unifican los atajos (`,` y `.` para commit anterior/siguiente, `Home`/`End` para inicio/hoy) y los cambios de tiempo se registran en el historial al soltar.

### B4. Recorridos guiados (extra)

Un *tour* es una lista ordenada de pasos `{ nodo, texto }` con ◀ ▶ para avanzar o retroceder narrando. Se puede grabar el recorrido propio, o pedir a la IA que lo genere («explícame el flujo de crear una orden»); el JSON de la IA ya admite `nodes` en sus acciones y se amplía con `tour`. Útil para incorporar a alguien nuevo al proyecto.

### B5. Implementación

Archivo nuevo `viewer/js/nav.js` (pila, `record`, `back`, `forward`, `go`, `snapshot`, `restore`), ganchos de una línea en las funciones de navegación existentes, botones en la cabecera, atajos en `ui.js`, panel «Recorrido» en `panels.js`. Prueba con Playwright: seleccionar A, enfocar B, abrir código, `Alt+←` tres veces regresa en orden, `Alt+→` rehace, una navegación nueva corta el futuro, y la recarga conserva la pila.

### B6. Fases

1. **N1 · Historial B1:** pila, botones, atajos, menú, persistencia y prueba.
2. **N2 · Caminar (B2) y tiempo (B3):** salto por vecinos, padre, lista activa, panel de recorrido; sincronización con `pushState` en modo servidor.
3. **N3 · Tours (B4).**

---

## Orden recomendado de ejecución

1. **Sprint 1:** M0 (refactor sin cambios) + N1 (historial). Son de bajo riesgo y desbloquean el resto.
2. **Sprint 2:** M1 (motor declarativo y visor multilenguaje) + N2.
3. **Sprint 3:** M2 con C# y Python primero, y el proyecto de ejemplo políglota.
4. **Después:** puentes, motores opcionales, reflexión, radio de impacto y grafo de llamadas, tours.

---

# Plan 3 · Legibilidad, temas y experiencia sin fatiga

**Problema reportado.** El mapa es potente pero obliga a acercarse para distinguir cosas y a esforzarse para ubicar y trazar. Hay que bajar la carga visual y la curva de aprendizaje sin perder la inmersión.

## C1. Diagnóstico (causas en el código actual)

| Síntoma | Causa | Arreglo |
|---|---|---|
| Hay que acercarse a la pantalla | Etiquetas de 10-15 px en monoespaciada, con poco halo; el ajuste de vista (`fitView`) limita el zoom a 1,6 y deja márgenes grandes | Texto con mínimo de 12 px reales, escala global de interfaz, halo del color del fondo, ajuste más cercano |
| Cuesta ubicar y trazar | Todo pesa lo mismo: edificios, calles, túneles, copias y anillos compiten a la vez | Jerarquía visual en 3 niveles y capas con presets (Calmado / Análisis / Detective) |
| Se pierde el contexto al acercarse | El detalle no depende del zoom | Zoom semántico: lejos = barrios y módulos; medio = nombres; cerca = símbolos |
| Colores difíciles de distinguir | El color es el único canal y los tonos son parecidos | Forma/patrón/icono además del color, paletas aptas para daltonismo, contraste mínimo |
| Cansancio | Pulso parpadeante en archivos «calientes», galaxia siempre en movimiento, colores muy saturados en todo | Animación apagada por defecto salvo en lo seleccionado; saturación alta solo para lo que importa |
| Clics difíciles | Edificios pequeños = objetivo pequeño | Área de clic mínima de 28 px |

## C2. Apariencia personalizable

Un panel **Apariencia** (engranaje en la cabecera) con vista previa en vivo, dividido en *Interfaz* y *Mapa*.

- **Temas predefinidos:** Noche suave (por defecto), Día, Alto contraste, Papel (sepia, para lectura larga), Seguro para daltonismo (paleta Okabe-Ito), Fósforo (terminal).
- **Editor de colores:** fondo, suelo, acento, advertencia, éxito, las 8 categorías (carpetas/módulos/autores), colores de **estados** (nuevo, activo, estable, dormido…), rampa de **riesgo** (4 paradas), color de copias y de túneles. Selector de color por token, con botón «restablecer».
- **Controles de comodidad:** escala de texto (100-160 %), densidad de etiquetas (mínima / normal / máxima), grosor de líneas, intensidad de animación (apagada / suave / normal), exageración de altura de los edificios (plano → alto), saturación y contraste del mapa, tipografía (con o sin monoespaciada en etiquetas).
- **Validador de contraste:** cada combinación editada se comprueba (texto 4,5:1, marcas 3:1) y avisa si no cumple, con botón «corregir».
- **Perfiles:** se guardan en el navegador; se exportan e importan como JSON; en modo servidor local se guardan en `.codegraph/theme.json` para compartirlos con el equipo.
- **Respeto al sistema:** `prefers-color-scheme`, `prefers-reduced-motion` y `prefers-contrast` fijan los valores iniciales.

**Implementación.** Ya existen tokens CSS (`--c0…--c7`, `--accent`, `--warn`…) que `readTheme()` lee. Falta mover a tokens lo que hoy está fijo en `core.js` (rampa de riesgo, colores de estado, copias) y añadir una capa de *overrides* aplicada a `:root` que vuelva a emitir el evento `theme`. Esquema de `theme.json`: `{ base, tokens:{…}, ui:{scale, labels, motion, height, saturation} }`.

## C3. Presupuesto visual (balance y menos fatiga)

1. **Lo que importa brilla, el resto descansa:** colores base de baja saturación; la saturación alta se reserva para excepciones (riesgo alto, copias que cuestan, cambios sin commit).
2. **Capas con presets:** *Calmado* (solo estructura y selección), *Análisis* (+ riesgo, ciclos), *Detective* (todo, incluidos túneles y copias). Por defecto, Calmado.
3. **Zoom semántico:** nivel lejano (barrios + módulos + top 5 de riesgo), medio (nombres de edificios), cercano (símbolos, líneas). Un máximo de etiquetas simultáneas según el zoom.
4. **Altura comprimida:** raíz cuadrada o logarítmica para que pocos edificios altos no tapen al resto; sombra suave; suelo con más contraste.
5. **Atenuación del contexto:** al seleccionar o enfocar, lo demás baja al 25 %, sin parpadeos; el anillo de «caliente» pasa a ser estático (el pulso es opcional).
6. **Zoom adaptativo al seleccionar:** la cámara se acerca hasta que el nombre del edificio y de sus vecinos sean legibles (≥ 13 px). No hace falta acercarse a mano.
7. **Orientación permanente:** minimapa más grande, brújula, miga de pan, botón «centrar en la selección», y la leyenda es clicable (clic en una categoría la aísla).
8. **Panel de lectura cómoda:** texto del panel de 14 px, secciones colapsables; el Resumen muestra 3 cosas y «ver más» abre el resto.

## C4. Curva de aprendizaje

- **Modos:** *Simple* (3 lentes: Carpeta, Estado, Riesgo; capas básicas) y *Completo*. Se empieza en Simple y las funciones avanzadas aparecen con «Más».
- **¿Qué quieres hacer?** Presets de tarea de un clic que fijan vista, lente, capas y foco: *Orientarme*, *Encontrar riesgo*, *Ver lo reciente*, *Revisar duplicación*, *Entender una dependencia*. Resuelve el «me obliga a ubicar y trazar».
- **Primera visita:** recorrido de 5 pasos, siempre saltable (qué es un edificio, qué significa el color, clic para ver detalle, `Ctrl+K`, ◀ ▶ del historial).
- **Ayuda en contexto:** botón «¿Qué estoy viendo?» con la leyenda explicada en una frase por lente («Altura = líneas de código»); atajos visibles en una barra discreta; la paleta de comandos describe cada acción.
- **Inmersión sin cansar:** vuelos de cámara suaves (duración configurable), niebla de profundidad ligera, estrellas fijas sin parpadeo; sin sonido ni efectos que compitan con la lectura.

## C5. Criterios de aceptación (se comprueban con Playwright)

1. En el ajuste de vista, barrios y los 8 nodos principales se muestran con texto ≥ 12 px y contraste ≥ 4,5:1.
2. Al seleccionar un nodo, el nombre queda ≥ 13 px sin usar zoom manual.
3. Todos los temas predefinidos pasan contraste AA (texto) y 3:1 (marcas); el tema «daltonismo» distingue las 8 categorías por simulación.
4. Un tema personalizado persiste tras recargar y se exporta/importa sin pérdida.
5. En modo Calmado no hay elementos que parpadeen ni se muevan sin interacción.
6. Una persona nueva encuentra «el archivo más riesgoso» en menos de 30 segundos sin ayuda.

## C6. Fases (la U1 va primero porque es el dolor actual)

1. **U1 · Legibilidad inmediata:** tamaño mínimo y halo de etiquetas, escala de texto, ajuste de vista más cercano, zoom adaptativo al seleccionar, áreas de clic, anillo «caliente» estático, animación suave por defecto.
2. **U2 · Sistema de temas:** tokens completos, panel Apariencia, temas predefinidos, editor con validador de contraste, perfiles e importación/exportación.
3. **U3 · Presupuesto visual:** zoom semántico, presets de capas, saturación y compresión de altura, leyenda clicable, minimapa y brújula.
4. **U4 · Aprendizaje:** modos Simple/Completo, presets de tarea, recorrido inicial, ayuda en contexto.
5. **U5 · Verificación:** pruebas de legibilidad y contraste automáticas, prueba con una persona nueva.

## Orden global actualizado

**Sprint 0:** U1 (legibilidad). **Sprint 1:** M0 (refactor multilenguaje) + N1 (historial) + U2 (temas). **Sprint 2:** M1 + N2 + U3. **Sprint 3:** M2 (C# y Python) + U4. Después: puentes, motores opcionales, reflexión, radio de impacto, tours, U5 continuo.

---

# Plan 4 · Pregúntale al proyecto: ciencia de datos que responde y cuestiona

**Idea.** El mundo ya tiene muchos datos (imports, git, riesgo, módulos, co-cambio, duplicación). Falta poder *preguntar* y recibir una respuesta apoyada en esos datos, con su evidencia, y con la información cuestionada: qué tan sólida es, qué supuestos tiene y qué la podría contradecir. Regla de oro: **ninguna respuesta sin evidencia**, y la evidencia siempre se puede abrir en el mundo.

## Q1. Cómo responde

1. **Motor determinista (sin IA obligatoria).** Un analizador ligero de preguntas en español e inglés (palabras clave + entidades: archivo, símbolo, autor, módulo, carpeta, fecha) las convierte en una *intención* y ejecuta una consulta sobre los datos del mundo. Cubre, por ejemplo:
   - «¿Qué es lo más riesgoso?» · «¿Por qué `orderService` es riesgoso?» (descompone el riesgo en sus factores)
   - «¿Qué pasa si cambio X?» (radio de impacto: dependientes directos e indirectos, por distancia)
   - «¿Quién conoce X?» · «¿Qué archivos dependen de una sola persona?»
   - «¿Qué cambió en los últimos 30 días?» · «¿Qué cambia junto con X?»
   - «¿Qué puedo borrar?» · «¿Dónde hay código duplicado?» · «¿Qué módulo es más frágil?»
   - «¿Cómo llego de A a B?» · «¿Quién usa la función f?»
2. **Capa de IA opcional** para preguntas libres: el visor arma un prompt con la pregunta, un resumen compacto del mundo y los hechos ya calculados; la IA responde citando ids. Después el visor **verifica**: todo id citado debe existir y todo número debe coincidir con los hechos entregados; lo que no verifica se marca como «no comprobado».

## Q2. Cómo cuestiona la información

Cada respuesta trae, además del resultado:

- **Evidencia:** lista de archivos, commits y cifras, cada una con un clic para verla en el mundo.
- **Comparación con el proyecto:** no «12 cambios», sino «12 cambios: percentil 94 del proyecto».
- **Confianza:** alta, media o baja según el tamaño de la muestra (pocos commits, historial corto, mapa con baja confianza por reflexión o lenguaje poco soportado).
- **Supuestos y límites:** qué datos se usaron y cuáles faltan («no hay pruebas de ejecución, solo imports»).
- **Contrapuntos:** el botón *Cuestionar* muestra lo que podría invalidar la conclusión («cambia mucho, pero tiene pruebas directas y tres autores; el riesgo real puede ser menor»).
- **Cómo se calculó:** fórmula y pesos a la vista.

## Q3. Herramientas estadísticas (`lib/stats.mjs`)

Percentiles y rangos dentro del proyecto; valores atípicos con desviación absoluta mediana (robusta ante pocos datos); tendencia de cambios por mes (pendiente); **soporte, confianza y lift** para el co-cambio (en lugar de un solo «strength»); concentración de autoría (Gini); proporción de commits que son correcciones (por palabras como *fix*, *hotfix*, *corrige*) como indicador de propensión a errores; intervalos por remuestreo para proporciones con pocos datos. Todo calculado en el cliente, sin servicios externos.

## Q4. Interfaz

- Un modo «pregunta» en `Ctrl+K` (se activa con `?`) y preguntas sugeridas según lo seleccionado.
- La respuesta aparece como tarjeta con: resumen en una frase, tabla/ranking, evidencia clicable, **Ver en el mundo** (resalta los nodos), **Cuestionar** y **Cómo lo calculé**.
- Las preguntas entran en el historial de navegación (◀ ▶) y se pueden fijar.

## Q5. Para otros agentes

El mismo motor vive en `lib/qa.mjs` (funciones puras, sin DOM): se usa en el visor, en una CLI (`node ask.mjs ./proyecto "¿qué cambia con orderService?"`) y se puede exponer como servidor MCP para que tu harness de agentes consulte el proyecto con las mismas garantías de evidencia.

## Q6. Aceptación

1. Un conjunto de preguntas doradas sobre el demo con respuesta y evidencia esperadas (p. ej. «¿qué cambia con `userRoutes`?» → `orderRoutes`, 4 commits).
2. Ninguna respuesta se emite sin al menos un elemento de evidencia.
3. Con menos de 5 commits la confianza es «baja» y se dice por qué.
4. Una respuesta de IA con un id o una cifra inventada se marca como no comprobada.
5. Tiempo de respuesta del motor determinista < 100 ms en el demo.

## Q7. Fases

1. **Q1 · Datos:** `stats.mjs`, radio de impacto, clasificación de commits de corrección, soporte/confianza/lift.
2. **Q2 · Motor de preguntas e interfaz** con las intenciones base.
3. **Q3 · Cuestionar:** confianza, supuestos, contrapuntos, percentiles.
4. **Q4 · IA con verificación.**
5. **Q5 · CLI y MCP.**

**Orden global actualizado:** Sprint 0 (legibilidad, U1) → Sprint 1 (M0 refactor, N1 historial, U2 temas, Q1 datos) → Sprint 2 (M1, N2, U3, Q2-Q3) → Sprint 3 (M2 C#/Python, U4, Q4) → después puentes, motores opcionales, Q5, tours.

---

## Estado de ejecución (Sprint 1 cerrado + M1)

**Hecho:** M0 (adaptador JS aislado), N1 (historial ◀ ▶ ▾), U2 (Aspecto/temas/colores), Q1 (estadística + radio de impacto), **M1 (motor multilenguaje declarativo)**.

**M1 en la práctica**
- Un lenguaje es un objeto de datos (`languages/specs.mjs`): extensiones, léxico (comentarios, cadenas, palabras clave), patrones de import, definiciones, estrategia de resolución (`dotted`, `namespace`, `go`, `rust`, `include`, `file`).
- Integrados: JS/TS (adaptador propio), Python, C#, Java, Kotlin, PHP, Go, Rust, C/C++.
- El orquestador trabaja en fases: parsear todo → `prepare` (índices de namespaces, módulos Go anidados) → enlaces normalizados (`link` o `resolve`) → aristas con símbolos y conteo de usos.
- Visor: lente **Lenguaje** con leyenda y resaltado de código dirigido por el léxico de cada lenguaje.
- Lenguajes propios sin tocar código: `.codegraph/config.json` → `"languages": { "ruby": { "exts": [".rb"], "lexer": {...}, "imports": [...], "resolver": "file" } }`; `"python": false` desactiva uno.
- Verificación: `node demo/run-demo.mjs` → 27 comprobaciones (18 JS/git/DRY + 9 en `demo/sample-poly`: JS, C#, Python, Go, Java, Rust, C).

**Pendiente de M1 (menor):** detección de duplicados (DRY) todavía solo para JS/TS; tokenizador por lenguaje es el siguiente paso. **Siguiente:** Sprint 2 → N2 (caminar con Shift+flechas, padre, j/k), U3 (zoom semántico, presets Calmado/Análisis/Detective), Q2–Q3 (motor de preguntas con evidencia).

---

## Estado de ejecución (Sprint 2)

**Hecho:** N2 · U3 (parcial) · U4 · Q2–Q5.
- **Preguntar (Q2–Q3)** — `lib/qa.mjs`: 9 preguntas (riesgo, impacto, acoplamiento oculto, duplicación, pruebas, autoría/factor autobús, código muerto, ciclos, salud) más pregunta libre y archivo detectado en el texto. Cada respuesta = titular + evidencia clicable + **confianza** (alta/media/baja con el porqué: nº de commits o límites del grafo) + **cuestiónala** (explicaciones alternativas y límites) + siguientes preguntas. Si no entiende, no inventa.
- **IA con evidencia (Q4):** botón «Copiar evidencia para la IA» (pregunta, hallazgo, evidencia, confianza, límites).
- **CLI y MCP (Q5):** `node ask.mjs <dir> "pregunta" [--json|--evidence|--list]` y `node mcp.mjs <dir>` (stdio, herramientas `ask`, `impact`, `refresh`, `questions`).
- **Caminar (N2):** Shift+→ dependencia más usada, Shift+← quién lo usa, Shift+↑/↓ vecinos de carpeta, J/K recorrido por riesgo (o por el grupo enfocado), U sube a la carpeta. Cada paso entra al historial ◀ ▶.
- **Vistas rápidas (U3):** Calmado / Análisis / Detective; clic en la leyenda aísla esos archivos.
- **Simple / Completo y bienvenida (U4):** modo Simple oculta lentes y pestañas avanzadas; recorrido de 4 pasos la primera vez (botón ? para repetirlo). Preferencias en localStorage.
- Verificación: 32 comprobaciones (`node demo/run-demo.mjs`).

**Aún pendiente (honesto):** duplicados (DRY) solo JS/TS; zoom semántico y modo «tour guiado» automático; Q5 aún no tiene «lo que cambió desde la última vez»; reflexión/confianza por enlace y grafo de llamadas/recursión; motores opcionales (Roslyn/tree-sitter) y puentes entre lenguajes (HTTP/gRPC/FFI); pushState en modo en vivo.

---

## Etiquetas con acomodo automático + relieve visual

- **Acomodo de etiquetas (render.js):** cada etiqueta prueba hasta 32 posiciones (arriba/abajo/lados/diagonales en 4 anillos) y elige la primera libre de otras etiquetas, de los marcadores de los demás elementos, de nombres de barrios/sistemas, del pin de selección y de los paneles flotantes (lentes, herramientas, minimapa, línea de tiempo). Si queda lejos, se une con una línea fina. Recuerda su posición para no «bailar» al mover la cámara. Las etiquetas de relaciones («juntos 4×», cardinalidad, copias) van en una pastilla y también se acomodan a lo largo del arco. Índice espacial en rejilla: escala a cientos de archivos.
- **Relieve y profundidad (Aspecto → «Relieve y profundidad»):** *Sombras de elementos* (sombra proyectada de edificios y estrellas), *Resplandor de relaciones* (brillo en las calles y mancha de color difuminada bajo los elementos conectados: acento = dependencia, verde = dependiente), *Difuminar lo que no importa* (desenfoque de lo no relacionado con la selección). Atajos Plano / Suave / Marcado. Se guardan con el tema; con más de 600 archivos el desenfoque se apaga solo.

---

## Rendimiento con proyectos enormes (código generado «a lo loco»)

Medido con proyectos sintéticos (`demo/bench/gen.mjs <N>` y `run.mjs <N>`: módulos de 25 archivos, 1–5 imports, 70 % locales):

| archivos | procesar (antes → ahora) | JSON del mundo | arranque del visor |
|---|---|---|---|
| 500 | 0,6 s | 2,3 MB | 1 s |
| 2 000 | 6,3 s → 1,7 s | 12,7 → 5,7 MB | 3 s |
| 8 000 | 108 s → 5 s | 56 → 23 MB | 31 s → 5,5 s |

Cuellos de botella corregidos: estadísticas recalculadas por archivo (O(N²·log N) → una ordenación + búsqueda binaria), clasificación de barrels (filtrar todas las aristas por archivo), radio de impacto (cierre transitivo con tope 2 500; 800 si >3 000 archivos; `capped` se informa como «al menos»), ids de impacto en el JSON (300 → 30 en proyectos grandes), repulsión del layout de grafo (O(N²) → rejilla espacial), recorte de comparaciones en duplicados.
Visor: recorte de lo que está fuera de pantalla, nivel de detalle (edificios diminutos = un polígono), efectos (sombras/difuminado) que se apagan solos por tamaño, arrastre con «foto» del mapa (60 fps incluso con 8 000), cambio de vista sin animación >1 500 archivos, sin etiquetas fuera de pantalla.
**Límites conocidos:** zoom/giro redibujan todo (≈10–17 fps con 2 000 en renderizado por software); el HTML incrustado supera los 16 MB del Artifact alrededor de 5 000 archivos (usar `serve.mjs`, que no incrusta); DRY es el siguiente cuello (shingles) por medir; falta agregación semántica (mostrar carpetas/módulos como un solo bloque al alejarse), worker para el análisis y carga por tramos desde el servidor.

---

## Plan 5 · Conjuntos (diagramas de Venn / Euler / UpSet)

**Idea.** Las carpetas son una jerarquía (ya la muestra la ciudad). Un Venn aporta cuando un archivo pertenece a varios grupos a la vez. Un *conjunto* = cualquier predicado sobre archivos que ya calculamos; las *regiones* (solo A, A∩B, A∩B∩C…) son donde está la información.

**Modelo (`lib/sets.mjs`, puro, lo usan el visor y la CLI/tests).**
- Catálogo de conjuntos con clave estable: `dir:` carpeta · `mod:` módulo detectado · `author:` autor (≥20 % de los commits) · `lang:` · `state:` · `risk:alto` · `cov:ninguna|directa|indirecta` · `flag:<bandera>` · `pkg:<paquete externo>` · `tag:<etiqueta @set>` · `reach:<archivo>` (a quién afecta) · `deps:<archivo>` (de qué depende, transitivo).
- `regions(sets)` → conteo y archivos por región con máscaras de bits (exacto, sin aproximar).
- `layout(sets)`: círculos con **área proporcional** (2 conjuntos: distancia por bisección sobre el área de la lente; 3: triángulo con las 3 distancias; contención si A⊂B). Etiqueta de cada región en su centroide (muestreo). Con 4–6 conjuntos: **UpSet** (barras + matriz de puntos), porque un Venn de 4+ es ilegible.
- Recetas: *Carpeta vs módulo* (¿qué archivos de una carpeta se comportan como otro módulo?), *Zona crítica* (riesgo alto ∩ sin pruebas ∩ muchos dependientes), *Conocimiento* (3 autores principales; lo que queda fuera del cruce = factor autobús), *Capas mezcladas* (paquetes externos), *Lenguajes*. Cada receta trae su «lectura» en palabras.
- Etiquetas propias: `// @set nombre` en un comentario añade el archivo al conjunto `tag:nombre` (como `@rel`).

**Visor (`viewer/js/sets.js`).** Pestaña **Conjuntos**: recetas → conjuntos elegidos (chips con color y conteo, máx. 6) → diagrama SVG (regiones clicables) → detalle de la región (archivos, «Mostrar en el mapa»). **Manchas en el mapa:** cada conjunto se pinta como una mancha translúcida y difuminada bajo sus archivos (reusa el resplandor), los cruces se ven donde ocurren; capa activable. Comando en Ctrl K.

**Pruebas.** Las regiones suman la unión; el área del círculo ≈ tamaño; la receta «zona crítica» devuelve lo esperado en el demo; `@set` se detecta; el visor no da errores y el diagrama se renderiza.

**Fuera de alcance ahora:** diagramas de Euler con anidamiento exacto de 4+ conjuntos, edición de conjuntos guardados, exportar a imagen.

**Estado Plan 5:** hecho — `lib/sets.mjs` (catálogo, regiones exactas, Venn con área proporcional para 1–3 conjuntos, UpSet para 4–6, 5 recetas, etiquetas `@set`), pestaña **Conjuntos** (modo Completo), fichas de color y manchas difuminadas en el mapa (capa activable), comandos en Ctrl K. 36 comprobaciones (4 nuevas). Pendiente: Euler exacto con anidamiento para 4+ conjuntos, guardar conjuntos con nombre, exportar el diagrama, evitar solapes de números en regiones diminutas del Venn.

**Plan 5 · ampliación:** vistas y conjuntos con nombre. «Guardar vista» recuerda la combinación de conjuntos (y su receta); «Guardar región como conjunto» convierte los archivos de una región en un conjunto fijo `★ nombre` que aparece en el catálogo («Mis conjuntos») y sirve para nuevos cruces. Se guardan en el navegador y, en modo en vivo, en `.codegraph/sets.json` (`GET/PUT /api/sets`, con el token de sesión). 37 comprobaciones.

---

## Pendientes cerrados (ronda final)

**Hecho.**
- **Código generado** (`lib/signals.mjs`): marcas en la cabecera (`@generated`, `DO NOT EDIT`, `<auto-generated>`, `Code generated by…`), nombres (`.g.cs`, `.pb.go`, `_pb2.py`, `.min.js`, `generated/`) y minificados. Bandera `generado`, riesgo 0, fuera de rankings y de la salud, hallazgo, conjunto `flag:generado`, pregunta «¿Qué código es generado?».
- **Reflexión / carga dinámica** por lenguaje (JS `require(var)`/`import(var)`/`eval`; C# `Activator`/`Type.GetType`/`Assembly.Load`; Java `Class.forName`; Python `getattr`/`importlib`/`eval`; PHP, Go `reflect`, Rust, Ruby). Bandera `reflexión`, baja la confianza de impacto, huérfanos y código muerto, pregunta propia.
- **Recursión**: grafo de llamadas por nombre dentro de cada archivo (directa y mutua con Tarjan) para cualquier lenguaje con definiciones (llaves o indentación). Bandera `recursión`, hallazgo y pregunta.
- **Puentes HTTP** (`lib/bridges.mjs`): rutas de servidor (Express, ASP.NET atributos y `MapGet`, Flask/FastAPI, Spring, Go) ↔ llamadas de cliente (`fetch`, `axios`, `HttpClient`, `requests`, `http.Get`). Aristas `bridge` punteadas con «GET /api/orders/:p». Heurístico: compara método y ruta normalizada.
- **DRY multilenguaje** (`lib/dupes.mjs`): tokenizador genérico y extractor de unidades por llaves (C#, Java, Kotlin, Go, Rust, PHP, C/C++, Swift, Scala, Dart) y por indentación (Python). Mismo motor de clones y casi-clones.
- **Venn**: números de regiones diminutas se separan con línea guía; Venn con ajuste tipo Euler (búsqueda local sobre el área de cada región) hasta 4 conjuntos, con el error mostrado; exportar como SVG autónomo (copiar; en vivo, guardar en `.codegraph/exports/`).
- **Zoom semántico**: con ≥ 400 archivos se puede alejar hasta 0,025 y, cuando los edificios miden menos de ~7,5 px, cada barrio se dibuja como un bloque con su cantidad y color medio; clic = acercar. Casilla «Agrupar barrios al alejar».
- **Desde la última vez**: foto compacta por proyecto en el navegador; bloque en Resumen y pregunta «¿Qué cambió desde la última vez?».
- **pushState en vivo**: el botón Atrás/Adelante del navegador recorre el mismo historial de exploración.

**No se hace (medido o innecesario).** Motores Roslyn / tree-sitter: añadirían dependencias nativas y el análisis declarativo ya cubre imports y tipos (el análisis tarda 1,4 s con 8 000 archivos). Puentes gRPC/FFI: sin contrato fiable por texto sin leer los `.proto`/cabeceras. Worker y streaming del servidor: el cuello real era algorítmico y ya se corrigió. Análisis incremental: el historial git se cachea por HEAD y el resto es rápido.

**Límites honestos.** Los puentes HTTP no ven URLs armadas en tiempo de ejecución ni prefijos de gateway. La recursión se empareja por nombre (puede haber falsos positivos con métodos homónimos). Con 4 conjuntos el Venn es un ajuste (el error se muestra); los números son exactos. «Desde la última vez» compara con la última visita guardada en ese navegador, no con una versión del repositorio.

**Pruebas.** 45 comprobaciones en `demo/run-demo.mjs` (antes 37): puentes, generado, reflexión, recursión, DRY en C#/Python/Go, preguntas nuevas, Venn de 4 conjuntos sin solapes y diferencia entre visitas. Verificado en navegador (sin errores de consola): Resumen, Conjuntos con 4 conjuntos, exportación en vivo, Atrás del navegador, 8 000 archivos con barrios agrupados.

---

## Ronda de realismo (probado contra Express, 400 commits)

Al pasar el análisis por un proyecto real aparecieron ruido y falsos hallazgos que los datos sintéticos no mostraban. Se corrigió lo que afectaba a la confianza en las respuestas:
- **Ejemplos fuera del producto** (`examples/`, `demo/`, `fixtures/`, `bench/`, `docs/`, `vendor/`…): bandera `ejemplo`, riesgo 0 y fuera de rankings, hallazgos, preguntas, duplicación y constantes. Se desactiva solo si casi todo el proyecto vive ahí; configurable con `aux` y `auxOff` en `.codegraph/config.json`.
- **Acoplamiento oculto**: ya no cuenta pares prueba↔código ni prueba↔prueba (son la relación normal, no un túnel oculto).
- **Constantes mágicas**: se ignoran números y textos triviales (`3`, `"function"`, `"utf8"`…).
- **Duplicación**: la pregunta ignora grupos que solo están en pruebas y nombra las funciones anónimas por su archivo.
Resultado en Express: 25 → 10 hallazgos y salud 74 → 88, sin ejemplos ni ruido en los rankings. 46 comprobaciones en el demo.

### Ronda de realismo II (Flask, Cobra, Serilog)
Probado contra Python, Go y C# reales (300 commits). Corregido:
- **Python**: los imports con sangría (dentro de funciones, `TYPE_CHECKING`, `try`) son diferidos: no cuentan para ciclos. El «ciclo» de 20 archivos de Flask pasó a un ciclo real de 2.
- **Go**: los archivos del mismo paquete (directorio) se usan entre sí sin importarse; ahora se enlazan por los nombres que usan (Cobra pasó de 15 a 117 aristas y de 12 «huérfanos» a 0).
- **C#, Java, Kotlin, Scala, PHP, Go**: los ciclos entre archivos del mismo directorio no se reportan (es lo normal en esos lenguajes).
- Las cadenas de bloques `import (...)` no cuentan como constantes repetidas; el aviso de «un solo dueño» ignora archivos de menos de 40 líneas; si más del 30 % de los exports no se usa dentro del proyecto se dice que **parece una librería** (son su API pública).
- La confianza de «lo más riesgoso» depende del motivo: estructural (grafo) o de historial (commits).
- **Archivos unidos por ensamblado** (plantillas, `<script src>`): se declaran como lenguaje en `.codegraph/config.json` (ver el de este repositorio: `<!--@include x-->` y `<script src>` con el resolvedor `file`). Sin código nuevo; 11 enlaces recuperados y cero huérfanos falsos.
47 comprobaciones en el demo.

---

## IA · guardarraíles para quien edita (`lib/guard.mjs`)

**Enfoque.** La IA consume el grafo; no lo sustituye. Todo es determinista y trae su evidencia (sin modelo propio, sin costo).

- **`plan_change(files)`** — antes de editar: riesgo y rol, radio de impacto (directos/indirectos), **pruebas a correr** (directas y de los dependientes), archivos que suelen cambiar junto aunque no se importen, código duplicado que habría que cambiar también, ciclos, puentes HTTP, y avisos (archivo generado, reflexión, sin pruebas, impacto cortado). Guarda una foto en `.codegraph/guard-baseline.json`.
- **`check_change()`** — después de editar: vuelve a analizar y compara con la foto. Marca *revisar* si hay ciclo nuevo, archivo nuevo sin pruebas, duplicación nueva, riesgo que cruza a alto, archivo generado modificado, archivo borrado que se usaba, o salud que baja ≥ 3. Indica también lo que mejoró.
- Misma lógica en terminal: `node guard.mjs <dir> plan <archivos…>` y `node guard.mjs <dir> check` (sale con código 1 si hay que revisar: sirve como puerta en CI o en un hook).

**Registro MCP:** `{ "command": "node", "args": ["/ruta/code-graph/mcp.mjs", "/ruta/al/proyecto"] }`

**Regla para el agente** (pegar en `CLAUDE.md` / `AGENTS.md` del proyecto):
> Antes de modificar archivos, llama a `plan_change` con las rutas que vas a tocar y corre las pruebas que indica. Después de editar, llama a `check_change`; si dice «revisar», corrige o explica por qué es aceptable antes de dar la tarea por terminada. No edites archivos marcados como generados.

**Límites.** Compara estructura (imports, ciclos, duplicación, pruebas), no ejecuta código; lo que se carga por nombre en ejecución no se ve (se avisa cuando hay reflexión). 49 comprobaciones en el demo, incluidas una edición simulada que introduce ciclo, archivo sin pruebas y duplicación.

- **`review_pr(base)`** / `node guard.mjs <dir> pr [base]` (`lib/pr.mjs`): resumen en Markdown listo para pegar en un PR. Extrae la base con `git archive`, la compara con el árbol actual (incluye lo que aún no está en commit) y muestra riesgo del cambio (bajo/medio/alto), archivos, qué revisar, notas, pruebas a correr y quién debería revisar. Base y actual se miden igual (sin historial) para no confundir cambios reales con diferencias de medición; sale con código 1 si el riesgo es alto. Ejemplo de CI: `node guard.mjs . pr origin/main >> $GITHUB_STEP_SUMMARY`.

**Siguiente (no hecho):** sugerencias de relaciones con candidatos detectados (túneles, constantes, puentes) como evidencia; explicaciones con citas.

---

## codemap_desktop

Adaptación de Code Graph como motor de grafo y visualizador arquitectónico embebido para el IDE **Codemap Desktop**.

### Objetivos y decisiones
1. **Consumo programático sin servidor obligatorio**: Se añade `adaptor.mjs` con `analyzeWorkspace(rootPath, options)`, `generateViewerBundle(world, options)` y `getGraphSummary(world)`. Permite al proceso de Electron analizar cualquier proyecto abierto y obtener tanto los datos estructurados en JSON (para paneles de relaciones, métricas y hallazgos) como el visor Canvas embebido.
2. **Puente bidireccional host ↔ visor (`viewer/js/bridge.js`)**:
   - **Visor → Host (`codemap:open-file`)**: Al hacer clic o doble clic en un nodo/edificio dentro del visor (Ciudad, Galaxia, Grafo), se notifica a la ventana contenedora (`window.parent.postMessage`) para que el editor de Codemap Desktop abra el archivo correspondiente de forma nativa.
   - **Host → Visor (`codemap:focus-file`)**: Cuando el usuario cambia de pestaña activa o navega en el árbol de archivos del IDE, el host envía un mensaje y la cámara del visor vuela suavemente al edificio correspondiente en el Canvas (`selectNode(id, { fly: true })`).
   - **Control de vistas (`codemap:set-view`)**: Permite conmutar programáticamente entre Ciudad, Galaxia y Grafo desde la barra de herramientas del IDE.
3. **Cero dependencias y Node ≥ 22 ESM**: Toda la adaptación mantiene la arquitectura pura sin librerías externas.
4. **Soporte multiplataforma en `lib/pr.mjs`**: Uso de pipe directo entre `git archive` y `tar -xf -` sin requerir `sh`, garantizando compatibilidad nativa en Windows y sistemas Unix.

