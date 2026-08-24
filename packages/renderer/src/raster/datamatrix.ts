/**
 * Data Matrix (ECC200) encoder — pure, no DOM.
 *
 * Why this and not just QR: below roughly 8mm a Data Matrix stays readable
 * where a QR does not, because it needs a two-sided finder rather than three
 * position squares and carries no quiet-zone-hungry format rings. On 9–12mm
 * tape that is the difference between a mark that scans and one that doesn't,
 * which is why it's the standard for small-part and electronics marking.
 *
 * Scope: ASCII encodation and the square symbols from 10x10 to 48x48. Those are
 * a single Reed–Solomon block (up to 174 data codewords), which covers any
 * payload a label realistically carries; larger symbols interleave several
 * blocks and are rejected with a clear error rather than mis-encoded.
 */

export class DataMatrixError extends Error {}

interface SymbolSpec {
    /** Full symbol edge, including the finder and clock tracks. */
    size: number;
    /** Edge of one data region (the symbol minus its tracks). */
    region: number;
    /** Regions per side (1 or 2). */
    regions: number;
    data: number;
    ecc: number;
}

/** Square ECC200 symbols, smallest first. All single-block. */
const SPECS: readonly SymbolSpec[] = [
    { size: 10, region: 8, regions: 1, data: 3, ecc: 5 },
    { size: 12, region: 10, regions: 1, data: 5, ecc: 7 },
    { size: 14, region: 12, regions: 1, data: 8, ecc: 10 },
    { size: 16, region: 14, regions: 1, data: 12, ecc: 12 },
    { size: 18, region: 16, regions: 1, data: 18, ecc: 14 },
    { size: 20, region: 18, regions: 1, data: 22, ecc: 18 },
    { size: 22, region: 20, regions: 1, data: 30, ecc: 20 },
    { size: 24, region: 22, regions: 1, data: 36, ecc: 24 },
    { size: 26, region: 24, regions: 1, data: 44, ecc: 28 },
    { size: 32, region: 14, regions: 2, data: 62, ecc: 36 },
    { size: 36, region: 16, regions: 2, data: 86, ecc: 42 },
    { size: 40, region: 18, regions: 2, data: 114, ecc: 48 },
    { size: 44, region: 20, regions: 2, data: 144, ecc: 56 },
    { size: 48, region: 22, regions: 2, data: 174, ecc: 68 }
];

// ---- GF(256) ---------------------------------------------------------------

/** Primitive polynomial x^8 + x^5 + x^3 + x^2 + 1, as ECC200 specifies. */
const GF_POLY = 0x12d;
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= GF_POLY;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Generator polynomial with roots a^1..a^n, highest power first. */
function rsGenerator(n: number): number[] {
    let g = [1];
    for (let i = 1; i <= n; i++) {
        const next = new Array<number>(g.length + 1).fill(0);
        for (let j = 0; j < g.length; j++) {
            next[j] ^= g[j];
            next[j + 1] ^= gfMul(g[j], GF_EXP[i]);
        }
        g = next;
    }
    return g;
}

/** The `n` Reed–Solomon check codewords for `data`. */
export function reedSolomon(data: readonly number[], n: number): number[] {
    const gen = rsGenerator(n);
    const res = new Array<number>(n).fill(0);
    for (const d of data) {
        const factor = d ^ res[0];
        res.shift();
        res.push(0);
        if (factor !== 0) {
            for (let i = 0; i < n; i++) res[i] ^= gfMul(gen[i + 1], factor);
        }
    }
    return res;
}

// ---- encodation ------------------------------------------------------------

/**
 * ASCII encodation: digit pairs pack two-for-one, everything else is one
 * codeword per character. That is optimal for the short alphanumeric payloads
 * labels carry, and avoids the latch bookkeeping the other modes need.
 */
function encodeAscii(data: string): number[] {
    const out: number[] = [];
    let i = 0;
    while (i < data.length) {
        const c = data.charCodeAt(i);
        const next = i + 1 < data.length ? data.charCodeAt(i + 1) : -1;
        const isDigit = c >= 48 && c <= 57;
        const nextIsDigit = next >= 48 && next <= 57;
        if (isDigit && nextIsDigit) {
            out.push((c - 48) * 10 + (next - 48) + 130);
            i += 2;
        } else if (c < 128) {
            out.push(c + 1);
            i += 1;
        } else if (c < 256) {
            out.push(235); // upper shift
            out.push(c - 128 + 1);
            i += 1;
        } else {
            throw new DataMatrixError(
                `Data Matrix cannot encode ${JSON.stringify(data[i])} — Latin-1 characters only.`
            );
        }
    }
    return out;
}

/**
 * Pad to the symbol's data capacity. The first pad is 129; the rest are
 * randomised by position so large blank areas don't form a misleading pattern.
 */
function pad(codewords: number[], capacity: number): number[] {
    const out = codewords.slice();
    if (out.length < capacity) out.push(129);
    while (out.length < capacity) {
        // 253-state algorithm; `position` is 1-based.
        const r = ((149 * (out.length + 1)) % 253) + 1;
        const v = 129 + r;
        out.push(v > 254 ? v - 254 : v);
    }
    return out;
}

function specFor(count: number): SymbolSpec {
    const spec = SPECS.find(s => s.data >= count);
    if (!spec) {
        throw new DataMatrixError(
            `Too much data for a square Data Matrix (${count} codewords; the largest supported symbol holds ${SPECS[SPECS.length - 1].data}).`
        );
    }
    return spec;
}

// ---- module placement (ISO/IEC 16022 Annex F) ------------------------------

/**
 * Build the codeword/bit map for a mapping matrix of `nr` x `nc`. Entry values
 * are `codewordIndex * 8 + bitIndex`, or -1 where nothing was placed. The
 * diagonal sweep and the four corner special cases are the standard algorithm.
 */
function placementMap(nr: number, nc: number): Int32Array {
    const map = new Int32Array(nr * nc).fill(-1);

    const setBit = (r: number, c: number, p: number, b: number): void => {
        let rr = r, cc = c;
        // Wrap around the symbol; the offsets are what make the corners line up.
        if (rr < 0) { rr += nr; cc += 4 - ((nr + 4) % 8); }
        if (cc < 0) { cc += nc; rr += 4 - ((nc + 4) % 8); }
        map[rr * nc + cc] = p * 8 + b;
    };

    /** The standard 8-module "utah" shape for one codeword. */
    const block = (r: number, c: number, p: number): void => {
        setBit(r - 2, c - 2, p, 7);
        setBit(r - 2, c - 1, p, 6);
        setBit(r - 1, c - 2, p, 5);
        setBit(r - 1, c - 1, p, 4);
        setBit(r - 1, c, p, 3);
        setBit(r, c - 2, p, 2);
        setBit(r, c - 1, p, 1);
        setBit(r, c, p, 0);
    };

    const corner1 = (p: number): void => {
        setBit(nr - 1, 0, p, 7); setBit(nr - 1, 1, p, 6); setBit(nr - 1, 2, p, 5);
        setBit(0, nc - 2, p, 4); setBit(0, nc - 1, p, 3); setBit(1, nc - 1, p, 2);
        setBit(2, nc - 1, p, 1); setBit(3, nc - 1, p, 0);
    };
    const corner2 = (p: number): void => {
        setBit(nr - 3, 0, p, 7); setBit(nr - 2, 0, p, 6); setBit(nr - 1, 0, p, 5);
        setBit(0, nc - 4, p, 4); setBit(0, nc - 3, p, 3); setBit(0, nc - 2, p, 2);
        setBit(0, nc - 1, p, 1); setBit(1, nc - 1, p, 0);
    };
    const corner3 = (p: number): void => {
        setBit(nr - 3, 0, p, 7); setBit(nr - 2, 0, p, 6); setBit(nr - 1, 0, p, 5);
        setBit(0, nc - 2, p, 4); setBit(0, nc - 1, p, 3); setBit(1, nc - 1, p, 2);
        setBit(2, nc - 1, p, 1); setBit(3, nc - 1, p, 0);
    };
    const corner4 = (p: number): void => {
        setBit(nr - 1, 0, p, 7); setBit(nr - 1, nc - 1, p, 6); setBit(0, nc - 3, p, 5);
        setBit(0, nc - 2, p, 4); setBit(0, nc - 1, p, 3); setBit(1, nc - 3, p, 2);
        setBit(1, nc - 2, p, 1); setBit(1, nc - 1, p, 0);
    };

    let p = 0;
    let r = 4;
    let c = 0;
    do {
        if (r === nr && c === 0) corner1(p++);
        if (r === nr - 2 && c === 0 && nc % 4 !== 0) corner2(p++);
        if (r === nr - 2 && c === 0 && nc % 8 === 4) corner3(p++);
        if (r === nr + 4 && c === 2 && nc % 8 === 0) corner4(p++);

        // Diagonal sweep up-right.
        do {
            if (r < nr && c >= 0 && map[r * nc + c] === -1) block(r, c, p++);
            r -= 2;
            c += 2;
        } while (r >= 0 && c < nc);
        r += 1;
        c += 3;

        // Diagonal sweep down-left.
        do {
            if (r >= 0 && c < nc && map[r * nc + c] === -1) block(r, c, p++);
            r += 2;
            c -= 2;
        } while (r < nr && c >= 0);
        r += 3;
        c += 1;
    } while (r < nr || c < nc);

    // Bottom-right corner is not reached by the sweep; the spec fixes it to a
    // small checkerboard.
    if (map[nr * nc - 1] === -1) {
        map[nr * nc - 1] = -2;
        map[nr * nc - nc - 2] = -2;
    }
    return map;
}

// ---- assembly --------------------------------------------------------------

/**
 * Encode `data` as a square Data Matrix, returning a row-major matrix where
 * true is a dark module. Includes the finder and clock tracks but no quiet zone
 * (the renderer adds that).
 */
export function encodeDataMatrix(data: string): boolean[][] {
    if (data.length === 0) throw new DataMatrixError('Barcode data is empty.');

    const encoded = encodeAscii(data);
    const spec = specFor(encoded.length);
    const codewords = pad(encoded, spec.data).concat(reedSolomon(pad(encoded, spec.data), spec.ecc));

    // Place bits into the mapping matrix (the symbol minus its tracks).
    const nr = spec.region * spec.regions;
    const nc = nr;
    const map = placementMap(nr, nc);
    const mapping: boolean[][] = Array.from({ length: nr }, () => new Array<boolean>(nc).fill(false));
    for (let i = 0; i < map.length; i++) {
        const v = map[i];
        if (v === -1) continue;
        if (v === -2) { mapping[Math.floor(i / nc)][i % nc] = true; continue; }
        const cw = codewords[Math.floor(v / 8)];
        const bit = v % 8;
        // Bit 7 is the most significant.
        mapping[Math.floor(i / nc)][i % nc] = ((cw >> bit) & 1) === 1;
    }

    // Wrap each region in its L-finder (left + bottom, solid) and clock track
    // (top + right, alternating), then tile the regions into the symbol.
    const out: boolean[][] = Array.from({ length: spec.size }, () => new Array<boolean>(spec.size).fill(false));
    const stride = spec.region + 2;
    for (let ry = 0; ry < spec.regions; ry++) {
        for (let rx = 0; rx < spec.regions; rx++) {
            const r0 = ry * stride;
            const c0 = rx * stride;
            for (let i = 0; i < stride; i++) {
                out[r0 + i][c0] = true;                              // left finder
                out[r0 + stride - 1][c0 + i] = true;                 // bottom finder
                out[r0][c0 + i] = i % 2 === 0;                       // top clock
                out[r0 + i][c0 + stride - 1] = i % 2 === 1;          // right clock
            }
            for (let r = 0; r < spec.region; r++) {
                for (let c = 0; c < spec.region; c++) {
                    out[r0 + 1 + r][c0 + 1 + c] = mapping[ry * spec.region + r][rx * spec.region + c];
                }
            }
        }
    }
    return out;
}

/** Symbol edge (in modules) `data` would need, for capacity checks in the UI. */
export function dataMatrixSize(data: string): number {
    return specFor(encodeAscii(data).length).size;
}
