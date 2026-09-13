/** Wire-level commands used by the Phomemo M02 family. */

export const wake = new Uint8Array([0x10, 0xff, 0xfe, 0x01]);
export const initialise = new Uint8Array([0x1b, 0x40]);

export function heatSettings(density: number): Uint8Array {
    const level = Math.max(1, Math.min(8, Math.round(Number.isFinite(density) ? density : 6)));
    const heatTimes = [40, 60, 80, 100, 120, 140, 160, 200];
    return new Uint8Array([0x1b, 0x37, 0x07, heatTimes[level - 1], 0x02]);
}

export function rasterHeader(widthBytes: number, rows: number): Uint8Array {
    if (!Number.isInteger(widthBytes) || widthBytes < 1 || widthBytes > 0xffff) {
        throw new RangeError('Raster width must be between 1 and 65535 bytes.');
    }
    if (!Number.isInteger(rows) || rows < 1 || rows > 0xffff) {
        throw new RangeError('Raster height must be between 1 and 65535 rows.');
    }
    return new Uint8Array([
        0x1d, 0x76, 0x30, 0x00,
        widthBytes & 0xff, (widthBytes >>> 8) & 0xff,
        rows & 0xff, (rows >>> 8) & 0xff
    ]);
}

export const finish = new Uint8Array([0x1b, 0x4a, 0x08]);
