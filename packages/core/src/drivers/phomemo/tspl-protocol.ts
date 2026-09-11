/** Driver-complete TSPL subset used by Phomemo PM-241 shipping-label printers. */

const encoder = new TextEncoder();

function finite(value: number, name: string): number {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
    return value;
}

function mm(value: number, name: string): string {
    const rounded = Math.round(finite(value, name) * 100) / 100;
    if (rounded < 0) throw new RangeError(`${name} cannot be negative.`);
    return String(rounded);
}

export function command(value: string): Uint8Array {
    return encoder.encode(`${value}\r\n`);
}

export function size(widthMm: number, heightMm: number): Uint8Array {
    return command(`SIZE ${mm(widthMm, 'Label width')} mm,${mm(heightMm, 'Label height')} mm`);
}

export function gap(gapMm: number, offsetMm = 0): Uint8Array {
    return command(`GAP ${mm(gapMm, 'Gap')} mm,${mm(offsetMm, 'Gap offset')} mm`);
}

export function offset(offsetMm: number): Uint8Array {
    const rounded = Math.round(finite(offsetMm, 'Offset') * 100) / 100;
    return command(`OFFSET ${rounded} mm`);
}

export function density(level: number): Uint8Array {
    return command(`DENSITY ${Math.max(0, Math.min(15, Math.round(finite(level, 'Density'))))}`);
}

export function speed(value: number): Uint8Array {
    return command(`SPEED ${Math.max(1, Math.min(10, Math.round(finite(value, 'Speed'))))}`);
}

export const directionNormal = command('DIRECTION 0');
export const clear = command('CLS');
export const rasterTerminator = command('');

/** BITMAP has no line ending: binary raster bytes immediately follow the comma. */
export function bitmapHeader(widthBytes: number, rows: number): Uint8Array {
    if (!Number.isInteger(widthBytes) || widthBytes < 1) throw new RangeError('Bitmap width must be positive bytes.');
    if (!Number.isInteger(rows) || rows < 1) throw new RangeError('Bitmap height must be positive rows.');
    return encoder.encode(`BITMAP 0,0,${widthBytes},${rows},0,`);
}

export function print(copies = 1): Uint8Array {
    return command(`PRINT ${Math.max(1, Math.round(finite(copies, 'Copies')))},1`);
}

/** BleWebler2 uses 1=black; TSPL BITMAP uses cleared bits for black. */
export function invertRaster(data: Uint8Array): Uint8Array {
    return Uint8Array.from(data, byte => byte ^ 0xff);
}
