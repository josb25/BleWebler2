import { makePacket, packLineLsbFirst } from './packet-primitives';

/**
 * Catprinter V5G uses the common 51 78 packet envelope but has its own job
 * sequence. The values here are protocol facts documented by the Apache-2.0
 * TiMini-Print project; this implementation is original BleWebler2 code.
 */

export const PRINTHEAD_DOTS = 384;
export const ROW_BYTES = PRINTHEAD_DOTS / 8;

const START_LATTICE = new Uint8Array([
    0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c
]);
const END_LATTICE = new Uint8Array([
    0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17
]);

export function setDensity(value: number): Uint8Array {
    const bounded = Math.max(1, Math.min(200, Math.round(value)));
    return makePacket(0xf2, new Uint8Array([0x01, bounded]));
}

export function deviceState(): Uint8Array {
    return makePacket(0xa3, new Uint8Array([0]));
}

export function setBlackening(level: number): Uint8Array {
    const bounded = Math.max(1, Math.min(5, Math.round(level)));
    return makePacket(0xa4, new Uint8Array([0x30 + bounded]));
}

export function startLattice(): Uint8Array {
    return makePacket(0xa6, START_LATTICE);
}

export function endLattice(): Uint8Array {
    return makePacket(0xa6, END_LATTICE);
}

export function setEnergy(value: number): Uint8Array {
    const bounded = Math.max(0, Math.min(0xffff, Math.round(value)));
    return makePacket(0xaf, new Uint8Array([bounded & 0xff, bounded >>> 8]));
}

export function setImageMode(): Uint8Array {
    return makePacket(0xbe, new Uint8Array([0]));
}

export function feedControl(value: number): Uint8Array {
    return makePacket(0xbd, new Uint8Array([Math.max(0, Math.min(0xff, Math.round(value)))]));
}

export function paperPosition(dpi = 203): Uint8Array {
    return makePacket(0xa1, new Uint8Array(dpi >= 300 ? [0x48, 0x00] : [0x30, 0x00]));
}

export function printLine(pixels: Uint8Array): Uint8Array {
    if (pixels.length !== PRINTHEAD_DOTS) {
        throw new RangeError(`V5G rows must contain ${PRINTHEAD_DOTS} pixels.`);
    }
    return makePacket(0xa2, packLineLsbFirst(pixels));
}

export function initSequence(density: number, blackening: number, energy: number): Uint8Array[] {
    return [
        setDensity(density),
        deviceState(),
        setBlackening(blackening),
        startLattice(),
        setEnergy(energy),
        setImageMode(),
        feedControl(0x0a)
    ];
}

export function endSequence(): Uint8Array[] {
    return [
        feedControl(0x19),
        paperPosition(),
        endLattice(),
        deviceState(),
        deviceState()
    ];
}
