import { describe, expect, it } from 'vitest';
import {
    buildImagePackets,
    challengeCrc,
    crc16Xmodem,
    darkness,
    printFooter,
    printHeader
} from './funny-lx-protocol';

describe('Funny Print LX protocol', () => {
    it('implements CRC-16/XMODEM and the observed LX-D02 challenge vectors', () => {
        expect(crc16Xmodem(new TextEncoder().encode('123456789'))).toBe(0x31c3);
        const mac = new Uint8Array([0xc0, 0, 0, 0, 0x04, 0x60]);
        expect(challengeCrc(new Uint8Array([0xf7]), mac)).toEqual({
            low: new Uint8Array([0x8e]),
            high: new Uint8Array([0x28])
        });
        expect(challengeCrc(new Uint8Array([0xcf]), mac)).toEqual({
            low: new Uint8Array([0xae]),
            high: new Uint8Array([0xe2])
        });
    });

    it('encodes darkness and packet-count controls', () => {
        expect([...darkness(4)]).toEqual([0x5a, 0x0c, 0x03]);
        expect([...printHeader(1)]).toEqual([0x5a, 0x04, 0x00, 0x01, 0x00, 0x00]);
        expect([...printFooter(1)]).toEqual([0x5a, 0x04, 0x00, 0x01, 0x01]);
    });

    it('packs two MSB-first rows into one indexed 100-byte packet', () => {
        const first = new Uint8Array(384);
        const second = new Uint8Array(384);
        first[0] = 1;
        second[1] = 1;
        const [packet] = buildImagePackets([first, second]);
        expect(packet).toHaveLength(100);
        expect([...packet.slice(0, 4)]).toEqual([0x55, 0x00, 0x00, 0x80]);
        expect(packet[51]).toBe(0x40);
        expect(packet[99]).toBe(0);
    });
});
