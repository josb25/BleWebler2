import { describe, expect, it } from 'vitest';
import { flush, makeControlPacket, parseNotification, prepareRaster, printRequest, setIntensity } from './mxw01-protocol';

describe('Catprinter MXW01/V5X protocol', () => {
    it('frames 22 21 control packets with payload-only CRC-8', () => {
        expect([...setIntensity(0x5d)]).toEqual([0x22, 0x21, 0xa2, 0, 1, 0, 0x5d, 0x94, 0xff]);
        expect([...printRequest(0x1234)]).toEqual([0x22, 0x21, 0xa9, 0, 4, 0, 0x34, 0x12, 0x30, 0, 0x7c, 0xff]);
        expect([...flush]).toEqual([0x22, 0x21, 0xad, 0, 1, 0, 0, 0, 0xff]);
    });

    it('packs LSB-first bulk rows and pads short jobs to 90 lines', () => {
        const row = new Uint8Array(384);
        row.set([1, 0, 1, 0, 1, 0, 1, 0]);
        const raster = prepareRaster([row]);
        expect(raster).toHaveLength(4320);
        expect(raster[0]).toBe(0x55);
        expect(raster.slice(48).every(value => value === 0)).toBe(true);
    });

    it('parses responses with or without CRC and footer', () => {
        const complete = makeControlPacket(0xa9, new Uint8Array([0]));
        expect(parseNotification(complete)).toEqual({ opcode: 0xa9, payload: new Uint8Array([0]) });
        expect(parseNotification(complete.slice(0, 7))).toEqual({ opcode: 0xa9, payload: new Uint8Array([0]) });
        expect(parseNotification(new Uint8Array([0x22, 0x21, 0xa9]))).toBeUndefined();
    });
});
