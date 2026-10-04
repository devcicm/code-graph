/* ───────────────────────── bridge.js · integración bidireccional con host (codemap desktop) ───────────────────────── */
function initBridge() {
  if (typeof window === 'undefined') return;
  const isEmbedded = window.parent && window.parent !== window;

  // Notificar al host que el visor está listo
  if (isEmbedded) {
    try {
      window.parent.postMessage({ source: 'codegraph-viewer', type: 'codemap:ready' }, '*');
    } catch {}
  }

  // Escuchar mensajes entrantes del host contenedor
  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object' || msg.source !== 'codemap-host') return;

    if (msg.type === 'codemap:focus-file' && msg.file) {
      const id = String(msg.file).replace(/\\/g, '/');
      const target = S.N[id] ? id : Object.keys(S.N).find((k) => id.endsWith(k) || k.endsWith(id));
      if (target) {
        selectNode(target, { fly: true });
      }
    } else if (msg.type === 'codemap:set-view' && msg.view) {
      if (typeof switchView === 'function') {
        switchView(msg.view);
      }
    } else if (msg.type === 'codemap:set-lens' && msg.lens) {
      if (msg.lens.color && $('#lensColor')) {
        S.lens.color = msg.lens.color;
        if (typeof renderLegend === 'function') renderLegend();
        if (typeof requestRender === 'function') requestRender();
      }
    }
  });

  // Notificar al host cuando se seleccione un nodo en el visor
  Bus.on('node-selected', (n) => {
    if (!n || !isEmbedded) return;
    try {
      window.parent.postMessage({
        source: 'codegraph-viewer',
        type: 'codemap:open-file',
        file: n.id,
        root: S.world?.meta?.root || '',
        fullPath: S.world?.meta?.root ? `${S.world.meta.root}/${n.id}` : n.id,
        state: n.state,
        risk: n.risk?.score,
        loc: n.loc
      }, '*');
    } catch {}
  });
}
