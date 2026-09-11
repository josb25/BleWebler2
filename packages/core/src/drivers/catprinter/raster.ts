import type { UniversalImageData } from '../driver.interface';

const INK_THRESHOLD = 200;

/** Rotate the horizontal label canvas into one row per feed step. */
export function rotateToPrintRows(image: UniversalImageData, printheadDots = 384): Uint8Array[] {
    const rows: Uint8Array[] = [];
    const yOffset = Math.floor((printheadDots - image.height) / 2);

    for (let imageX = 0; imageX < image.width; imageX += 1) {
        const row = new Uint8Array(printheadDots);
        for (let imageY = 0; imageY < image.height; imageY += 1) {
            const headDot = printheadDots - 1 - (imageY + yOffset);
            if (headDot < 0 || headDot >= printheadDots) continue;
            const source = (imageY * image.width + imageX) * 4;
            const alpha = image.data[source + 3] ?? 0;
            if (alpha === 0) continue;
            const luminance = ((image.data[source] ?? 255) + (image.data[source + 1] ?? 255) + (image.data[source + 2] ?? 255)) / 3;
            if (luminance <= INK_THRESHOLD) row[headDot] = 1;
        }
        rows.push(row);
    }
    return rows;
}

