import { describe, expect, it } from 'vitest';
import { endJob, heatSettings, mediaType, rasterHeader } from './protocol';

describe('Phomemo D/Q protocol', () => {
    it('maps density to the documented heat-time table', () => {
        expect([...heatSettings(1)]).toEqual([0x1b, 0x37, 0x07, 40, 0x02]);
        expect([...heatSettings(8)]).toEqual([0x1b, 0x37, 0x07, 200, 0x02]);
    });

    it('selects gapped and continuous media explicitly', () => {
        expect([...mediaType(false)]).toEqual([0x1f, 0x11, 0x0a]);
        expect([...mediaType(true)]).toEqual([0x1f, 0x11, 0x0b]);
    });

    it('builds a little-endian GS v 0 raster header', () => {
        expect([...rasterHeader(12, 300)]).toEqual([
            0x1b, 0x40, 0x1d, 0x76, 0x30, 0x00, 12, 0, 44, 1
        ]);
        expect([...endJob]).toEqual([0x1b, 0x64, 0x00]);
    });
});

