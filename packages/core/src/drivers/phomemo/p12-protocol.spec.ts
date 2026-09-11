import { describe, expect, it } from 'vitest';
import { feed, initialise, rasterHeader } from './p12-protocol';

describe('Phomemo P12 protocol', () => {
    it('keeps the six captured setup exchanges separate', () => {
        expect(initialise).toHaveLength(6);
        expect([...initialise[0]]).toEqual([0x1f, 0x11, 0x38]);
        expect([...initialise[5]]).toEqual([0x1f, 0x11, 0x07]);
    });

    it('encodes rotated raster dimensions and the fixed tape feed', () => {
        expect([...rasterHeader(12, 80)]).toEqual([0x1b, 0x40, 0x1d, 0x76, 0x30, 0, 12, 0, 80, 0]);
        expect([...feed]).toEqual([0x1b, 0x64, 13]);
    });
});

