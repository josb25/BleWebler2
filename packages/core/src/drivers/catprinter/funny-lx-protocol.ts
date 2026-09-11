export const PRINTHEAD_DOTS = 384;
export const ROW_BYTES = PRINTHEAD_DOTS / 8;
export const IMAGE_DATA_BYTES = 96;

export const statusQuery = new Uint8Array([0x5a, 0x01, 0x00]);

export function crc16Xmodem(data: Uint8Array): number {
    let crc = 0;
    for (const byte of data) {
        crc ^= byte << 8;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc & 0x8000) !== 0
                ? ((crc << 1) ^ 0x1021) & 0xffff
                : (crc << 1) & 0xffff;
        }
    }
    return crc;
}

export function challengeCrc(random: Uint8Array, mac: Uint8Array): { low: Uint8Array; high: Uint8Array } {
    if (mac.length !== 6) throw new RangeError('Funny LX challenge requires a six-byte MAC address.');
    const low = new Uint8Array(random.length);
    const high = new Uint8Array(random.length);
    for (let index = 0; index < random.length; index += 1) {
        const input = new Uint8Array(7);
        input[0] = random[index];
        input.set(mac, 1);
        const crc = crc16Xmodem(input);
        low[index] = crc & 0xff;
        high[index] = crc >>> 8;
    }
    return { low, high };
}

export function randomChallenge(random: Uint8Array): Uint8Array {
    if (random.length !== 10) throw new RangeError('Funny LX challenge requires ten random bytes.');
    return concat(new Uint8Array([0x5a, 0x0a]), random);
}

export function highChallenge(highCrc: Uint8Array): Uint8Array {
    if (highCrc.length !== 10) throw new RangeError('Funny LX challenge requires ten high CRC bytes.');
    return concat(new Uint8Array([0x5a, 0x0b]), highCrc);
}

export function darkness(level: number): Uint8Array {
    const bounded = Math.max(1, Math.min(5, Math.round(level)));
    return new Uint8Array([0x5a, 0x0c, bounded - 1]);
}

export function printHeader(packetCount: number): Uint8Array {
    const [high, low] = u16be(packetCount);
    return new Uint8Array([0x5a, 0x04, high, low, 0x00, 0x00]);
}

export function printFooter(packetCount: number): Uint8Array {
    const [high, low] = u16be(packetCount);
    return new Uint8Array([0x5a, 0x04, high, low, 0x01]);
}

export function buildImagePackets(rows: readonly Uint8Array[]): Uint8Array[] {
    const content = new Uint8Array(rows.length * ROW_BYTES);
    rows.forEach((row, rowIndex) => {
        if (row.length !== PRINTHEAD_DOTS) {
            throw new RangeError(`Funny LX rows must contain ${PRINTHEAD_DOTS} pixels.`);
        }
        content.set(packLineMsbFirst(row), rowIndex * ROW_BYTES);
    });

    const packetCount = Math.ceil(content.length / IMAGE_DATA_BYTES);
    if (packetCount > 0xffff) throw new RangeError('Funny LX raster exceeds 65535 image packets.');
    const packets: Uint8Array[] = [];
    for (let index = 0; index < packetCount; index += 1) {
        const packet = new Uint8Array(100);
        const [high, low] = u16be(index);
        packet.set([0x55, high, low], 0);
        packet.set(content.slice(index * IMAGE_DATA_BYTES, (index + 1) * IMAGE_DATA_BYTES), 3);
        // Byte 99 is a fixed zero terminator; Uint8Array initialisation supplies it.
        packets.push(packet);
    }
    return packets;
}

export function retryIndex(notification: Uint8Array): number | undefined {
    if (notification.length < 4 || notification[0] !== 0x5a || notification[1] !== 0x05) return undefined;
    return (notification[2] << 8) | notification[3];
}

export function delayHintMs(notification: Uint8Array): number | undefined {
    if (notification.length < 3 || notification[0] !== 0x5a || notification[1] !== 0x07) return undefined;
    return notification[2];
}

export function hasPrefix(data: Uint8Array, prefix: readonly number[]): boolean {
    return data.length >= prefix.length && prefix.every((byte, index) => data[index] === byte);
}

export function footerMatches(data: Uint8Array, packetCount: number): boolean {
    const footer = printFooter(packetCount);
    return data.length >= footer.length && footer.every((byte, index) => data[index] === byte);
}

function packLineMsbFirst(pixels: Uint8Array): Uint8Array {
    const packed = new Uint8Array(Math.ceil(pixels.length / 8));
    for (let index = 0; index < pixels.length; index += 1) {
        if (pixels[index]) packed[index >>> 3] |= 0x80 >>> (index & 7);
    }
    return packed;
}

function u16be(value: number): [number, number] {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        throw new RangeError('Funny LX value must fit an unsigned 16-bit integer.');
    }
    return [value >>> 8, value & 0xff];
}

function concat(...parts: Uint8Array[]): Uint8Array {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }
    return output;
}
