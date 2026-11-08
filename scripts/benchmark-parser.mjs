import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';

// Load the same TypeScript parser as the application, without timing module loading.
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { parseTikzDocument } = await server.ssrLoadModule('/src/core/parser/parser.ts');
  for (const count of [100, 500, 1000]) {
    const source = [
      '\\begin{tikzpicture}',
      ...Array.from({ length: count }, (_, i) =>
        `\\node[minimum width=2cm] (n${i}) at (${i % 20}, ${Math.floor(i / 20)}) {Node ${i}};`
      ),
      '\\end{tikzpicture}',
    ].join('\n');
    for (let i = 0; i < 5; i++) parseTikzDocument(source);
    const samples = [];
    for (let i = 0; i < 15; i++) {
      const start = performance.now();
      const doc = parseTikzDocument(source);
      samples.push(performance.now() - start);
      if (doc.nodes.length !== count) throw new Error('Incorrect parsed node count');
    }
    samples.sort((a, b) => a - b);
    console.log(`${count} nodes: median ${samples[7].toFixed(2)} ms, p95 ${samples[14].toFixed(2)} ms`);
  }
} finally {
  await server.close();
}
