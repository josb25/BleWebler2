import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packCommand = process.platform === 'win32'
    ? { executable: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd pack --dry-run --json --ignore-scripts'] }
    : { executable: 'npm', args: ['pack', '--dry-run', '--json', '--ignore-scripts'] };
const publicPackages = [
    {
        path: 'packages/core',
        required: [
            'lib/index.js',
            'lib/index.d.ts',
            'lib/core/transports/bluetooth-transport.js',
            'lib/core/transports/node-ble-transport.js',
            'README.md',
            'LICENSE'
        ]
    },
    {
        path: 'packages/renderer',
        required: [
            'lib/index.js',
            'lib/index.d.ts',
            'README.md',
            'LICENSE',
            'THIRD-PARTY-NOTICES.md'
        ]
    },
    {
        path: 'packages/ult',
        required: [
            'SPEC.md',
            'README.md',
            'LICENSE',
            'examples/asset-tag.ult.json'
        ]
    }
];

const readManifest = packagePath => JSON.parse(
    readFileSync(join(root, packagePath, 'package.json'), 'utf8')
);

const ui = readManifest('packages/ui-components');
if (ui.private !== true) fail('packages/ui-components must remain private');

const versions = new Set();
for (const entry of publicPackages) {
    const manifest = readManifest(entry.path);
    if (manifest.private === true) fail(`${entry.path} is still private`);
    if (manifest.publishConfig?.access !== 'public') fail(`${entry.path} is not configured for public access`);
    versions.add(manifest.version);

    for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const [name, range] of Object.entries(manifest[section] ?? {})) {
            if (String(range).startsWith('file:')) {
                fail(`${entry.path} has a local-only ${section} entry: ${name}`);
            }
        }
    }

    const packed = JSON.parse(execFileSync(packCommand.executable, packCommand.args, {
        cwd: join(root, entry.path),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit']
    }));
    const files = new Set(packed[0].files.map(file => file.path));

    for (const required of entry.required) {
        if (!files.has(required)) fail(`${entry.path} tarball is missing ${required}`);
    }
    for (const file of files) {
        if (file.startsWith('src/') || /(?:^|\/)\w+\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file)) {
            fail(`${entry.path} tarball leaks development source: ${file}`);
        }
    }

    console.log(`verified ${manifest.name}@${manifest.version} (${files.size} files)`);
}

if (versions.size !== 1) fail('public packages must use one release version');

const coreIndex = readFileSync(join(root, 'packages/core/src/index.ts'), 'utf8');
for (const driver of ['MarklifeDriver', 'NiimbotDriver', 'DummyDriver']) {
    if (!coreIndex.includes(driver)) fail(`${driver} is not exported by universal-label-core`);
}

console.log('verified: all first-party drivers share core and universal-label-ui remains private');

function fail(message) {
    console.error(`package verification failed: ${message}`);
    process.exit(1);
}
