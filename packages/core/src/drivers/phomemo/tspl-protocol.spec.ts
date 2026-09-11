import { describe, expect, it } from 'vitest';
import { bitmapHeader, density, gap, invertRaster, print, size } from './tspl-protocol';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('TSPL protocol subset', () => {
    it('builds documented media and print directives with CRLF', () => {
        expect(text(size(102, 152.4))).toBe('SIZE 102 mm,152.4 mm\r\n');
        expect(text(gap(3))).toBe('GAP 3 mm,0 mm\r\n');
        expect(text(density(20))).toBe('DENSITY 15\r\n');
        expect(text(print())).toBe('PRINT 1,1\r\n');
    });

    it('places binary data directly after the BITMAP comma', () => {
        expect(text(bitmapHeader(102, 1216))).toBe('BITMAP 0,0,102,1216,0,');
        expect([...invertRaster(new Uint8Array([0x00, 0x55, 0xff]))]).toEqual([0xff, 0xaa, 0x00]);
    });
});

