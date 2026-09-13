import type { UniversalImageData } from '../driver.interface';

const INK_THRESHOLD = 200;

/**
 * Encode the editor's horizontal RGBA canvas as PeriPage's MSB-first rows.
 * Kept family-local so future hardware findings cannot silently change another
 * printer family that happens to use the same packing today.
 */
export function encodePeriPageRaster(image: UniversalImageData, printheadDots: number): {
    data: Uint8Array;
    widthBytes: number;
    rows: number;
} {
    if (!Number.isInteger(printheadDots) || printheadDots < 1) {
        throw new RangeError('Printhead width must be a positive whole number.');
    }
    const widthBytes = Math.ceil(printheadDots / 8);
    const rows = image.width;
    const output = new Uint8Array(widthBytes * rows);
    const yOffset = Math.floor((printheadDots - image.height) / 2);

    for (let imageX = 0; imageX < image.width; imageX += 1) {
        for (let imageY = 0; imageY < image.height; imageY += 1) {
            const headDot = printheadDots - 1 - (imageY + yOffset);
            if (headDot < 0 || headDot >= printheadDots) continue;
            const source = (imageY * image.width + imageX) * 4;
            const alpha = image.data[source + 3] ?? 0;
            if (alpha === 0) continue;
            const luminance = ((image.data[source] ?? 255)
                + (image.data[source + 1] ?? 255)
                + (image.data[source + 2] ?? 255)) / 3;
            if (luminance > INK_THRESHOLD) continue;
            const byte = imageX * widthBytes + Math.floor(headDot / 8);
            output[byte] |= 0x80 >>> (headDot % 8);
        }
    }
    return { data: output, widthBytes, rows };
}

/** Build the PeriPage raw-family GS v 0 image header. */
export function peripageRasterHeader(widthBytes: number, rows: number, mode: number = 0): Uint8Array {
    if (!Number.isInteger(widthBytes) || widthBytes < 1 || widthBytes > 0xffff) {
        throw new RangeError('Raster width must be between 1 and 65535 bytes.');
    }
    if (!Number.isInteger(rows) || rows < 1 || rows > 0xffff) {
        throw new RangeError('Raster height must be between 1 and 65535 rows.');
    }
    return new Uint8Array([
        0x1d, 0x76, 0x30, mode & 0xff,
        widthBytes & 0xff, (widthBytes >>> 8) & 0xff,
        rows & 0xff, (rows >>> 8) & 0xff
    ]);
}
