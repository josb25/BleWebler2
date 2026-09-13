import { describe, expect, it } from 'vitest';
import {
    beginPrint,
    connectInit,
    endPrint,
    pauseNotification,
    printLine,
    queryStatus,
    resumeNotification,
    settings
} from './v5c-protocol';

describe('Catprinter V5C protocol', () => {
    it('matches the published control packets', () => {
        expect([...connectInit]).toEqual([0x56, 0x88, 0xaa, 0, 1, 0, 0, 0, 0xff]);
        expect([...queryStatus]).toEqual([0x56, 0x88, 0xa1, 0, 1, 0, 0, 0, 0xff]);
        expect([...beginPrint]).toEqual([0x56, 0x88, 0xa3, 0, 1, 0, 1, 7, 0xff]);
        expect([...endPrint]).toEqual([0x56, 0x88, 0xa6, 0, 2, 0, 0x30, 0, 0xf9, 0xff]);
        expect([...pauseNotification]).toEqual([0x56, 0x88, 0xa7, 1, 1, 0, 1, 7, 0xff]);
        expect([...resumeNotification]).toEqual([0x56, 0x88, 0xa7, 1, 1, 0, 0, 0, 0xff]);
    });

    it('encodes three density states and image mode', () => {
        expect([...settings(1).slice(6, 8)]).toEqual([1, 2]);
        expect([...settings(2).slice(6, 8)]).toEqual([2, 2]);
        expect([...settings(3).slice(6, 8)]).toEqual([3, 2]);
    });

    it('packs one 384-dot row LSB-first in an A4 frame', () => {
        const row = new Uint8Array(384);
        row.set([1, 0, 1, 0, 1, 0, 1, 0]);
        const packet = printLine(row);
        expect(packet[2]).toBe(0xa4);
        expect(packet[4]).toBe(48);
        expect(packet[6]).toBe(0x55);
        expect(() => printLine(new Uint8Array(385))).toThrow(/384/);
    });
});
