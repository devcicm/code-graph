# Code Graph

Convierte un repositorio en un **mundo que se recorre**: cada archivo es un edificio (o un planeta, o un nodo), el tamaño dice cuánto pesa, el color dice qué le pasa y el tiempo se puede rebobinar commit a commit.

Responde rápido, sin leer cientos de archivos: ¿qué hay aquí?, ¿qué depende de qué?, ¿qué está cambiando?, ¿dónde duele si toco algo?, ¿quién lo conoce?, ¿qué conviene hacer primero? Y **cada respuesta trae su evidencia, su confianza y sus límites**.

- **Cero dependencias.** Node.js ≥ 22, módulos ES (`.mjs`). Nada que instalar.
- **Visor autocontenido.** Un solo HTML con Canvas 2D, sin librerías externas.
- **Multilenguaje.** JS/TS, Python, C#, Java, Kotlin, PHP, Go, Rust y C/C++ integrados; más lenguajes por configuración.
- **Pensado para agentes.** La IA *consume* el grafo (servidor MCP, guardarraíles antes y después de editar); no lo sustituye.

## Inicio rápido

```bash
git clone https://github.com/devcicm/code-graph.git
cd code-graph

node demo/run-demo.mjs                     # crea un repo de prueba con historial, se autoverifica y genera demo/out/*.html
node serve.mjs ./mi-proyecto               # mundo en vivo con edición real → http://127.0.0.1:4173
node build-viewer.mjs ./mi-proyecto dist   # visor estático: dist/viewer.html (doble clic y listo)
```

## Qué ves

### Tres vistas, un mismo mundo

| Vista | Metáfora | Para qué |
|---|---|---|
| **Ciudad** (por defecto) | Carpetas = distritos, archivos = edificios | Orientarse, ver dónde está el peso |
| **Galaxia** | Módulos detectados = sistemas, archivos = planetas | Ver agrupaciones reales frente a carpetas |
| **Grafo** | Fuerzas: lo que se importa se atrae | Ver dependencias y ciclos |

### Lentes

- **Color:** carpeta, módulo, lenguaje, estado, riesgo, autor principal, cobertura de pruebas, antigüedad, duplicación.
- **Tamaño:** líneas, usos (fan-in), cambios en 90 días, riesgo.
- **Estado** del ciclo de vida: nuevo, modificado sin commit, activo, estable, dormido, huérfano.
- **Riesgo explicable (0-100):** ciclos, usos, cambios recientes, falta de pruebas, dueño único, tamaño. Cada punto tiene su motivo.

### Git y tiempo

Historial real (`git log -M`) con autores, renombres y borrados. La **línea de tiempo** reproduce el crecimiento del proyecto; la pestaña Código muestra autoría por línea (blame) y cambios pendientes (diff).

## Qué analiza

- **Dependencias y símbolos:** imports, reexports, cargas dinámicas, traza de símbolos a través de barrels y camino entre dos archivos.
- **Módulos** detectados por propagación de etiquetas, **acoplamiento temporal** (archivos que cambian juntos) y «túneles ocultos» cuando no hay import entre ellos.
- **Salud** del proyecto (0-100) y **hallazgos** priorizados con «qué conviene hacer».
- **Duplicación (DRY)** en todos los lenguajes: clones exactos, parametrizados y similares, constantes mágicas y homónimos. El costo sale de git: un grupo «se paga» si sus copias cambian juntas.
- **Señales:** código generado, reflexión o carga dinámica, recursión (directa y mutua).
- **Puentes HTTP** entre lenguajes: rutas de servidor (Express, ASP.NET, Flask/FastAPI, Spring, Go) ↔ llamadas de cliente (`fetch`, `axios`, `HttpClient`, `requests`, `http.Get`).
- **Conjuntos:** diagramas de Venn con área proporcional (1-4 conjuntos) y UpSet (hasta 6) sobre carpetas, módulos, autores, riesgo, cobertura, etiquetas `// @set`…
- **Estadística** (`lib/stats.mjs`): percentiles, atípicos robustos, soporte/confianza/lift del co-cambio, Gini de autoría y radio de impacto.

## Pregúntale al proyecto

Un motor determinista (sin IA obligatoria) responde preguntas en español o inglés: riesgo, impacto, acoplamiento oculto, duplicación, pruebas, autoría y factor autobús, código muerto, ciclos, salud, código generado, reflexión, recursión y «qué cambió desde la última vez». Cada respuesta incluye titular, evidencia clicable, confianza (alta/media/baja con el porqué) y un apartado **«cuestiónala»** con explicaciones alternativas y límites. Si no entiende la pregunta, no inventa.

```bash
node ask.mjs ./mi-proyecto "¿qué se rompe si cambio orderService?"
node ask.mjs ./mi-proyecto --list            # preguntas disponibles
node ask.mjs ./mi-proyecto "¿qué es lo más riesgoso?" --json
```

En el visor: `Ctrl+K` y `?` para entrar en modo pregunta.

## Para agentes de IA

### Servidor MCP

```json
{ "command": "node", "args": ["/ruta/code-graph/mcp.mjs", "/ruta/al/proyecto"] }
```

Herramientas: `ask`, `impact`, `plan_change`, `check_change`, `review_pr`, `refresh`, `questions`.

### Guardarraíles

- **`plan_change`** (antes de editar): riesgo y rol, radio de impacto, pruebas a correr, archivos que suelen cambiar juntos, duplicados, ciclos, puentes HTTP y avisos. Guarda una foto en `.codegraph/guard-baseline.json`.
- **`check_change`** (después de editar): compara con la foto y marca *revisar* si hay ciclo nuevo, archivo nuevo sin pruebas, duplicación nueva, riesgo que cruza a alto, archivo generado modificado, archivo borrado que se usaba o salud que baja.
- **`review_pr`**: resumen de riesgo en Markdown listo para pegar en un PR.

Los mismos desde la terminal (salen con código 1 cuando hay que revisar, útil como puerta en CI o en un hook):

```bash
node guard.mjs ./mi-proyecto plan src/orderService.js
node guard.mjs ./mi-proyecto check
node guard.mjs . pr origin/main >> $GITHUB_STEP_SUMMARY
```

Regla sugerida para el `CLAUDE.md` / `AGENTS.md` de tu proyecto:

> Antes de modificar archivos, llama a `plan_change` con las rutas que vas a tocar y corre las pruebas que indica. Después de editar, llama a `check_change`; si dice «revisar», corrige o explica por qué es aceptable antes de dar la tarea por terminada. No edites archivos marcados como generados.

## Comandos

| Comando | Qué hace |
|---|---|
| `node serve.mjs <proyecto> [--port 4173] [--externals] [--no-open]` | Servidor **solo local** (127.0.0.1, token de sesión, Host/Origin validados, rutas confinadas) con edición real (`Ctrl+S`), detección de conflictos y refresco automático |
| `node build-viewer.mjs <proyecto> [outDir] [--externals]` | Visor estático de solo lectura: `viewer.html` y `viewer.fragment.html` (para publicar como Artifact) |
| `node analyze.mjs <dir> [--out graph.json] [--externals] [--overrides ov.json] [--prompt ai-prompt.md]` | Solo el grafo en JSON; opcionalmente genera el prompt para la IA o fija relaciones aceptadas |
| `node ask.mjs <dir> "pregunta" [--json] [--evidence] [--list]` | Preguntas con evidencia desde la terminal |
| `node guard.mjs <dir> plan\|check\|pr` | Guardarraíles para quien edita |
| `node mcp.mjs <dir>` | Servidor MCP por stdio |
| `node demo/run-demo.mjs` | Demo completo y autoverificación (49 comprobaciones) |

## Configuración

Opcional, en `.codegraph/config.json` del proyecto analizado:

```json
{
  "languages": {
    "ruby": {
      "exts": [".rb"],
      "lexer": { "line": ["#"], "strings": ["\"", "'"] },
      "imports": [{ "re": "require_relative ['\"](.+?)['\"]", "spec": 1 }],
      "resolver": "file"
    },
    "python": false
  },
  "dupes": { "threshold": 0.85, "minTokens": 50, "exclude": ["generated/"] },
  "aux": ["sandbox/"]
}
```

- **Lenguajes propios** sin tocar código (estrategias de resolución: `dotted`, `namespace`, `go`, `rust`, `include`, `file`); `false` desactiva uno.
- **Duplicación:** umbral, tamaño mínimo y exclusiones.
- **Carpetas auxiliares** (`examples/`, `demo/`, `fixtures/`, `bench/`, `docs/`, `vendor/`…) se marcan como `ejemplo` con riesgo 0; ajustable con `aux` y `auxOff`.
- **Anotaciones en el código:** `// @rel Destino 1:N etiqueta` (relación con cardinalidad) y `// @set nombre` (conjunto propio).

El archivo [`.codegraph/config.json`](.codegraph/config.json) de este repositorio es un ejemplo real: declara las plantillas HTML para enlazar `<!--@include-->` y `<script src>`.

## Arquitectura

```
proyecto ──► analyze.mjs + languages/ ──┐
   │        (imports, símbolos, ciclos)  ├─► lib/metrics.mjs ─► lib/snapshot.mjs ─► world.json ─► viewer.html
   └─► lib/git.mjs (historial, blame) ───┘   (estados, riesgo,                          ▲
                                              módulos, co-cambio)                        │
                              serve.mjs ── API local + SSE + edición ────────────────────┘
```

| Ruta | Contenido |
|---|---|
| `analyze.mjs` | Orquestador: recorre, elige adaptador por extensión, resuelve y arma aristas |
| `languages/` | `javascript.mjs` (adaptador JS/TS), `declarative.mjs` + `specs.mjs` (motor declarativo y lenguajes integrados) |
| `lib/` | `git`, `metrics`, `stats`, `dupes`, `signals`, `bridges`, `qa`, `sets`, `guard`, `pr`, `snapshot`, `assemble` |
| `viewer/` | `world.template.html` + `js/*`, ensamblados en un único HTML |
| `demo/` | `run-demo.mjs`, proyectos de ejemplo (`sample-shop`, `sample-poly`, `sample-dry`) y `bench/` |
| [`PLAN.md`](PLAN.md) | Diseño, estado de cada fase y decisiones |

## Probado con proyectos reales

Express (JS), Flask (Python), Cobra (Go) y Serilog (C#). Rendimiento medido con proyectos sintéticos: 8 000 archivos se procesan en unos 5 s y el visor arranca en unos 5,5 s.

## Límites conocidos

- El análisis es por patrones y tokenizador propio, no por AST: TypeScript con tipos complejos puede perder alguna función.
- El riesgo es una heurística explicable, no una verdad.
- Los puentes HTTP no ven URLs armadas en tiempo de ejecución ni prefijos de gateway; la recursión se empareja por nombre.
- Lo que se carga por nombre en ejecución no se ve (se avisa cuando hay reflexión).
- El HTML incrustado supera los 16 MB cerca de 5 000 archivos: para proyectos grandes usa `serve.mjs`, que no incrusta.
- Se necesita git para los estados temporales.

## Desarrollo

Cada cambio actualiza [`PLAN.md`](PLAN.md), añade una comprobación en `demo/run-demo.mjs` y se verifica el visor en el navegador sin errores de consola. Antes de dar algo por terminado:

```bash
node demo/run-demo.mjs   # todas las comprobaciones deben pasar
```
