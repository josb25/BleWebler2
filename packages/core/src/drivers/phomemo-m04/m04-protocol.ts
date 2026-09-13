/** Wire-level commands used by the Phomemo M04S/M04AS 300 dpi family. */

function byte(value: number): number {
    return Math.max(0, Math.min(0xff, Math.round(Number.isFinite(value) ? value : 0)));
}

/** Map BleWebler2's 1-8 density scale to the printer's documented 0-15 value. */
export function density(level: number): Uint8Array {
    const clamped = Math.max(1, Math.min(8, Math.round(Number.isFinite(level) ? level : 4)));
    return new Uint8Array([0x1f, 0x11, 0x02, Math.round((clamped / 8) * 15)]);
}

/** Heat/speed parameter captured from working M04S/M04AS print jobs. */
export function heat(level: number): Uint8Array {
    const clamped = Math.max(1, Math.min(8, Math.round(Number.isFinite(level) ? level : 4)));
    return new Uint8Array([0x1f, 0x11, 0x37, byte(100 + ((clamped - 1) * 50) / 3)]);
}

export const initialiseContinuous = new Uint8Array([0x1f, 0x11, 0x0b]);
export const rawCompression = new Uint8Array([0x1f, 0x11, 0x35, 0x00]);
export const feed = new Uint8Array([0x1b, 0x64, 0x02]);

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

