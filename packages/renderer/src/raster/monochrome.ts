/**
 * Monochrome reduction — pure functions over RGBA buffers (browser ImageData
 * layout, same as UniversalImageData). No DOM, fully unit-testable.
 *
 * All functions composite over white first (labels are white tape), then emit
 * strict 1-bit output: every pixel is (0,0,0,255) or (255,255,255,255).
 */
import type { DitherMode } from '../model/design';

export interface RgbaBuffer {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}

/** Per-pixel luminance after compositing over white. */
function luminanceOverWhite(data: Uint8ClampedArray, i: number): number {
    const a = data[i + 3] / 255;
    const r = data[i] * a + 255 * (1 - a);
    const g = data[i + 1] * a + 255 * (1 - a);
    const b = data[i + 2] * a + 255 * (1 - a);
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function writePixel(data: Uint8ClampedArray, i: number, black: boolean): void {
    const v = black ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
}

/** Fixed threshold: black where luminance < level. Mutates and returns the buffer. */
export function thresholdToBW(buf: RgbaBuffer, level: number, invert = false): RgbaBuffer {
    const { data } = buf;
    for (let i = 0; i < data.length; i += 4) {
        const black = luminanceOverWhite(data, i) < level;
        writePixel(data, i, invert ? !black : black);
    }
    return buf;
}

const BAYER_4X4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
];

/** Ordered (Bayer 4x4) dithering; `level` biases overall darkness (128 = neutral). */
export function bayerToBW(buf: RgbaBuffer, level: number, invert = false): RgbaBuffer {
    const { data, width, height } = buf;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const cell = ((BAYER_4X4[y % 4][x % 4] + 0.5) / 16) * 255;
            const cutoff = cell + (level - 128);
            const black = luminanceOverWhite(data, i) < cutoff;
            writePixel(data, i, invert ? !black : black);
        }
    }
    return buf;
}

/** Floyd–Steinberg error diffusion; `level` shifts the quantization cutoff. */
export function floydSteinbergToBW(buf: RgbaBuffer, level = 128, invert = false): RgbaBuffer {
    const { data, width, height } = buf;
    // Work on a float copy of the luminance plane so error diffusion is exact.
    const lum = new Float32Array(width * height);
    for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
        lum[p] = luminanceOverWhite(data, i);
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const p = y * width + x;
            const old = lum[p];
            const black = old < level;
            const next = black ? 0 : 255;
            const err = old - next;
            if (x + 1 < width) lum[p + 1] += err * 7 / 16;
            if (y + 1 < height) {
                if (x > 0) lum[p + width - 1] += err * 3 / 16;
                lum[p + width] += err * 5 / 16;
                if (x + 1 < width) lum[p + width + 1] += err * 1 / 16;
            }
            writePixel(data, p * 4, invert ? !black : black);
        }
    }
    return buf;
}

export function applyDither(buf: RgbaBuffer, mode: DitherMode, level: number, invert = false): RgbaBuffer {
    switch (mode) {
        case 'threshold': return thresholdToBW(buf, level, invert);
        case 'bayer': return bayerToBW(buf, level, invert);
        case 'floyd-steinberg': return floydSteinbergToBW(buf, level, invert);
    }
}
