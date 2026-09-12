#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// Parse --from argument (defaults to sibling ../opentlp/site/devices.json)
let fromArg = null;
for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--from' && i + 1 < process.argv.length) {
        fromArg = process.argv[i + 1];
        i++;
    } else if (arg.startsWith('--from=')) {
        fromArg = arg.slice('--from='.length);
    }
}

const inputPath = fromArg
    ? path.resolve(process.cwd(), fromArg)
    : path.resolve(repoRoot, '../opentlp/site/devices.json');

const outputPath = path.resolve(repoRoot, 'packages/ui-components/src/data/opentlp-snapshot.json');

if (!fs.existsSync(inputPath)) {
    console.error(`Error: Source devices file does not exist: ${inputPath}`);
    process.exit(1);
}

let data;
try {
    const raw = fs.readFileSync(inputPath, 'utf8');
    data = JSON.parse(raw);
} catch (err) {
    console.error(`Error: Failed to read or parse ${inputPath}:`, err);
    process.exit(1);
}

// Validate top-level version, generated, licence CC0-1.0 and devices array
if (!data || typeof data !== 'object') {
    console.error('Error: Root of input JSON must be an object');
    process.exit(1);
}

if (!Number.isInteger(data.version) || data.version < 1) {
    console.error('Error: Top-level "version" must be a positive integer');
    process.exit(1);
}

if (typeof data.generated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.generated)) {
    console.error('Error: Top-level "generated" must be a YYYY-MM-DD date');
    process.exit(1);
}

const licence = data.licence ?? data.license;
if (licence !== 'CC0-1.0') {
    console.error(`Error: Expected licence "CC0-1.0", received: "${licence}"`);
    process.exit(1);
}

if (!Array.isArray(data.devices)) {
    console.error('Error: Top-level "devices" must be an array');
    process.exit(1);
}

// Clean and map device fields: id, brand, model, aliases, rebadgeOf, family, status
// Hardware capabilities, GATT, sources, prose, and artwork are excluded.
const cleanedDevices = data.devices.map((d) => {
    if (
        !d ||
        typeof d !== 'object' ||
        typeof d.id !== 'string' ||
        typeof d.brand !== 'string' ||
        typeof d.model !== 'string'
    ) {
        console.error('Error: Device entry is missing a string id, brand, or model:', d);
        process.exit(1);
    }

    const aliases = Array.isArray(d.aliases)
        ? [...d.aliases]
            .filter(alias => typeof alias === 'string')
            .sort((a, b) => a.localeCompare(b))
        : [];

    const status = d.status ?? null;
    if (status !== null && !['verified', 'reported', 'unverified'].includes(status)) {
        console.error(`Error: Device "${d.id}" has an unsupported status: "${status}"`);
        process.exit(1);
    }

    return {
        id: d.id,
        brand: d.brand,
        model: d.model,
        aliases,
        rebadgeOf: typeof d.rebadge_of === 'string' ? d.rebadge_of : null,
        family: typeof d.protocol?.family === 'string' ? d.protocol.family : null,
        status,
    };
});

// Deterministic sort by id
cleanedDevices.sort((a, b) => a.id.localeCompare(b.id));

const snapshot = {
    source: 'https://josb25.github.io/opentlp/devices.json',
    schemaVersion: data.version,
    generated: data.generated,
    licence: 'CC0-1.0',
    count: cleanedDevices.length,
    devices: cleanedDevices,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

console.log(`OpenTLP snapshot written to ${outputPath} (${cleanedDevices.length} devices)`);
