import { describe, expect, it } from 'vitest';
import { finish, heatSettings, initialise, rasterHeader, wake } from './m02-protocol';

describe('Phomemo M02 protocol', () => {
    it('uses the model-family wake prefix and ESC/POS initialise', () => {
        expect([...wake]).toEqual([0x10, 0xff, 0xfe, 0x01]);
        expect([...initialise]).toEqual([0x1b, 0x40]);
    });

    it('builds heat, raster and minimal-feed commands', () => {
        expect([...heatSettings(6)]).toEqual([0x1b, 0x37, 0x07, 140, 0x02]);
        expect([...rasterHeader(48, 255)]).toEqual([0x1d, 0x76, 0x30, 0, 48, 0, 255, 0]);
        expect([...finish]).toEqual([0x1b, 0x4a, 0x08]);
    });
});

