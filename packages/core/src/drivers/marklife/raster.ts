/**
 * Turning a page of pixels into a Marklife raster payload.
 *
 * The wire format, established by observing the protocol:
 *
 * ```
 *   1F 10                     opcode
 *   SS SS                     bytes per row,  big-endian
 *   HH HH                     rows,           big-endian
 *   LL LL LL LL               deflated length, big-endian
 *   <deflated 1-bpp bitmap>
 * ```
 *
 * The bitmap is packed one bit per pixel, **most significant bit leftmost**, and
 * each row is padded out to a whole byte.
 */

import { deflate } from 'pako';

/**
 * zlib parameters the printer's decompressor expects.
 *
 * `windowBits: 10` is the load-bearing one and is **not** zlib's default of 15.
 * It is visible in the first two bytes of the stream — a 1 KB window produces a
 * `28 91` header where the default produces `78 9c` — and the firmware reads
 * that header. Compressing with the default yields a stream that is perfectly
 * valid, decodes fine on a desktop, and prints nothing.
 */
const ZLIB_OPTIONS = {
    level: -1,       // zlib's own default trade-off
    windowBits: 10,  // 1 KB window — see above
    memLevel: 8,
    strategy: 0
} as const;

/**
 * Above this, a pixel is paper; at or below it, ink.
 *
 * Applied to the mean of R, G and B. The rasteriser upstream has usually
 * already reduced the page to black and white, in which case this is a
 * formality — but a caller handing over an anti-aliased or greyscale bitmap
 * still gets something sensible rather than a solid block.
 */
const INK_THRESHOLD = 200;

export interface RgbaImage {
    width: number;
    height: number;
    /** RGBA, four bytes per pixel, row-major. */
    data: Uint8Array | Uint8ClampedArray;
}

/**
 * Pack RGBA into rows of 1-bpp, MSB first.
 *
 * Fully transparent pixels are paper regardless of colour: an RGBA canvas
 * initialises to transparent black, and treating that as ink would print a
 * solid rectangle wherever nothing was drawn.
 */
export function packMonochrome(image: RgbaImage): { bitmap: Uint8Array; bytesPerRow: number } {
    const { width, height, data } = image;
    const bytesPerRow = Math.ceil(width / 8);
    const bitmap = new Uint8Array(bytesPerRow * height);

    for (let y = 0; y < height; y++) {
        const rowStart = y * bytesPerRow;
        for (let x = 0; x < width; x++) {
            const px = (y * width + x) * 4;
            const alpha = data[px + 3]!;
            if (alpha === 0) continue;

            const luminance = (data[px]! + data[px + 1]! + data[px + 2]!) / 3;
            if (luminance > INK_THRESHOLD) continue;

            bitmap[rowStart + (x >> 3)]! |= 0x80 >> (x & 7);
        }
    }

    return { bitmap, bytesPerRow };
}

/** The complete `1F 10` payload: header plus deflated bitmap. */
export function encodeRaster(image: RgbaImage): Uint8Array {
    const { bitmap, bytesPerRow } = packMonochrome(image);
    const compressed = deflate(bitmap, ZLIB_OPTIONS);

    const out = new Uint8Array(10 + compressed.length);
    const view = new DataView(out.buffer);

    out[0] = 0x1f;
    out[1] = 0x10;
    view.setUint16(2, bytesPerRow, false);        // big-endian
    view.setUint16(4, image.height, false);
    view.setUint32(6, compressed.length, false);
    out.set(compressed, 10);

    return out;
}
