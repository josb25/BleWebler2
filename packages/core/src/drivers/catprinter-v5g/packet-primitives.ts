/** Packet helpers owned by the V5G protocol driver. */
export function crc8(payload: Uint8Array): number {
    let crc = 0;
    for (const byte of payload) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
        }
    }
    return crc;
}

export function packLineLsbFirst(pixels: Uint8Array): Uint8Array {
    const packed = new Uint8Array(Math.ceil(pixels.length / 8));
    for (let index = 0; index < pixels.length; index += 1) {
        if (pixels[index]) packed[index >>> 3] |= 1 << (index & 7);
    }
    return packed;
}

export function makePacket(opcode: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
    const out = new Uint8Array(8 + payload.length);
    out.set([0x51, 0x78, opcode & 0xff, 0x00, payload.length & 0xff, payload.length >>> 8], 0);
    out.set(payload, 6);
    out[6 + payload.length] = crc8(payload);
    out[7 + payload.length] = 0xff;
    return out;
}
