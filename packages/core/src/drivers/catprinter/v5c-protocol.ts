import { crc8, packLineLsbFirst } from './protocol';

/** Catprinter V5C wire facts, independently expressed for BleWebler2. */
export const PRINTHEAD_DOTS = 384;
export const ROW_BYTES = PRINTHEAD_DOTS / 8;

export function makePacket(
    opcode: number,
    payload: Uint8Array<ArrayBufferLike> = new Uint8Array()
): Uint8Array {
    if (payload.length > 0xffff) throw new RangeError('V5C payload exceeds 65535 bytes.');
    const packet = new Uint8Array(payload.length + 8);
    packet.set([0x56, 0x88, opcode & 0xff, 0x00, payload.length & 0xff, payload.length >>> 8], 0);
    packet.set(payload, 6);
    packet[6 + payload.length] = crc8(payload);
    packet[7 + payload.length] = 0xff;
    return packet;
}

export const connectInit = makePacket(0xaa, new Uint8Array([0]));
export const queryStatus = makePacket(0xa1, new Uint8Array([0]));
export const beginPrint = makePacket(0xa3, new Uint8Array([1]));
export const endPrint = makePacket(0xa6, new Uint8Array([0x30, 0x00]));
export const pauseNotification = makePacket(0xa7, new Uint8Array([1]));
export const resumeNotification = makePacket(0xa7, new Uint8Array([0]));

export function settings(level: number, textMode = false): Uint8Array {
    const density = Math.max(1, Math.min(3, Math.round(level)));
    return makePacket(0xa2, new Uint8Array([density, textMode ? 1 : 2]));
}

export function printLine(pixels: Uint8Array): Uint8Array {
    if (pixels.length !== PRINTHEAD_DOTS) {
        throw new RangeError(`V5C rows must contain ${PRINTHEAD_DOTS} pixels.`);
    }
    return makePacket(0xa4, packLineLsbFirst(pixels));
}

export function packetsEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;
    return left.every((byte, index) => byte === right[index]);
}
