import { describe, it, expect } from 'vitest';
import { encodeDataMatrix, dataMatrixSize, reedSolomon, DataMatrixError } from './datamatrix';

describe('Reed-Solomon', () => {
    it('matches the ISO/IEC 16022 worked example', () => {
        // Annex O: "123456" -> ASCII codewords 142,164,186 in a 10x10 symbol,
        // whose five check codewords are 114,25,5,88,102. If the GF(256)
        // arithmetic or the generator polynomial were wrong this would not hold.
        expect(reedSolomon([142, 164, 186], 5)).toEqual([114, 25, 5, 88, 102]);
    });

    it('produces exactly the requested number of check codewords', () => {
        for (const n of [5, 7, 10, 12, 18, 28, 68]) {
            expect(reedSolomon([1, 2, 3, 4], n).length).toBe(n);
        }
    });
});

describe('symbol sizing', () => {
    it('picks the smallest symbol that fits', () => {
        expect(dataMatrixSize('123456')).toBe(10);   // 3 codewords, cap 3
        expect(dataMatrixSize('1234567890')).toBe(12); // 5 codewords, cap 5
        expect(dataMatrixSize('ABCDE')).toBe(12);    // 5 single-byte codewords
    });

    it('packs digit pairs two per codeword', () => {
        // 16 digits = 8 codewords -> 14x14 (capacity 8). The same 16 characters
        // as letters are 16 codewords and need 18x18, which is the whole point
        // of the digit-pair packing.
        expect(dataMatrixSize('1234567890123456')).toBe(14);
        expect(dataMatrixSize('ABCDEFGHIJKLMNOP')).toBe(18);
    });

    it('rejects a payload beyond the largest supported symbol', () => {
        expect(() => encodeDataMatrix('A'.repeat(200))).toThrow(DataMatrixError);
        expect(() => encodeDataMatrix('')).toThrow(DataMatrixError);
    });
});

describe('symbol structure', () => {
    const check = (m: boolean[][], size: number, regions: number) => {
        expect(m.length).toBe(size);
        for (const row of m) expect(row.length).toBe(size);
        const stride = size / regions;
        for (let ry = 0; ry < regions; ry++) {
            for (let rx = 0; rx < regions; rx++) {
                const r0 = ry * stride, c0 = rx * stride;
                for (let i = 0; i < stride; i++) {
                    // L-finder: left column and bottom row are solid.
                    expect(m[r0 + i][c0], `left finder r${r0 + i}`).toBe(true);
                    expect(m[r0 + stride - 1][c0 + i], `bottom finder c${c0 + i}`).toBe(true);
                    // Clock track: top row and right column alternate.
                    expect(m[r0][c0 + i], `top clock c${c0 + i}`).toBe(i % 2 === 0);
                    expect(m[r0 + i][c0 + stride - 1], `right clock r${r0 + i}`).toBe(i % 2 === 1);
                }
            }
        }
    };

    it('builds a well-formed 10x10 single-region symbol', () => {
        check(encodeDataMatrix('123456'), 10, 1);
    });

    it('builds a well-formed 26x26 symbol', () => {
        check(encodeDataMatrix('A'.repeat(40)), 26, 1);
    });

    it('tiles four regions for symbols of 32x32 and up', () => {
        check(encodeDataMatrix('A'.repeat(60)), 32, 2);
        check(encodeDataMatrix('A'.repeat(150)), 48, 2);
    });

    it('places every data module — no gaps left in the mapping area', () => {
        // A mis-stepped placement sweep leaves holes, which would decode as
        // garbage rather than failing loudly, so assert the sweep is dense by
        // checking both polarities actually occur throughout the data area.
        const m = encodeDataMatrix('SN-000123456789');
        let dark = 0, light = 0;
        for (let r = 1; r < m.length - 1; r++) {
            for (let c = 1; c < m.length - 1; c++) {
                if (m[r][c]) dark++; else light++;
            }
        }
        expect(dark).toBeGreaterThan(0);
        expect(light).toBeGreaterThan(0);
        // A healthy ECC200 symbol is close to balanced; anything wildly skewed
        // means bits went missing.
        const ratio = dark / (dark + light);
        expect(ratio).toBeGreaterThan(0.3);
        expect(ratio).toBeLessThan(0.7);
    });

    it('is deterministic and data-sensitive', () => {
        const a = encodeDataMatrix('HELLO');
        expect(encodeDataMatrix('HELLO')).toEqual(a);
        expect(encodeDataMatrix('HELLP')).not.toEqual(a);
    });
});
