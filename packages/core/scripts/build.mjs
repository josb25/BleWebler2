import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const tsc = require.resolve('typescript/bin/tsc');

const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
  cwd: packageRoot,
  stdio: 'inherit'
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
