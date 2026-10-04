import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
const N = +process.argv[2], dir = `/tmp/bench/p${N}`; rmSync(dir, { recursive: true, force: true });
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const mods = Math.ceil(N / 25), files = [];
for (let i = 0; i < N; i++) { const m = Math.floor(i / 25); files.push(`m${m}/f${i}.mjs`); }
for (let i = 0; i < N; i++) {
  const imps = []; const k = 1 + Math.floor(rnd() * 5);
  for (let j = 0; j < k; j++) { const t = Math.floor(rnd() < 0.7 ? Math.max(0, i - 1 - Math.floor(rnd() * 30)) : rnd() * i); if (t < i) imps.push(t); }
  const me = files[i], body = [...new Set(imps)].map((t) => { const rel = files[t].startsWith(me.split('/')[0] + '/') ? './' + files[t].split('/')[1] : '../' + files[t]; return `import { fn${t} } from '${rel}';`; });
  const fns = `export function fn${i}(a, b) {\n  const x = a + b * ${i % 7};\n  ${[...new Set(imps)].map((t) => `fn${t}(x, ${t});`).join('\n  ')}\n  return x > ${i % 11} ? x : -x;\n}\n`;
  mkdirSync(`${dir}/${me.split('/')[0]}`, { recursive: true }); writeFileSync(`${dir}/${me}`, body.join('\n') + '\n' + fns);
}
