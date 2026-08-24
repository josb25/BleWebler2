/**
 * Linear (1D) barcode encoders — pure, no DOM.
 *
 * Every symbology reduces to the same thing: a run of equal-width modules where
 * `true` is a bar. The rasterizer draws those with integer-pixel rectangles, so
 * bars stay crisp at 1-bit with no anti-aliasing, exactly as {@link encodeCode128}
 * already worked. Symbologies that compute a check digit return the corrected
 * human-readable text, and EAN/UPC additionally reports which module ranges are
 * guard bars, since those print taller than the data bars.
 */

import { encodeCode128, Code128Error } from './code128';
import type { LinearSymbology } from '../model/design';

export type { LinearSymbology };

export interface LinearSymbol {
    /** One entry per module; true = bar. */
    modules: boolean[];
    /** Quiet zone to leave each side, in modules. */
    quiet: number;
    /** Text to print under the bars — includes any computed check digit. */
    hri: string;
    /**
     * Half-open `[start, end)` module ranges that print full height while the
     * data bars are shortened. EAN/UPC guard patterns only; empty otherwise.
     */
    guards: Array<[number, number]>;
}

export class BarcodeError extends Error {}

/** Human-readable label for the UI. */
export const SYMBOLOGY_LABELS: Record<LinearSymbology, string> = {
    code128: 'Code 128',
    code39: 'Code 39',
    ean13: 'EAN-13',
    ean8: 'EAN-8',
    upca: 'UPC-A',
    itf: 'ITF (2 of 5)'
};

/** What each symbology will accept, for UI hints and error messages. */
export const SYMBOLOGY_HINTS: Record<LinearSymbology, string> = {
    code128: 'Any printable ASCII',
    code39: 'A–Z, 0–9, and - . space $ / + %',
    ean13: '12 or 13 digits',
    ean8: '7 or 8 digits',
    upca: '11 or 12 digits',
    itf: 'An even number of digits'
};

// ---- shared helpers --------------------------------------------------------

/** Expand an n/w width pattern into modules, starting with a bar. */
function widthsToModules(pattern: string, narrow: number, wide: number, out: boolean[]): void {
    for (let i = 0; i < pattern.length; i++) {
        const w = pattern[i] === 'w' ? wide : narrow;
        const isBar = i % 2 === 0;
        for (let k = 0; k < w; k++) out.push(isBar);
    }
}

/** Expand a binary '0'/'1' pattern, where 1 = bar. */
function bitsToModules(bits: string, out: boolean[]): void {
    for (const b of bits) out.push(b === '1');
}

function digitsOnly(data: string, symbology: LinearSymbology): string {
    if (!/^\d+$/.test(data)) {
        throw new BarcodeError(`${SYMBOLOGY_LABELS[symbology]} accepts digits only (${SYMBOLOGY_HINTS[symbology]}).`);
    }
    return data;
}

/** GS1 mod-10 check digit, weighting the rightmost digit by 3. */
function mod10(digits: string): number {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        const d = digits.charCodeAt(digits.length - 1 - i) - 48;
        sum += i % 2 === 0 ? d * 3 : d;
    }
    return (10 - (sum % 10)) % 10;
}

/**
 * Normalise to `length` digits: accept the payload with or without its check
 * digit, and verify it when supplied so a typo is reported rather than printed.
 */
function withCheckDigit(data: string, length: number, symbology: LinearSymbology): string {
    digitsOnly(data, symbology);
    if (data.length === length - 1) return data + mod10(data);
    if (data.length === length) {
        const expected = mod10(data.slice(0, -1));
        if (expected !== data.charCodeAt(length - 1) - 48) {
            throw new BarcodeError(`${SYMBOLOGY_LABELS[symbology]} check digit should be ${expected}.`);
        }
        return data;
    }
    throw new BarcodeError(`${SYMBOLOGY_LABELS[symbology]} needs ${length - 1} or ${length} digits, got ${data.length}.`);
}

// ---- EAN / UPC -------------------------------------------------------------

const EAN_L = [
    '0001101', '0011001', '0010011', '0111101', '0100011',
    '0110001', '0101111', '0111011', '0110111', '0001011'
];
const EAN_G = [
    '0100111', '0110011', '0011011', '0100001', '0011101',
    '0111001', '0000101', '0010001', '0001001', '0010111'
];
/** R is the bitwise complement of L. */
const EAN_R = EAN_L.map(p => [...p].map(b => (b === '0' ? '1' : '0')).join(''));

/** Which of the first six digits use G (even) parity, keyed by the lead digit. */
const EAN13_PARITY = [
    'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
    'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
];

const GUARD_SIDE = '101';
const GUARD_CENTRE = '01010';

function encodeEan13(data: string, symbology: LinearSymbology, hri: string): LinearSymbol {
    const d = withCheckDigit(data, 13, symbology);
    const parity = EAN13_PARITY[d.charCodeAt(0) - 48];
    const modules: boolean[] = [];
    const guards: Array<[number, number]> = [];

    guards.push([modules.length, modules.length + GUARD_SIDE.length]);
    bitsToModules(GUARD_SIDE, modules);
    for (let i = 0; i < 6; i++) {
        const v = d.charCodeAt(i + 1) - 48;
        bitsToModules(parity[i] === 'L' ? EAN_L[v] : EAN_G[v], modules);
    }
    guards.push([modules.length, modules.length + GUARD_CENTRE.length]);
    bitsToModules(GUARD_CENTRE, modules);
    for (let i = 7; i < 13; i++) {
        bitsToModules(EAN_R[d.charCodeAt(i) - 48], modules);
    }
    guards.push([modules.length, modules.length + GUARD_SIDE.length]);
    bitsToModules(GUARD_SIDE, modules);

    return { modules, quiet: 11, hri: hri || d, guards };
}

function encodeEan8(data: string): LinearSymbol {
    const d = withCheckDigit(data, 8, 'ean8');
    const modules: boolean[] = [];
    const guards: Array<[number, number]> = [];

    guards.push([modules.length, modules.length + GUARD_SIDE.length]);
    bitsToModules(GUARD_SIDE, modules);
    for (let i = 0; i < 4; i++) bitsToModules(EAN_L[d.charCodeAt(i) - 48], modules);
    guards.push([modules.length, modules.length + GUARD_CENTRE.length]);
    bitsToModules(GUARD_CENTRE, modules);
    for (let i = 4; i < 8; i++) bitsToModules(EAN_R[d.charCodeAt(i) - 48], modules);
    guards.push([modules.length, modules.length + GUARD_SIDE.length]);
    bitsToModules(GUARD_SIDE, modules);

    return { modules, quiet: 9, hri: d, guards };
}

/** UPC-A is EAN-13 with an implicit leading zero; the HRI keeps 12 digits. */
function encodeUpcA(data: string): LinearSymbol {
    const d = withCheckDigit(data, 12, 'upca');
    return encodeEan13('0' + d, 'upca', d);
}

// ---- Code 39 ---------------------------------------------------------------

/** 9 elements per character (5 bars, 4 spaces), exactly 3 of them wide. */
const CODE39: Record<string, string> = {
    '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
    '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
    '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw',
    'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn',
    'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
    'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww',
    'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn',
    'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn', 'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw',
    'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
    '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
    '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn'
};

/**
 * Wide:narrow ratio. The spec permits 2:1–3:1; 3:1 is the tolerant end, which
 * is what you want on a thermal head where a module is only a few dots wide.
 */
const CODE39_WIDE = 3;

function encodeCode39(data: string): LinearSymbol {
    const text = data.toUpperCase();
    if (text.length === 0) throw new BarcodeError('Barcode data is empty.');
    const modules: boolean[] = [];
    // '*' delimits the symbol and is not part of the data.
    for (const ch of `*${text}*`) {
        const pattern = CODE39[ch];
        if (!pattern) {
            throw new BarcodeError(`Code 39 cannot encode ${JSON.stringify(ch)} (${SYMBOLOGY_HINTS.code39}).`);
        }
        widthsToModules(pattern, 1, CODE39_WIDE, modules);
        modules.push(false); // narrow inter-character gap
    }
    modules.pop(); // no trailing gap after the stop character
    return { modules, quiet: 10, hri: text, guards: [] };
}

// ---- Interleaved 2 of 5 ----------------------------------------------------

/** 5 elements per digit, exactly 2 of them wide. */
const ITF_DIGITS = [
    'nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw',
    'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'
];
const ITF_WIDE = 3;

function encodeItf(data: string): LinearSymbol {
    digitsOnly(data, 'itf');
    // Digits are interleaved in pairs, so an odd count is padded — leading, so
    // the numeric value is unchanged.
    const d = data.length % 2 === 0 ? data : '0' + data;
    if (d.length === 0) throw new BarcodeError('Barcode data is empty.');

    const modules: boolean[] = [];
    widthsToModules('nnnn', 1, ITF_WIDE, modules); // start
    for (let i = 0; i < d.length; i += 2) {
        const bars = ITF_DIGITS[d.charCodeAt(i) - 48];
        const spaces = ITF_DIGITS[d.charCodeAt(i + 1) - 48];
        // Bars carry the first digit, spaces the second, one element each.
        for (let k = 0; k < 5; k++) {
            const bw = bars[k] === 'w' ? ITF_WIDE : 1;
            for (let n = 0; n < bw; n++) modules.push(true);
            const sw = spaces[k] === 'w' ? ITF_WIDE : 1;
            for (let n = 0; n < sw; n++) modules.push(false);
        }
    }
    widthsToModules('wnn', 1, ITF_WIDE, modules); // stop
    return { modules, quiet: 10, hri: d, guards: [] };
}

// ---- entry point -----------------------------------------------------------

/** Encode `data` in `symbology`, or throw {@link BarcodeError} explaining why not. */
export function encodeLinear(symbology: LinearSymbology, data: string): LinearSymbol {
    switch (symbology) {
        case 'code39': return encodeCode39(data);
        case 'ean13': return encodeEan13(data, 'ean13', '');
        case 'ean8': return encodeEan8(data);
        case 'upca': return encodeUpcA(data);
        case 'itf': return encodeItf(data);
        case 'code128':
        default:
            try {
                return { modules: encodeCode128(data), quiet: 10, hri: data, guards: [] };
            } catch (err) {
                throw new BarcodeError(err instanceof Code128Error ? err.message : String(err));
            }
    }
}
