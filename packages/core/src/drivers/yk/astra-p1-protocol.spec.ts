import { describe, expect, it } from 'vitest';
import { encodeRaster, frame, rasterSlices, specialFeedPayload } from './astra-p1-protocol';

describe('YK Astra P1 protocol', () => {
    it('frames commands with a modulo-64 sequence and zero integrity field', () => {
        expect([...frame(0x0a, Uint8Array.of(0x19), 64)]).toEqual([
            0x64, 0x0a, 0x00, 0x01, 0x00, 0x19, 0x00, 0x00, 0x00, 0x00, 0x9b
        ]);
        expect([...specialFeedPayload(2, 800)]).toEqual([0x02, 0x20, 0x03]);
    });

    it('packs four 96-dot rows into the captured 48-byte raster slice', () => {
        const rgba = new Uint8Array(4 * 90 * 4).fill(255);
        rgba[3] = 255;
        rgba[0] = rgba[1] = rgba[2] = 0;
        const slices = rasterSlices(encodeRaster({ width: 4, height: 90, data: rgba }));
        expect(slices).toHaveLength(1);
        expect(slices[0]).toHaveLength(48);
        expect(slices[0][0]).toBe(0x02);
        expect(slices[0].slice(1)).toEqual(new Uint8Array(47));
    });

    it('places a one-dot-high image at bit 6 of the first byte (0x02), never centering', () => {
        const rgba = new Uint8Array(1 * 1 * 4).fill(255);
        rgba[3] = 255;
        rgba[0] = rgba[1] = rgba[2] = 0;
        const raster = encodeRaster({ width: 1, height: 1, data: rgba });
        expect(raster).toHaveLength(12);
        expect(raster[0]).toBe(0x02);
        expect(raster.slice(1)).toEqual(new Uint8Array(11));
    });
});
