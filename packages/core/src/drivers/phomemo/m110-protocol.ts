/** Wire-level commands used by the Phomemo M110/M120/M220 family. */

export function speed(value: number): Uint8Array {
    const clamped = Math.max(1, Math.min(5, Math.round(Number.isFinite(value) ? value : 5)));
    return new Uint8Array([0x1b, 0x4e, 0x0d, clamped]);
}

export function density(value: number): Uint8Array {
    const clamped = Math.max(1, Math.min(15, Math.round(Number.isFinite(value) ? value : 10)));
    return new Uint8Array([0x1b, 0x4e, 0x04, clamped]);
}

export function mediaType(type: 'gap' | 'continuous' | 'mark'): Uint8Array {
    const value = type === 'continuous' ? 0x0b : type === 'mark' ? 0x26 : 0x0a;
    return new Uint8Array([0x1f, 0x11, value]);
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

export const endJob = new Uint8Array([
    0x1f, 0xf0, 0x05, 0x00,
    0x1f, 0xf0, 0x03, 0x00
]);
