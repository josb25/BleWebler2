import { describe, expect, it } from 'vitest';
import { crc8, encodeRleLine, makePacket, packLineLsbFirst, printLine, setEnergy } from './protocol';

describe('Catprinter Tiny protocol', () => {
    it('matches published CRC-8 vectors', () => {
        expect(crc8(new Uint8Array([0x33]))).toBe(0x99);
        expect(crc8(new Uint8Array([0x0a]))).toBe(0x36);
        expect(crc8(new Uint8Array([0x88, 0x13]))).toBe(0x67);
    });
    it('frames both packet dialects', () => {
        expect([...makePacket(0xa4, new Uint8Array([0x33]))]).toEqual([0x51, 0x78, 0xa4, 0, 1, 0, 0x33, 0x99, 0xff]);
        expect([...makePacket(0xa4, new Uint8Array([0x34]), 'prefixed')]).toEqual([0x12, 0x51, 0x78, 0xa4, 0, 1, 0, 0x34, 0x8c, 0xff]);
    });
    it('encodes energy little-endian', () => {
        expect([...setEnergy(5000, 'standard')]).toEqual([0x51, 0x78, 0xaf, 0, 2, 0, 0x88, 0x13, 0x67, 0xff]);
    });
    it('packs raw pixels least-significant-bit first', () => {
        expect([...packLineLsbFirst(new Uint8Array([1, 0, 1, 0, 1, 0, 1, 0]))]).toEqual([0x55]);
    });
    it('uses RLE only when it is no larger than the raw row', () => {
        expect([...encodeRleLine(new Uint8Array(384))]).toEqual([0x7f, 0x7f, 0x7f, 0x03]);
        expect(printLine(new Uint8Array(384), 'standard')[2]).toBe(0xbf);
        const alternating = new Uint8Array(384).map((_, index) => index % 2);
        expect(printLine(alternating, 'standard')[2]).toBe(0xa2);
    });
});

