/**
 * Code 128 encoder — pure, no DOM. Emits a module bitmap (true = bar) that the
 * rasterizer draws with integer-pixel rectangles, so bars are always crisp at
 * 1-bit with zero anti-aliasing.
 *
 * Code set support: B (ASCII 32..126) and C (digit pairs). All-numeric data of
 * even length >= 4 is encoded in set C for density; everything else uses set B.
 */

/**
 * Standard Code 128 element-width table, values 0..106.
 * Each entry is six digits: alternating bar/space widths summing to 11 modules.
 * Index 103/104/105 are Start A/B/C.
 */
const WIDTHS: readonly string[] = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
    '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
    '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
    '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
    '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
    '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
    '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
    '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
    '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
    '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
    '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
    '211214', '211232'
];
const STOP_WIDTHS = '2331112'; // 13 modules, four bars

const START_B = 104;
const START_C = 105;

export class Code128Error extends Error {}

function symbolToModules(widths: string, modules: boolean[]): void {
    for (let i = 0; i < widths.length; i++) {
        const w = widths.charCodeAt(i) - 48;
        const isBar = i % 2 === 0;
        for (let k = 0; k < w; k++) modules.push(isBar);
    }
}

/**
 * Encode to a module bitmap (no quiet zones — the renderer adds those).
 * Throws Code128Error for empty input or characters outside ASCII 32..126.
 */
export function encodeCode128(data: string): boolean[] {
    if (data.length === 0) throw new Code128Error('Barcode data is empty.');

    const values: number[] = [];
    if (/^\d+$/.test(data) && data.length >= 4 && data.length % 2 === 0) {
        values.push(START_C);
        for (let i = 0; i < data.length; i += 2) {
            values.push(parseInt(data.slice(i, i + 2), 10));
        }
    } else {
        values.push(START_B);
        for (const ch of data) {
            const code = ch.charCodeAt(0);
            if (code < 32 || code > 126) {
                throw new Code128Error(`Character ${JSON.stringify(ch)} cannot be encoded (printable ASCII only).`);
            }
            values.push(code - 32);
        }
    }

    let checksum = values[0];
    for (let i = 1; i < values.length; i++) {
        checksum += values[i] * i;
    }
    values.push(checksum % 103);

    const modules: boolean[] = [];
    for (const v of values) symbolToModules(WIDTHS[v], modules);
    symbolToModules(STOP_WIDTHS, modules);
    return modules;
}

/** Internal table sanity check, exercised by unit tests. */
export function _validateWidthsTable(): void {
    if (WIDTHS.length !== 106) throw new Error(`Expected 106 entries, got ${WIDTHS.length}`);
    WIDTHS.forEach((w, i) => {
        const sum = [...w].reduce((acc, c) => acc + (c.charCodeAt(0) - 48), 0);
        if (sum !== 11) throw new Error(`Entry ${i} (${w}) sums to ${sum}, expected 11`);
    });
    const stopSum = [...STOP_WIDTHS].reduce((acc, c) => acc + (c.charCodeAt(0) - 48), 0);
    if (stopSum !== 13) throw new Error(`Stop pattern sums to ${stopSum}, expected 13`);
}
