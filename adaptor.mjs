// code-graph · adaptor.mjs — adaptador modular para integración en proyectos externos (Codemap Desktop)
// Proporciona una API programática limpia para análisis estático, métricas del grafo,
// y generación del visor interactivo (con puente bidireccional IPC / postMessage).
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { buildSnapshot } from './lib/snapshot.mjs';
import { assemble } from './lib/assemble.mjs';
import { buildViewer } from './build-viewer.mjs';

/**
 * Analiza un directorio de workspace y retorna el modelo completo de datos del mundo.
 *
 * @param {string} rootPath - Ruta absoluta o relativa al directorio del proyecto.
 * @param {object} [options={}] - Opciones de análisis:
 *   - externals: bool (incluir dependencias externas/node_modules si aplica)
 *   - embedFiles: bool (incrustar contenido textual de archivos para visor estático)
 *   - git: bool (analizar historial de git, blame, churn, autores)
 *   - dupes: bool (análisis de duplicación de código DRY)
 * @returns {object} El objeto world con nodos, aristas, métricas, comunidades y hallazgos.
 */
export function analyzeWorkspace(rootPath, options = {}) {
  const absRoot = resolve(rootPath);
  if (!existsSync(absRoot)) {
    throw new Error(`Ruta de proyecto no encontrada: ${absRoot}`);
  }

  const snapshotOptions = {
    embedFiles: options.embedFiles ?? true,
    externals: options.externals ?? false,
    git: options.git ?? true,
    dupes: options.dupes ?? true,
    ...options
  };

  return buildSnapshot(absRoot, snapshotOptions);
}

/**
 * Genera el paquete HTML completo del visor con los datos del mundo incrustados.
 *
 * @param {object} world - Objeto de datos generado por analyzeWorkspace() o buildSnapshot().
 * @param {object} [options={}] - Opciones de empaquetado:
 *   - full: bool (retorna documento completo <!doctype html> con head y estilos; por defecto true)
 *   - live: object|null ({ token, root, abs } para modo servidor dinámico)
 * @returns {string} Código HTML del visor autocontenido.
 */
export function generateViewerBundle(world, options = {}) {
  return assemble({
    world,
    live: options.live ?? null,
    full: options.full ?? true
  });
}

/**
 * Guarda el visor en un directorio de salida.
 *
 * @param {object} world - Objeto de datos del mundo.
 * @param {string} outDir - Directorio donde se guardará el visor.
 * @param {string} [name='viewer'] - Nombre base del archivo generado.
 * @returns {string} Ruta absoluta del archivo viewer.html generado.
 */
export function saveViewer(world, outDir, name = 'viewer') {
  return buildViewer(world, resolve(outDir), name);
}

/**
 * Extrae un resumen rápido de métricas clave del mundo analizado,
 * ideal para alimentar paneles y vistas sintéticas de Codemap Desktop.
 *
 * @param {object} world - Objeto retornado por analyzeWorkspace().
 * @returns {object} Métricas sintetizadas.
 */
export function getGraphSummary(world) {
  if (!world || !world.nodes) return null;

  const fileNodes = world.nodes.filter((n) => n.kind === 'file');
  const codeNodes = fileNodes.filter((n) => !n.isTest);
  const testNodes = fileNodes.filter((n) => n.isTest);

  const topRisk = [...codeNodes]
    .sort((a, b) => (b.risk?.score || 0) - (a.risk?.score || 0))
    .slice(0, 10)
    .map((n) => ({
      id: n.id,
      label: n.label,
      score: n.risk?.score || 0,
      reasons: n.risk?.reasons || [],
      loc: n.loc || 0,
      state: n.state
    }));

  return {
    root: world.meta?.root || '',
    health: world.meta?.health ?? null,
    totalFiles: fileNodes.length,
    codeFiles: codeNodes.length,
    testFiles: testNodes.length,
    totalEdges: world.edges?.length || 0,
    communities: (world.communities || []).map((c) => ({ id: c.id, name: c.name, size: c.size })),
    languages: world.meta?.languages || {},
    findingsCount: world.findings?.length || 0,
    topRisk
  };
}

export default {
  analyzeWorkspace,
  generateViewerBundle,
  saveViewer,
  getGraphSummary
};
