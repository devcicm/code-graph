import { analyze } from '../../analyze.mjs';
import { buildSnapshot } from '../../lib/snapshot.mjs';
const N = process.argv[2], d = `/tmp/bench/p${N}`; let t = performance.now(); const lap = (s) => { const n = performance.now(); console.log(String(N).padStart(5), s.padEnd(22), ((n - t) / 1000).toFixed(2) + 's'); t = n; };
const g = analyze(d, { externals: false }); lap('analyze ' + g.nodes.length + 'n/' + g.edges.length + 'e');
const w = buildSnapshot(d, { git: false, dupes: process.argv[3] === 'nodupes' ? false : undefined }); lap('snapshot total');
console.log('   world json MB', (JSON.stringify(w).length / 1e6).toFixed(1), 'mem MB', (process.memoryUsage().heapUsed / 1e6).toFixed(0));
