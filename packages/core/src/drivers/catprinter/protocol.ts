/**
 * The common "Tiny" / Catprinter packet protocol used by many inexpensive
 * 384-dot BLE pocket printers.
 *
 * Packet layout:
 *   prefix, opcode, 00, payload length (u16le), payload, CRC-8, FF
 *
 * Protocol facts and vectors are independently corroborated by the CC0
 * NaitLee/Cat-Printer commander, MIT rbaron/catprinter implementation, and the
 * Apache-2.0 TiMini-Print conformance suite. No third-party implementation is
 * bundled here.
 */

import { crc8, packLineLsbFirst } from './packet-primitives';
export { crc8, packLineLsbFirst } from './packet-primitives';

export type CatPrinterDialect = 'standard' | 'prefixed';

export const STANDARD_PREFIX = new Uint8Array([0x51, 0x78]);
export const PREFIXED_PREFIX = new Uint8Array([0x12, 0x51, 0x78]);

export function makePacket(
    opcode: number,
    payload: Uint8Array = new Uint8Array(),
    dialect: CatPrinterDialect = 'standard'
): Uint8Array {
    const prefix = dialect === 'prefixed' ? PREFIXED_PREFIX : STANDARD_PREFIX;
    const out = new Uint8Array(prefix.length + 6 + payload.length);
    out.set(prefix, 0);
    let offset = prefix.length;
    out[offset++] = opcode & 0xff;
    out[offset++] = 0x00;
    out[offset++] = payload.length & 0xff;
    out[offset++] = (payload.length >>> 8) & 0xff;
    out.set(payload, offset);
    offset += payload.length;
    out[offset++] = crc8(payload);
    out[offset] = 0xff;
    return out;
}

export function setQuality(level: number, dialect: CatPrinterDialect): Uint8Array {
    const bounded = Math.max(1, Math.min(5, Math.round(level)));
    return makePacket(0xa4, new Uint8Array([0x30 + bounded]), dialect);
}

export function setEnergy(energy: number, dialect: CatPrinterDialect): Uint8Array {
    const bounded = Math.max(0, Math.min(0xffff, Math.round(energy)));
    return makePacket(0xaf, new Uint8Array([bounded & 0xff, (bounded >>> 8) & 0xff]), dialect);
}

export function setPrintMode(textMode: boolean, dialect: CatPrinterDialect): Uint8Array {
    return makePacket(0xbe, new Uint8Array([textMode ? 1 : 0]), dialect);
}

export function setSpeed(speed: number, dialect: CatPrinterDialect): Uint8Array {
    return makePacket(0xbd, new Uint8Array([Math.max(1, Math.min(255, Math.round(speed)))]), dialect);
}

export function deviceState(dialect: CatPrinterDialect): Uint8Array {
    return makePacket(0xa3, new Uint8Array([0]), dialect);
}

export function startLattice(dialect: CatPrinterDialect): Uint8Array {
    return makePacket(0xa6, new Uint8Array([
        0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c
    ]), dialect);
}

export function endLattice(dialect: CatPrinterDialect): Uint8Array {
    return makePacket(0xa6, new Uint8Array([
        0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17
    ]), dialect);
}

export function setPaper(dialect: CatPrinterDialect, dpi = 203): Uint8Array {
    return makePacket(0xa1, new Uint8Array(dpi >= 300 ? [0x48, 0x00] : [0x30, 0x00]), dialect);
}

export function feed(amount: number, dialect: CatPrinterDialect): Uint8Array {
    const bounded = Math.max(0, Math.min(0xffff, Math.round(amount)));
    return makePacket(0xa1, new Uint8Array([bounded & 0xff, (bounded >>> 8) & 0xff]), dialect);
}

function encodeRun(colour: number, count: number, output: number[]): void {
    while (count > 0x7f) {
        output.push((colour << 7) | 0x7f);
        count -= 0x7f;
    }
    if (count > 0) output.push((colour << 7) | count);
}

export function encodeRleLine(pixels: Uint8Array): Uint8Array {
    if (pixels.length === 0) return new Uint8Array();
    const out: number[] = [];
    let previous = pixels[0] ? 1 : 0;
    let count = 1;
    for (let index = 1; index < pixels.length; index += 1) {
        const current = pixels[index] ? 1 : 0;
        if (current === previous) {
            count += 1;
        } else {
            encodeRun(previous, count, out);
            previous = current;
            count = 1;
        }
    }
    encodeRun(previous, count, out);
    return new Uint8Array(out);
}

export function printLine(pixels: Uint8Array, dialect: CatPrinterDialect): Uint8Array {
    const raw = packLineLsbFirst(pixels);
    const compressed = encodeRleLine(pixels);
    return compressed.length <= raw.length
        ? makePacket(0xbf, compressed, dialect)
        : makePacket(0xa2, raw, dialect);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}
