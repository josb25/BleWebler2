import { describe, expect, it } from 'vitest';
import { density, endJob, mediaType, rasterHeader, speed } from './m110-protocol';

describe('Phomemo M110 protocol', () => {
    it('bounds speed and density to their captured ranges', () => {
        expect([...speed(99)]).toEqual([0x1b, 0x4e, 0x0d, 0x05]);
        expect([...density(0)]).toEqual([0x1b, 0x4e, 0x04, 0x01]);
        expect([...density(15)]).toEqual([0x1b, 0x4e, 0x04, 0x0f]);
    });

    it('encodes all three documented media modes', () => {
        expect([...mediaType('gap')]).toEqual([0x1f, 0x11, 0x0a]);
        expect([...mediaType('continuous')]).toEqual([0x1f, 0x11, 0x0b]);
        expect([...mediaType('mark')]).toEqual([0x1f, 0x11, 0x26]);
    });

    it('writes the raw raster header and footer', () => {
        expect([...rasterHeader(43, 240)]).toEqual([0x1d, 0x76, 0x30, 0, 43, 0, 240, 0]);
        expect([...endJob]).toEqual([0x1f, 0xf0, 0x05, 0, 0x1f, 0xf0, 0x03, 0]);
    });
});
