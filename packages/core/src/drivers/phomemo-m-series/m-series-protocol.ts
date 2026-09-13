/** Wire-level commands used by the general Phomemo M-series BLE family. */

export const initialise = new Uint8Array([0x1b, 0x40]);

export function heatSettings(density: number): Uint8Array {
    const level = Math.max(1, Math.min(8, Math.round(Number.isFinite(density) ? density : 6)));
    const heatTimes = [40, 60, 80, 100, 120, 140, 160, 200];
    return new Uint8Array([0x1b, 0x37, 0x07, heatTimes[level - 1], 0x02]);
}

export function density(level: number): Uint8Array {
    const clamped = Math.max(1, Math.min(8, Math.round(Number.isFinite(level) ? level : 6)));
    return new Uint8Array([0x1d, 0x7c, clamped]);
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

export function feed(dots: number): Uint8Array {
    return new Uint8Array([0x1b, 0x4a, Math.max(0, Math.min(255, Math.round(dots))) ]);
}

