/**
 * BDF -> JSON glyph bundler.
 *
 * Reads the BDF sources in fonts/bdf/ and emits, per font, a compact JSON
 * module under src/raster/fonts/data/ plus a manifest.json with metadata.
 * The app lazy-loads each font as its own chunk, so adding fonts here never
 * grows the main bundle.
 *
 * Coverage is ASCII 32..126 + Latin-1 160..255, plus a handful of common
 * label/punctuation symbols outside Latin-1 (see EXTRA) — most importantly the
 * Euro sign, which labels need constantly. Not a Unicode terminal. Run via
 * `npm run fonts`.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'fonts', 'bdf');
const outDir = join(root, 'src', 'raster', 'fonts', 'data');
mkdirSync(outDir, { recursive: true });

// Common symbols beyond Latin-1 that turn up on labels (fonts that lack any of
// these simply won't include it — the renderer shows a fallback box then).
const EXTRA = new Set([
    0x20ac, // € euro
    0x2013, 0x2014, // – — en/em dash
    0x2018, 0x2019, 0x201c, 0x201d, // ' ' " " curly quotes
    0x2022, // • bullet
    0x2026, // … ellipsis
    0x2122, // ™ trademark
    0x2190, 0x2191, 0x2192, 0x2193 // ← ↑ → ↓ arrows
]);
const KEEP = code => (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || EXTRA.has(code);

/** Parse one BDF file into { w, h, glyphs: Map<code, Uint8Array rows> }. */
function parseBdf(text, name) {
    const lines = text.split(/\r?\n/);
    let fbb = null; // [w, h, xoff, yoff]
    const glyphs = new Map();
    let i = 0;

    const next = () => lines[i++];
    while (i < lines.length) {
        const line = next();
        if (line.startsWith('FONTBOUNDINGBOX')) {
            fbb = line.split(/\s+/).slice(1, 5).map(Number);
        } else if (line.startsWith('STARTCHAR')) {
            let code = -1;
            let bbx = null;
            while (i < lines.length) {
                const l = next();
                if (l.startsWith('ENCODING')) code = Number(l.split(/\s+/)[1]);
                else if (l.startsWith('BBX')) bbx = l.split(/\s+/).slice(1, 5).map(Number);
                else if (l === 'BITMAP') break;
                else if (l === 'ENDCHAR') break;
            }
            if (!fbb) throw new Error(`${name}: BITMAP before FONTBOUNDINGBOX`);
            if (!bbx) continue;
            const [gw, gh, gxoff, gyoff] = bbx;
            const rows = [];
            while (i < lines.length) {
                const l = next();
                if (l === 'ENDCHAR') break;
                rows.push(l.trim());
            }
            if (!KEEP(code)) continue;

            // Re-plot the glyph into the font cell (FONTBOUNDINGBOX).
            const [cw, ch, cxoff, cyoff] = fbb;
            const bpr = Math.ceil(cw / 8);
            const cell = new Uint8Array(bpr * ch);
            const glyphBpr = Math.ceil(gw / 8);
            for (let r = 0; r < gh && r < rows.length; r++) {
                const rowBits = parseInt(rows[r].padEnd(glyphBpr * 2, '0'), 16);
                const cellRow = (cyoff + ch) - (gyoff + gh) + r;
                if (cellRow < 0 || cellRow >= ch) continue;
                for (let c = 0; c < gw; c++) {
                    const bit = (rowBits >> (glyphBpr * 8 - 1 - c)) & 1;
                    if (!bit) continue;
                    const cellCol = c + gxoff - cxoff;
                    if (cellCol < 0 || cellCol >= cw) continue;
                    cell[cellRow * bpr + (cellCol >> 3)] |= 0x80 >> (cellCol & 7);
                }
            }
            glyphs.set(code, cell);
        }
    }
    if (!fbb) throw new Error(`${name}: no FONTBOUNDINGBOX`);
    return { w: fbb[0], h: fbb[1], glyphs };
}

function toHex(bytes) {
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** filename -> { id, label, family, sortKey } */
function describe(file) {
    const base = basename(file, '.bdf');
    let m;
    if ((m = /^ter-u(\d+)([nb])$/.exec(base))) {
        const bold = m[2] === 'b';
        return {
            id: `ter-u${m[1]}${m[2]}`,
            label: `Terminus ${m[1]}${bold ? ' Bold' : ''}`,
            sortKey: `2-terminus-${m[1].padStart(2, '0')}-${bold ? 1 : 0}`
        };
    }
    if ((m = /^spleen-(\d+)x(\d+)$/.exec(base))) {
        return {
            id: base,
            label: `Spleen ${m[1]}×${m[2]}`,
            sortKey: `3-spleen-${m[2].padStart(2, '0')}`
        };
    }
    if ((m = /^(\d+)x(\d+)(B?)$/.exec(base))) {
        const bold = m[3] === 'B';
        return {
            id: `fixed-${m[1]}x${m[2]}${bold ? 'b' : ''}`,
            label: `Fixed ${m[1]}×${m[2]}${bold ? ' Bold' : ''}`,
            sortKey: `1-fixed-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}-${bold ? 1 : 0}`
        };
    }
    throw new Error(`Unrecognized BDF filename: ${file}`);
}

const manifest = [];
for (const dir of readdirSync(srcDir)) {
    const dirPath = join(srcDir, dir);
    for (const file of readdirSync(dirPath)) {
        if (!file.endsWith('.bdf')) continue;
        const { id, label, sortKey } = describe(file);
        const { w, h, glyphs } = parseBdf(readFileSync(join(dirPath, file), 'utf-8'), file);
        const out = { w, h, glyphs: {} };
        for (const [code, cell] of glyphs) out.glyphs[code] = toHex(cell);
        writeFileSync(join(outDir, `${id}.json`), JSON.stringify(out));
        manifest.push({ id, label, w, h, sortKey, glyphCount: glyphs.size });
    }
}

manifest.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
writeFileSync(
    join(root, 'src', 'raster', 'fonts', 'manifest.json'),
    JSON.stringify(manifest.map(({ sortKey, ...rest }) => rest), null, 1) + '\n'
);
console.log(`Bundled ${manifest.length} fonts -> src/raster/fonts/data/`);
for (const f of manifest) console.log(`  ${f.id.padEnd(16)} ${String(f.w).padStart(2)}x${f.h}  ${f.glyphCount} glyphs  (${f.label})`);
