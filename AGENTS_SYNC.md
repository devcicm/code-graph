# Bitácora de Sincronización y Registro de Contexto entre Agentes
**Repositorio:** `devcicm/code-graph`  
**Rama Activa de Adaptación:** `codemap_desktop`  
**Rama Base Congelada:** `base` (`8c18f96`)  
**Rama Principal:** `main` (del Agente 1)

Este documento sirve como bitácora viva para que el **Agente 1** (y futuros agentes) conozcan las decisiones de diseño, contratos de integración y mejoras portables introducidas por el **Agente 2** al adaptar Code Graph para su consumo en el IDE **CodeMap Desktop**.

---

## 1. Roles y Directivas de Colaboración

- **Agente 1 (`main`)**: Desarrolla el producto central de Code Graph (CLI, servidores autónomos, visores estáticos y documentación general).
- **Agente 2 (`codemap_desktop`)**: Adapta Code Graph como motor de grafo embebido y visor interactivo para el IDE de escritorio, respetando que el código permanezca puro (Node ≥ 22 ESM, sin dependencias externas).
- **Rama `base`**: Inmutable. No se modifica bajo ninguna circunstancia.

---

## 2. Bitácora Cronológica de Cambios (Commits en `codemap_desktop`)

### Commit `5866b42`: `fix(pr): soporte multiplataforma en baseFingerprint usando pipe directo a tar sin sh`
- **Problema:** En sistemas Windows nativos, la extracción de git archive fallaba con `spawnSync sh ENOENT` porque no existe el binario `sh` en el PATH del sistema, haciendo fallar la comprobación 27 de `demo/run-demo.mjs`.
- **Solución:** Se reemplazó la llamada a shell por un pipe en memoria en Node entre `spawnSync('git', ...)` y `spawnSync('tar', ['-xf', '-', '-C', tmp], { input: archive.stdout })`.
- **Evidencia:** 49 de 49 comprobaciones de `demo/run-demo.mjs` pasando al 100% en Windows y Linux.
- **Portabilidad para `main`:** 🟢 Altamente recomendado para cherry-pick directo en `main`.

### Commit `9a48b85`: `feat(adaptor): interfaz programática y puente bidireccional postMessage para codemap desktop`
- **Archivos creados/modificados:**
  - `adaptor.mjs`: Expone `analyzeWorkspace(rootPath, options)`, `generateViewerBundle(world, options)` y `getGraphSummary(world)`.
  - `viewer/js/bridge.js`: Implementa el protocolo de mensajería `postMessage` para entornos embebidos (iframes o ventanas auxiliares de Electron).
  - `viewer/js/ui.js`: Emite `Bus.emit('node-selected', S.N[id])` para notificar al host cuando el desarrollador hace clic en un edificio.
  - `viewer/world.template.html`: Incluye `<!--@include js/bridge.js-->` e inicializa `initBridge()` tras `boot()`.
  - `PLAN.md`: Documenta la arquitectura en la sección `## codemap_desktop`.
- **Comportamiento:** Si el visor corre de forma independiente (navegador o CLI), `bridge.js` detecta `window.parent === window` y no realiza ninguna acción extraña, preservando la compatibilidad standalone original.

### Actualización: `feat(relations): diagnóstico ejecutivo de salud y top criticidad en panel lateral`
- **Contexto UI en el Host (`codemap desktop`):**
  - La pestaña lateral `CodeMap Relations` fue revitalizada para no limitarse a un contador de aristas salientes/entrantes que quedaba vacío en archivos como `STARTUP_REPORT.md`.
  - Incorpora el bloque de **Salud del Proyecto** con anillo SVG dinámico (score 0-100, grado de salud, lista de advertencias arquitectónicas y acordeón de hallazgos con severidad).
  - Incorpora la sección ejecutiva **Dónde mirar primero** (los 5 archivos de mayor riesgo del repositorio con badges de estado y score, con apertura instantánea en el editor nativo).
  - **Ficha inteligente del archivo seleccionado:** discrimina entre archivos de código y documentación/auxiliares. Oculta el grafo vacío si no hay aristas y muestra tarjetas claras de contexto; si hay aristas, despliega el vecindario SVG interactivo, dependencias salientes/entrantes, co-cambios temporales Git y duplicados DRY.
  - Incluye selector de vista (`[ Todo | Proyecto | Archivo ]`) y botón directo `⤢ Expandir Code Graph` para abrir la ventana 3D independiente de Electron.

---

## 3. Protocolo de Comunicación del Puente (`viewer/js/bridge.js`)

Cuando el visor corre dentro de una ventana o iframe de un IDE:

| Origen | Mensaje / Tipo | Payload | Acción |
|---|---|---|---|
| **Visor ➔ Host** | `codemap:ready` | `{}` | Notifica al IDE que el mundo y el Canvas 2D están listos. |
| **Visor ➔ Host** | `codemap:open-file` | `{ file, root, fullPath, state, risk, loc }` | Solicita al IDE abrir el archivo en el editor nativo. |
| **Host ➔ Visor** | `codemap:focus-file` | `{ file }` | Mueve la cámara del mapa (`flyToNode`) hacia el edificio correspondiente. |
| **Host ➔ Visor** | `codemap:set-view` | `{ view: 'city' \| 'galaxy' \| 'graph' }` | Alterna la proyección del visor programáticamente. |
| **Host ➔ Visor** | `codemap:set-lens` | `{ lens: { color: 'risk' \| 'module' \| ... } }` | Cambia el modo de visualización de colores/tamaños. |

---

## 4. Pruebas y Criterio de Aprobación
Antes de dar cualquier cambio por terminado en esta rama:
```bash
node demo/run-demo.mjs
```
Debe aprobar las 49 comprobaciones de autoverificación (imports, ciclos, git, duplicación DRY, preguntas con evidencia, conjuntos de Venn, guardarraíles y puentes HTTP).
