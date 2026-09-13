import { describe, expect, it } from 'vitest';
import { encodePeriPageRaster, peripageRasterHeader } from './peripage-raster';

describe('PeriPage raster encoding', () => {
    it('packs the top canvas pixel at the far end of the MSB-first printhead row', () => {
        const data = new Uint8Array(8 * 4).fill(255);
        data[0] = 0; data[1] = 0; data[2] = 0;
        const raster = encodePeriPageRaster({ data, width: 1, height: 8 }, 8);
        expect(raster).toEqual({ data: new Uint8Array([0x01]), widthBytes: 1, rows: 1 });
    });

    it('centres a narrower design and treats transparent black as blank', () => {
        const data = new Uint8Array([
            0, 0, 0, 0,
            0, 0, 0, 255
        ]);
        const raster = encodePeriPageRaster({ data, width: 1, height: 2 }, 8);
        expect([...raster.data]).toEqual([0x10]);
    });

    it('builds this family\'s GS v 0 header independently', () => {
        expect([...peripageRasterHeader(48, 255)])
            .toEqual([0x1d, 0x76, 0x30, 0, 48, 0, 255, 0]);
    });
});
