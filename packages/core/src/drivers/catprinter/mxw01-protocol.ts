import { crc8, packLineLsbFirst } from './packet-primitives';

export const CONTROL_WRITE = '0000ae01-0000-1000-8000-00805f9b34fb';
export const NOTIFY = '0000ae02-0000-1000-8000-00805f9b34fb';
export const DATA_WRITE = '0000ae03-0000-1000-8000-00805f9b34fb';
export const PRINTHEAD_DOTS = 384;
export const ROW_BYTES = PRINTHEAD_DOTS / 8;
export const MIN_ROWS = 90;

export function makeControlPacket(opcode: number, payload = new Uint8Array()): Uint8Array {
    if (payload.length > 0xffff) throw new RangeError('MXW01 control payload exceeds 65535 bytes.');
    const packet = new Uint8Array(payload.length + 8);
    packet.set([0x22, 0x21, opcode & 0xff, 0, payload.length & 0xff, payload.length >>> 8], 0);
    packet.set(payload, 6);
    packet[6 + payload.length] = crc8(payload);
    packet[7 + payload.length] = 0xff;
    return packet;
}

export function setIntensity(value: number): Uint8Array {
    const intensity = Math.max(0, Math.min(0xff, Math.round(Number.isFinite(value) ? value : 0x5d)));
    return makeControlPacket(0xa2, new Uint8Array([intensity]));
}

export function printRequest(rows: number): Uint8Array {
    if (!Number.isInteger(rows) || rows < 1 || rows > 0xffff) {
        throw new RangeError('MXW01 raster height must be between 1 and 65535 rows.');
    }
    return makeControlPacket(0xa9, new Uint8Array([rows & 0xff, rows >>> 8, 0x30, 0x00]));
}

export const flush = makeControlPacket(0xad, new Uint8Array([0]));

/** Pack rotated printhead rows and satisfy the observed 90-row minimum. */
export function prepareRaster(rows: readonly Uint8Array[]): Uint8Array {
    const rowCount = Math.max(MIN_ROWS, rows.length);
    const output = new Uint8Array(rowCount * ROW_BYTES);
    rows.forEach((row, index) => {
        if (row.length !== PRINTHEAD_DOTS) {
            throw new RangeError(`MXW01 rows must contain ${PRINTHEAD_DOTS} pixels.`);
        }
        output.set(packLineLsbFirst(row), index * ROW_BYTES);
    });
    return output;
}

export interface Mxw01Notification {
    opcode: number;
    payload: Uint8Array;
}

/** Parse one complete notification; firmware may omit the optional CRC/footer. */
export function parseNotification(data: Uint8Array): Mxw01Notification | undefined {
    if (data.length < 6 || data[0] !== 0x22 || data[1] !== 0x21) return undefined;
    const length = data[4] | (data[5] << 8);
    if (data.length < 6 + length) return undefined;
    return { opcode: data[2], payload: data.slice(6, 6 + length) };
}
