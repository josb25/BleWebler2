import type { UniversalImageData } from "../driver.interface";

const INK_THRESHOLD = 200;

/** Encode this driver's horizontal canvas as MSB-first printhead rows. */
export function encodeRotatedRaster(
    image: UniversalImageData,
    printheadDots: number,
): {
    data: Uint8Array;
    widthBytes: number;
    rows: number;
} {
    if (!Number.isInteger(printheadDots) || printheadDots < 1) {
        throw new RangeError("Printhead width must be a positive whole number.");
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
            const luminance =
                ((image.data[source] ?? 255) + (image.data[source + 1] ?? 255) + (image.data[source + 2] ?? 255)) / 3;
            if (luminance > INK_THRESHOLD) continue;
            const byte = imageX * widthBytes + Math.floor(headDot / 8);
            output[byte] |= 0x80 >>> (headDot % 8);
        }
    }
    return { data: output, widthBytes, rows };
}
