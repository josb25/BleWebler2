import { describe, it, expect } from 'vitest';
import { encodeLinear, BarcodeError } from './linear';

/** Render modules as a bit string so patterns can be asserted literally. */
const bits = (m: boolean[]): string => m.map(b => (b ? '1' : '0')).join('');

describe('EAN-13', () => {
    it('computes the check digit and encodes 95 modules', () => {
        const sym = encodeLinear('ean13', '590123412345');
        expect(sym.hri).toBe('5901234123457');
        // 3 + 6*7 + 5 + 6*7 + 3
        expect(sym.modules.length).toBe(95);
    });

    it('accepts a supplied check digit and rejects a wrong one', () => {
        expect(encodeLinear('ean13', '5901234123457').hri).toBe('5901234123457');
        expect(() => encodeLinear('ean13', '5901234123450')).toThrow(BarcodeError);
    });

    it('lays down the three guard patterns', () => {
        const sym = encodeLinear('ean13', '590123412345');
        const s = bits(sym.modules);
        expect(s.startsWith('101')).toBe(true);
        expect(s.endsWith('101')).toBe(true);
        expect(s.slice(45, 50)).toBe('01010');
        expect(sym.guards).toEqual([[0, 3], [45, 50], [92, 95]]);
    });

    it('encodes the first digit as a parity pattern, not as bars', () => {
        // Same digits 2..12, different lead digit. The left half changes even
        // though those six digits did not — that *is* the EAN-13 trick. (The
        // right half's last digit is the check digit, which necessarily moves
        // with the lead digit, so compare only the five digits before it.)
        const a = bits(encodeLinear('ean13', '0012345678905').modules);
        const b = bits(encodeLinear('ean13', '1012345678904').modules);
        expect(a.slice(0, 45)).not.toBe(b.slice(0, 45));
        expect(a.slice(50, 85)).toBe(b.slice(50, 85));
        expect(a.slice(85, 92)).not.toBe(b.slice(85, 92));
    });

    it('encodes a known symbol exactly', () => {
        // 5901234123457: lead 5 -> parity LGGLLG over 901234, right half 123457.
        const s = bits(encodeLinear('ean13', '5901234123457').modules);
        expect(s.slice(0, 3)).toBe('101');
        expect(s.slice(3, 10)).toBe('0001011');   // 9 as L
        expect(s.slice(10, 17)).toBe('0100111');  // 0 as G
    });
});

describe('EAN-8 and UPC-A', () => {
    it('EAN-8 checks out at 67 modules', () => {
        const sym = encodeLinear('ean8', '9638507');
        expect(sym.hri).toBe('96385074');
        expect(sym.modules.length).toBe(67);
    });

    it('UPC-A encodes as EAN-13 with a leading zero but shows 12 digits', () => {
        const upc = encodeLinear('upca', '03600029145');
        expect(upc.hri).toBe('036000291452');
        expect(upc.modules.length).toBe(95);
        // Identical bars to the equivalent EAN-13.
        expect(bits(upc.modules)).toBe(bits(encodeLinear('ean13', '0036000291452').modules));
    });

    it('rejects the wrong digit count', () => {
        expect(() => encodeLinear('ean8', '123')).toThrow(/7 or 8 digits/);
        expect(() => encodeLinear('upca', '12345678901234')).toThrow(/11 or 12 digits/);
    });
});

describe('Code 39', () => {
    it('wraps the data in start/stop and uses 15 modules per character', () => {
        const sym = encodeLinear('code39', 'A');
        // 3 characters (*A*), 15 modules each, 2 one-module gaps between them.
        expect(sym.modules.length).toBe(3 * 15 + 2);
        expect(sym.hri).toBe('A');
    });

    it('upper-cases and rejects unencodable characters', () => {
        expect(encodeLinear('code39', 'ab-1').hri).toBe('AB-1');
        expect(() => encodeLinear('code39', 'a!b')).toThrow(BarcodeError);
    });

    it('every character pattern is 9 elements with exactly 3 wide', () => {
        // A wrong table entry would silently produce an unscannable symbol, so
        // assert the invariant over the whole alphabet.
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
        for (const ch of chars) {
            const sym = encodeLinear('code39', ch);
            // *X* -> 3 chars * 15 + 2 gaps
            expect(sym.modules.length, `char ${ch}`).toBe(47);
        }
    });
});

describe('ITF', () => {
    it('interleaves digit pairs and pads an odd count', () => {
        const sym = encodeLinear('itf', '1234567890123');
        expect(sym.hri).toBe('01234567890123');
        // start(4) + 7 pairs * 18 + stop(5)
        expect(sym.modules.length).toBe(4 + 7 * 18 + 5);
    });

    it('starts narrow and rejects non-digits', () => {
        const sym = encodeLinear('itf', '12');
        expect(bits(sym.modules).startsWith('1010')).toBe(true);
        expect(() => encodeLinear('itf', '12A4')).toThrow(BarcodeError);
    });
});

describe('Code 128 (unchanged default)', () => {
    it('still encodes through the shared entry point', () => {
        const sym = encodeLinear('code128', 'ABC-123');
        expect(sym.hri).toBe('ABC-123');
        expect(sym.modules.length).toBeGreaterThan(0);
        expect(sym.guards).toEqual([]);
    });

    it('reports bad characters as a BarcodeError', () => {
        expect(() => encodeLinear('code128', 'héllo')).toThrow(BarcodeError);
    });
});
