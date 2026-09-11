import { describe, expect, it } from 'vitest';
import { density, feed, heat, initialiseContinuous, rasterHeader, rawCompression } from './m04-protocol';

describe('Phomemo M04 protocol', () => {
    it('builds the captured setup sequence', () => {
        expect([...density(1)]).toEqual([0x1f, 0x11, 0x02, 2]);
        expect([...density(8)]).toEqual([0x1f, 0x11, 0x02, 15]);
        expect([...heat(4)]).toEqual([0x1f, 0x11, 0x37, 150]);
        expect([...initialiseContinuous]).toEqual([0x1f, 0x11, 0x0b]);
        expect([...rawCompression]).toEqual([0x1f, 0x11, 0x35, 0]);
        expect([...feed]).toEqual([0x1b, 0x64, 2]);
    });

    it('encodes both raster dimensions as little-endian 16-bit values', () => {
        expect([...rasterHeader(154, 300)]).toEqual([
            0x1d, 0x76, 0x30, 0, 154, 0, 44, 1
        ]);
    });
});

