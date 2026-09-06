import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const tsc = require.resolve('typescript/bin/tsc');

await build({
    absWorkingDir: packageRoot,
    entryPoints: ['src/index.ts'],
    outdir: 'lib',
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
    sourcemap: true,
    chunkNames: 'chunks/[name]-[hash]',
    external: ['qrcode-generator', 'universal-label-core'],
    logLevel: 'info'
});

const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
    cwd: packageRoot,
    stdio: 'inherit'
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
