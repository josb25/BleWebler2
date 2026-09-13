/** Wire-level commands used by the Phomemo P12/P12 Pro/A30 tape family. */

export const initialise: readonly Uint8Array[] = [
    new Uint8Array([0x1f, 0x11, 0x38]),
    new Uint8Array([0x1f, 0x11, 0x11, 0x1f, 0x11, 0x12, 0x1f, 0x11, 0x09, 0x1f, 0x11, 0x13]),
    new Uint8Array([0x1f, 0x11, 0x09]),
    new Uint8Array([0x1f, 0x11, 0x19, 0x1f, 0x11, 0x11]),
    new Uint8Array([0x1f, 0x11, 0x19]),
    new Uint8Array([0x1f, 0x11, 0x07])
];

export function rasterHeader(widthBytes: number, rows: number): Uint8Array {
    if (!Number.isInteger(widthBytes) || widthBytes < 1 || widthBytes > 0xffff) {
        throw new RangeError('Raster width must be between 1 and 65535 bytes.');
    }
    if (!Number.isInteger(rows) || rows < 1 || rows > 0xffff) {
        throw new RangeError('Raster height must be between 1 and 65535 rows.');
    }
    return new Uint8Array([
        0x1b, 0x40,
        0x1d, 0x76, 0x30, 0x00,
        widthBytes & 0xff, (widthBytes >>> 8) & 0xff,
        rows & 0xff, (rows >>> 8) & 0xff
    ]);
}

export const feed = new Uint8Array([0x1b, 0x64, 0x0d]);

