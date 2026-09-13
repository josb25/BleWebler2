/** Byte-level helpers owned by this protocol driver. */
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
