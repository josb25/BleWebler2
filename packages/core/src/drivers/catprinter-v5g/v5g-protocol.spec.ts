import { describe, expect, it } from 'vitest';
import {
    endSequence,
    initSequence,
    printLine,
    setDensity
} from './v5g-protocol';

describe('Catprinter V5G protocol', () => {
    it('frames the V5G density command with its marker byte', () => {
        expect([...setDensity(130)]).toEqual([
            0x51, 0x78, 0xf2, 0x00, 0x02, 0x00, 0x01, 0x82, 0x92, 0xff
        ]);
    });

    it('builds the documented job prologue and epilogue', () => {
        const init = initSequence(130, 3, 10_000);
        expect(init.map(packet => packet[2])).toEqual([0xf2, 0xa3, 0xa4, 0xa6, 0xaf, 0xbe, 0xbd]);
        expect(init.at(-1)?.[6]).toBe(0x0a);

        const end = endSequence();
        expect(end.map(packet => packet[2])).toEqual([0xbd, 0xa1, 0xa6, 0xa3, 0xa3]);
        expect(end[0][6]).toBe(0x19);
    });

    it('always sends raw 384-dot LSB-first row packets', () => {
        const row = new Uint8Array(384);
        row.set([1, 0, 1, 0, 1, 0, 1, 0]);
        const packet = printLine(row);
        expect(packet[2]).toBe(0xa2);
        expect(packet[4]).toBe(48);
        expect(packet[6]).toBe(0x55);
        expect(() => printLine(new Uint8Array(383))).toThrow(/384/);
    });
});
