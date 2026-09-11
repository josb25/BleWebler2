import { describe, expect, it } from 'vitest';
import { density, feed, heatSettings, initialise, rasterHeader } from './m-series-protocol';

describe('Phomemo general M-series protocol', () => {
    it('encodes the complete setup vocabulary', () => {
        expect([...initialise]).toEqual([0x1b, 0x40]);
        expect([...heatSettings(8)]).toEqual([0x1b, 0x37, 7, 200, 2]);
        expect([...density(6)]).toEqual([0x1d, 0x7c, 6]);
    });

    it('encodes 16-bit raster dimensions and bounded feed', () => {
        expect([...rasterHeader(76, 300)]).toEqual([0x1d, 0x76, 0x30, 0, 76, 0, 44, 1]);
        expect([...feed(999)]).toEqual([0x1b, 0x4a, 255]);
    });
});

