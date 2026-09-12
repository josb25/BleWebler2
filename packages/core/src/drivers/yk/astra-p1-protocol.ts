import type { UniversalImageData } from '../driver.interface';

export const HEAD_DOTS = 96;
export const PRINTABLE_DOTS = 90;
export const LEFT_PADDING_DOTS = 6;
export const ROW_BYTES = HEAD_DOTS / 8;
export const ROWS_PER_SLICE = 4;

export const Command = {
    raster: 0x00,
    feedForward: 0x02,
    feedSpecial: 0x03,
    feedBackward: 0x04,
    density: 0x09,
    speed: 0x0a,
    paperType: 0x28
} as const;

export type S001MediaMode = 'plain' | 'tag' | 'black-tag';

export function frame(command: number, payload: Uint8Array = new Uint8Array(), sequence = 0): Uint8Array {
    if (!Number.isInteger(command) || command < 0 || command > 0xff) {
        throw new RangeError('YK command must fit in one byte.');
    }
    if (!Number.isInteger(sequence) || sequence < 0) {
        throw new RangeError('YK sequence must be a non-negative whole number.');
    }
    if (payload.length > 0xffff) throw new RangeError('YK payload must fit in uint16.');

    const result = new Uint8Array(payload.length + 10);
    result[0] = 0x64;
    result[1] = command;
    result[2] = sequence % 64;
    result[3] = payload.length & 0xff;
    result[4] = payload.length >>> 8;
    result.set(payload, 5);
    result[result.length - 1] = 0x9b;
    return result;
}

export function densityLevel(level: number): number {
    const uiLevel = Math.max(1, Math.min(5, Math.round(level)));
    return 5 + ((uiLevel - 1) * 2);
}

export function paperType(mode: S001MediaMode): number {
    if (mode === 'plain') return 0;
    if (mode === 'tag') return 1;
    return 2;
}

export function feedPayload(distanceDots: number): Uint8Array {
    if (!Number.isInteger(distanceDots) || distanceDots < 0 || distanceDots > 0xffff) {
        throw new RangeError('YK feed distance must fit in uint16.');
    }
    return Uint8Array.of(distanceDots & 0xff, distanceDots >>> 8);
}

export function specialFeedPayload(mode: number, distanceDots: number): Uint8Array {
    if (!Number.isInteger(mode) || mode < 0 || mode > 0xff) {
        throw new RangeError('YK feed mode must fit in one byte.');
    }
    return Uint8Array.of(mode, ...feedPayload(distanceDots));
}

/** Pack the editor canvas into 96-dot, MSB-first S001 rows with six leading blank dots. */
export function encodeRaster(image: UniversalImageData): Uint8Array {
    if (image.height > PRINTABLE_DOTS) {
        throw new RangeError(`S001 raster height ${image.height} exceeds ${PRINTABLE_DOTS} printable dots.`);
    }
    const output = new Uint8Array(image.width * ROW_BYTES);
    for (let x = 0; x < image.width; x += 1) {
        for (let y = 0; y < image.height; y += 1) {
            const source = ((y * image.width) + x) * 4;
            const alpha = image.data[source + 3] ?? 0;
            if (alpha === 0) continue;
            const luminance = ((image.data[source] ?? 255)
                + (image.data[source + 1] ?? 255)
                + (image.data[source + 2] ?? 255)) / 3;
            if (luminance > 200) continue;
            const headDot = LEFT_PADDING_DOTS + y;
            output[(x * ROW_BYTES) + (headDot >>> 3)] |= 0x80 >>> (headDot & 7);
        }
    }
    return output;
}

export function rasterSlices(data: Uint8Array): Uint8Array[] {
    const sliceBytes = ROW_BYTES * ROWS_PER_SLICE;
    const slices: Uint8Array[] = [];
    for (let offset = 0; offset < data.length; offset += sliceBytes) {
        slices.push(data.slice(offset, offset + sliceBytes));
    }
    return slices;
}
