/**
 * The bundled symbol set — a convenience shelf, not a ceiling.
 *
 * These are ordinary path data in a 100x100 box, i.e. exactly what
 * {@link svgToPath} produces from an imported SVG. There is one representation
 * and one renderer; a built-in and a user's own icon are the same thing, and a
 * template can reference a stable name (`warning`) or carry its own path.
 *
 * Holes are cut with the even-odd rule rather than a second colour, so a symbol
 * composes correctly over anything beneath it.
 */

export interface SymbolDef {
    label: string;
    d: string;
    viewBox: [number, number, number, number];
    fillRule?: 'nonzero' | 'evenodd';
}

const BOX: [number, number, number, number] = [0, 0, 100, 100];

export const SYMBOLS: Record<string, SymbolDef> = {
    warning: {
        label: 'Warning',
        viewBox: BOX,
        fillRule: 'evenodd',
        // Outer triangle, inner triangle (hole), then the mark — which sits
        // inside two subpaths, so even-odd fills it again.
        d: 'M50 5L98 90H2ZM50 23L83 81H17ZM46 38h8v26h-8ZM50 68a5 5 0 1 1 0 10a5 5 0 1 1 0-10Z'
    },
    prohibited: {
        label: 'Prohibited',
        viewBox: BOX,
        fillRule: 'evenodd',
        d: 'M50 4a46 46 0 1 1 0 92a46 46 0 1 1 0-92ZM50 14a36 36 0 1 0 0 72a36 36 0 1 0 0-72ZM22 44h56v12H22Z'
    },
    info: {
        label: 'Information',
        viewBox: BOX,
        fillRule: 'evenodd',
        d: 'M50 4a46 46 0 1 1 0 92a46 46 0 1 1 0-92ZM50 12a38 38 0 1 0 0 76a38 38 0 1 0 0-76ZM50 22a6 6 0 1 1 0 12a6 6 0 1 1 0-12ZM45 42h10v34H45Z'
    },
    fragile: {
        label: 'Fragile',
        viewBox: BOX,
        d: 'M32 8h36l-6 34a14 14 0 0 1-8 10v28h16v8H30v-8h16V52a14 14 0 0 1-8-10Z'
    },
    bolt: {
        label: 'Electrical',
        viewBox: BOX,
        d: 'M58 4L22 54h22l-6 42l40-54H54Z'
    },
    'high-voltage': {
        label: 'High voltage',
        viewBox: BOX,
        fillRule: 'evenodd',
        d: 'M50 5L98 90H2ZM50 23L83 81H17ZM57 30L35 58h13l-4 22l22-30H52Z'
    },
    biohazard: {
        label: 'Biohazard',
        viewBox: BOX,
        fillRule: 'evenodd',
        d: 'M50 17a17 17 0 1 1 0 34a17 17 0 1 1 0-34ZM50 25a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z'
            + 'M28 51a17 17 0 1 1 0 34a17 17 0 1 1 0-34ZM28 59a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z'
            + 'M72 51a17 17 0 1 1 0 34a17 17 0 1 1 0-34ZM72 59a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z'
            + 'M50 48a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z'
    },
    flammable: {
        label: 'Flammable',
        viewBox: BOX,
        fillRule: 'evenodd',
        // Outer flame, then an inner flame as a hole — the classic two-tone
        // look, which at 1-bit is what keeps it from printing as a blob.
        d: 'M52 6C40 26 46 34 40 42C34 36 32 30 30 24C20 38 18 50 18 58'
            + 'C18 78 32 94 50 94C68 94 82 78 82 58C82 40 68 22 52 6Z'
            + 'M50 50C42 60 38 68 38 74C38 84 44 90 50 90C56 90 62 84 62 74C62 68 58 60 50 50Z'
    },
    'this-way-up': {
        label: 'This way up',
        viewBox: BOX,
        d: 'M50 6L78 40H60v54H40V40H22Z'
    },
    arrow: {
        label: 'Arrow',
        viewBox: BOX,
        d: 'M6 40h52V16l36 34l-36 34V60H6Z'
    },
    wifi: {
        label: 'Wi-Fi',
        viewBox: BOX,
        fillRule: 'evenodd',
        d: 'M50 22a58 58 0 0 1 42 18l-9 9a45 45 0 0 0-66 0l-9-9a58 58 0 0 1 42-18Z'
            + 'M50 48a32 32 0 0 1 23 10l-9 9a20 20 0 0 0-28 0l-9-9a32 32 0 0 1 23-10Z'
            + 'M50 74a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z'
    },
    battery: {
        label: 'Battery',
        viewBox: BOX,
        fillRule: 'evenodd',
        d: 'M8 28h74a6 6 0 0 1 6 6v32a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V34a6 6 0 0 1 6-6Z'
            + 'M10 36h70v28H10ZM90 40h8v20h-8ZM16 40h30v20H16Z'
    },
    thermometer: {
        label: 'Temperature',
        viewBox: BOX,
        fillRule: 'evenodd',
        d: 'M50 4a10 10 0 0 1 10 10v46a20 20 0 1 1-20 0V14a10 10 0 0 1 10-10Z'
            + 'M50 12a2 2 0 0 0-2 2v50a12 12 0 1 0 4 0V14a2 2 0 0 0-2-2Z'
    },
    'keep-dry': {
        label: 'Keep dry',
        viewBox: BOX,
        // Non-zero, not even-odd: the slash has to draw *over* the droplet's
        // hole, and only opposite winding (not parity) gets that right.
        d: 'M50 8C66 28 76 42 76 56C76 70 64 82 50 82C36 82 24 70 24 56C24 42 34 28 50 8Z'
            + 'M50 26C36 42 32 50 32 56C32 66 40 74 50 74C60 74 68 66 68 56C68 50 64 42 50 26Z'
            + 'M14 76L80 8L90 18L24 86Z'
    },
    scissors: {
        label: 'Cut here',
        viewBox: BOX,
        fillRule: 'evenodd',
        d: 'M26 6l8-4l30 66l-8 4ZM62 6l-8-4l-30 66l8 4Z'
            + 'M24 64a14 14 0 1 1 0 28a14 14 0 1 1 0-28ZM24 72a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z'
            + 'M64 64a14 14 0 1 1 0 28a14 14 0 1 1 0-28ZM64 72a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z'
    },
    star: {
        label: 'Star',
        viewBox: BOX,
        d: 'M50 4l12 32l34 2l-27 21l10 33l-29-20l-29 20l10-33L4 38l34-2Z'
    },
    tick: {
        label: 'Tick',
        viewBox: BOX,
        d: 'M90 16l9 12l-61 60L2 56l10-12l26 24Z'
    },
    lock: {
        label: 'Lock',
        viewBox: BOX,
        fillRule: 'evenodd',
        d: 'M32 44V32a18 18 0 0 1 36 0v12h-10V32a8 8 0 0 0-16 0v12Z'
            + 'M18 44h64v48H18ZM46 60h8v18h-8Z'
    },
    // Deliberately no recycling mark: the chasing-arrows glyph needs curve
    // detail that does not survive a few millimetres of thermal dots, and every
    // straight-arrow approximation read as a blob. Import the real one as an
    // SVG instead — that path exists precisely so the bundled shelf doesn't
    // have to be exhaustive.
    'no-entry': {
        label: 'No entry',
        viewBox: BOX,
        fillRule: 'evenodd',
        d: 'M50 4a46 46 0 1 1 0 92a46 46 0 1 1 0-92ZM50 14a36 36 0 1 0 0 72a36 36 0 1 0 0-72Z'
            + 'M20 42h60v16H20Z'
    }
};

export const SYMBOL_NAMES: readonly string[] = Object.keys(SYMBOLS);
export const DEFAULT_SYMBOL = 'warning';

/** Look up a bundled icon, falling back so an unknown name still prints. */
export function symbolDef(name: string): SymbolDef {
    return SYMBOLS[name] ?? SYMBOLS[DEFAULT_SYMBOL];
}
