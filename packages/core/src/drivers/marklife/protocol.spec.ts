/**
 * The wire format, pinned.
 *
 * These assertions are about bytes a physical printer expects, so they are not
 * really testing this code — they are recording what the hardware wants, where
 * a refactor will trip over it. A failure here means either the protocol
 * understanding changed (rare, deliberate) or somebody broke it (likely).
 *
 * The printer cannot tell you it received nonsense. It simply prints nothing,
 * or feeds until the roll runs out. That is why this file exists.
 */

import { describe, it, expect } from 'vitest';
import { inflate } from 'pako';
import * as Protocol from './protocol';
import { encodeRaster, encodeRasterGsV0, packMonochrome } from './raster';

const hex = (b: Uint8Array): string =>
    [...b].map(v => v.toString(16).padStart(2, '0')).join(' ');

describe('marklife command set', () => {
    it('frames job control', () => {
        expect(hex(Protocol.startJob())).toBe('1f c0 01 00');
        expect(hex(Protocol.endJob())).toBe('1f c0 01 01');
        expect(hex(Protocol.endJobAlternate())).toBe('10 ff f1 45');
    });

    it('frames media type with the values the hardware accepts', () => {
        expect(hex(Protocol.setMediaType(Protocol.MediaType.Continuous))).toBe('1f 80 01 10');
        expect(hex(Protocol.setMediaType(Protocol.MediaType.Gap))).toBe('1f 80 01 20');
        expect(hex(Protocol.getMediaType())).toBe('1f 80 00');
    });

    it('clamps density into range rather than refusing to print', () => {
        expect(hex(Protocol.setDensity(3))).toBe('1f 70 01 03');
        expect(hex(Protocol.setDensity(0))).toBe('1f 70 01 01');
        expect(hex(Protocol.setDensity(99))).toBe('1f 70 01 0f');
    });

    it('splits multi-byte fields big-endian', () => {
        // 0x0102 = 258: high byte first.
        expect(hex(Protocol.align(0x51, 258))).toBe('1f 11 51 01 02');
        expect(hex(Protocol.setAutoOffMinutes(258))).toBe('10 ff 12 01 02');
    });

    it('keeps feed within one byte', () => {
        expect(hex(Protocol.feedDots(30))).toBe('1b 4a 1e');
        expect(hex(Protocol.feedDots(9999))).toBe('1b 4a ff');
        expect(hex(Protocol.feedDots(-5))).toBe('1b 4a 00');
    });

    it('frames the legacy L11 job the way the manufacturer app does', () => {
        expect(Protocol.legacyWakeup().length).toBe(15);
        expect(Protocol.legacyWakeup().every(b => b === 0)).toBe(true);
        expect(hex(Protocol.legacyStartJob())).toBe('10 ff f1 02');
        expect(hex(Protocol.gapAlign())).toBe('1d 0c');
        expect(hex(Protocol.setLegacyDensity(6))).toBe('10 ff 10 00 06');
        expect([1, 5, 6, 10, 11, 15].map(Protocol.legacyDensityGear)).toEqual([2, 2, 6, 6, 10, 10]);
    });

    it('uses the module dialect for device queries', () => {
        expect(hex(Protocol.getBatteryVoltage())).toBe('10 ff 50 f1');
        expect(hex(Protocol.getFirmwareVersion())).toBe('10 ff 20 f1');
        expect(hex(Protocol.getSerialNumber())).toBe('10 ff 20 f2');
        expect(hex(Protocol.getModelName())).toBe('10 ff 20 f0');
        expect(hex(Protocol.getMacAddress())).toBe('10 ff 30 11');
    });
});

describe('marklife raster', () => {
    /** Solid black, so every bit in every byte should be set. */
    const black = (w: number, h: number) => ({
        width: w, height: h,
        data: new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : 0))
    });

    it('packs one bit per pixel, most significant bit leftmost', () => {
        // A single ink pixel at x=0 must land in the top bit.
        const data = new Uint8Array(8 * 1 * 4);
        data[3] = 255; // opaque, black
        for (let i = 1; i < 8; i++) { const o = i * 4; data[o] = data[o + 1] = data[o + 2] = 255; data[o + 3] = 255; }
        const { bitmap, bytesPerRow } = packMonochrome({ width: 8, height: 1, data });
        expect(bytesPerRow).toBe(1);
        expect(bitmap[0]).toBe(0x80);
    });

    it('pads each row to a whole byte', () => {
        // 13 px needs 2 bytes per row, not 1.625.
        const { bytesPerRow, bitmap } = packMonochrome(black(13, 3));
        expect(bytesPerRow).toBe(2);
        expect(bitmap.length).toBe(6);
    });

    it('treats transparent pixels as paper', () => {
        // Fully transparent black: an untouched RGBA canvas. Printing this as
        // ink would put a solid rectangle behind every design.
        const data = new Uint8Array(8 * 1 * 4); // all zero => transparent black
        const { bitmap } = packMonochrome({ width: 8, height: 1, data });
        expect(bitmap[0]).toBe(0x00);
    });

    it('writes the 10-byte header big-endian', () => {
        const raster = encodeRaster(black(320, 96));
        expect(raster[0]).toBe(0x1f);
        expect(raster[1]).toBe(0x10);
        const view = new DataView(raster.buffer, raster.byteOffset);
        expect(view.getUint16(2, false)).toBe(40);   // 320 px -> 40 bytes per row
        expect(view.getUint16(4, false)).toBe(96);   // rows
        expect(view.getUint32(6, false)).toBe(raster.length - 10);
    });

    it('compresses with a 1 KB window, which the firmware reads from the header', () => {
        const raster = encodeRaster(black(320, 96));
        // 0x28 0x91 is zlib's CMF/FLG for windowBits 10. The default (15)
        // produces 0x78 0x9c and prints nothing.
        expect(hex(raster.slice(10, 12))).toBe('28 91');
    });

    it('writes the GS v 0 header little-endian with the raw bitmap behind it', () => {
        // 96-dot head, 258 rows: 12 bytes per row, 0x0102 rows -> low byte first.
        const raster = encodeRasterGsV0(black(96, 258));
        expect(hex(raster.slice(0, 8))).toBe('1d 76 30 00 0c 00 02 01');
        expect(raster.length).toBe(8 + 12 * 258);
        expect(raster.slice(8).every(b => b === 0xff)).toBe(true);
    });

    it('round-trips: the payload really is the bitmap', () => {
        const image = black(64, 8);
        const raster = encodeRaster(image);
        const restored = inflate(raster.slice(10));
        const { bitmap } = packMonochrome(image);
        expect(Buffer.compare(Buffer.from(restored), Buffer.from(bitmap))).toBe(0);
        expect(restored.every(b => b === 0xff)).toBe(true);
    });
});
