import { build } from 'esbuild';
import { resolve } from 'node:path';

const here = import.meta.dirname;
const project = (...parts) => resolve(here, '../..', ...parts);
const aliases = {
  'universal-label-core': project('packages/core/src/index.ts'),
  'universal-label-core/transport/dummy': project('packages/core/src/core/transports/dummy-transport.ts'),
  'universal-label-core/transport/node': project('packages/core/src/core/transports/node-ble-transport.ts'),
  'universal-label-core/transport/node-serial': project('packages/core/src/core/transports/node-serial-transport.ts'),
  'universal-label-core/transport/node-usb': project('packages/core/src/core/transports/node-usb-transport.ts'),
  'universal-label-renderer': project('packages/renderer/src/index.ts')
};

await build({
  entryPoints: [resolve(here, 'src/index.ts')],
  outfile: resolve(here, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: ['@napi-rs/canvas', '@stoprocent/noble', 'usb', 'serialport', '@serialport/*', 'bluetooth-hci-socket'],
  logLevel: 'info',
  plugins: [{
    name: 'workspace-sources',
    setup(builder) {
      builder.onResolve({ filter: /^universal-label-(?:core(?:\/.*)?|renderer)$/ }, args => {
        const path = aliases[args.path];
        if (!path) return { errors: [{ text: `Unsupported workspace import: ${args.path}` }] };
        return { path };
      });
    }
  }]
});
