import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
// Separate processes and shuffled tests catch clock/import scheduling and
// module-level state leakage on both Linux and Windows, without retrying failures.
for (const seed of [1, 2, 3, 4, 5]) {
  console.log(`\nProject and Agent store isolation check: seed ${seed}`);
  const result = spawnSync(process.execPath, [
    vitest, 'run', 'src/store/__tests__/useProjectStore.test.ts', 'src/store/__tests__/useAgentStore.test.ts',
    '--sequence.shuffle', '--sequence.seed', String(seed), '--reporter=dot',
  ], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
