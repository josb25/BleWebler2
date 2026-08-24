import { describe, expect, it } from 'vitest';
import { encodeCode128, Code128Error, _validateWidthsTable } from './code128';
import { encodeQr, QrError } from './qr';
import { thresholdToBW, bayerToBW, floydSteinbergToBW } from './monochrome';
import { measureBitmapText, bitmapScaleForSize, drawBitmapText } from './bitmapfont';
import { defaultFont, getFontMeta, loadFont, resolveBitmapFont, FONT_MANIFEST, FONT_FAMILIES, DEFAULT_FONT_ID } from './fonts/registry';
import { barcodeLayout, qrLayout, measureElement } from './measure';
import { DEFAULT_BITMAP_FONT, type BarcodeElement, type QrElement, type TextElement } from '../model/design';

describe('code128', () => {
    it('has a structurally valid widths table', () => {
        expect(() => _validateWidthsTable()).not.toThrow();
    });

    it('encodes set B data to the expected module count', () => {
        // start + 5 data + checksum = 7 symbols * 11 + stop 13
        expect(encodeCode128('Hello')).toHaveLength(7 * 11 + 13);
    });

    it('packs even-length digit data with set C', () => {
        // start + 3 pairs + checksum = 5 symbols * 11 + stop 13
        expect(encodeCode128('123456')).toHaveLength(5 * 11 + 13);
    });

    it('keeps odd-length digits in set B', () => {
        // start + 5 digits + checksum = 7 symbols * 11 + stop 13
        expect(encodeCode128('12345')).toHaveLength(7 * 11 + 13);
    });

    it('starts with a bar and ends with a bar', () => {
        const modules = encodeCode128('X');
        expect(modules[0]).toBe(true);
        expect(modules[modules.length - 1]).toBe(true);
    });

    it('rejects empty and non-ASCII data', () => {
        expect(() => encodeCode128('')).toThrow(Code128Error);
        expect(() => encodeCode128('täst')).toThrow(Code128Error);
    });
});

describe('qr', () => {
    it('produces a square odd-sized matrix', () => {
        const m = encodeQr('https://example.com', 'M');
        expect(m.length).toBeGreaterThanOrEqual(21);
        expect(m.length % 2).toBe(1);
        for (const row of m) expect(row).toHaveLength(m.length);
    });

    it('grows with error correction level', () => {
        const l = encodeQr('some payload data here', 'L').length;
        const h = encodeQr('some payload data here', 'H').length;
        expect(h).toBeGreaterThanOrEqual(l);
    });

    it('rejects empty data', () => {
        expect(() => encodeQr('', 'M')).toThrow(QrError);
    });
});

function gray(value: number, count: number) {
    const data = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count; i++) {
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = value;
        data[i * 4 + 3] = 255;
    }
    return { data, width: count, height: 1 };
}

function isOneBit(data: Uint8ClampedArray): boolean {
    for (let i = 0; i < data.length; i += 4) {
        const v = data[i];
        if (v !== 0 && v !== 255) return false;
        if (data[i + 1] !== v || data[i + 2] !== v || data[i + 3] !== 255) return false;
    }
    return true;
}

describe('monochrome', () => {
    it('threshold splits exactly at the level', () => {
        const buf = gray(100, 2);
        thresholdToBW(buf, 128);
        expect(buf.data[0]).toBe(0);
        const buf2 = gray(200, 1);
        thresholdToBW(buf2, 128);
        expect(buf2.data[0]).toBe(255);
    });

    it('treats transparent pixels as white', () => {
        const buf = { data: new Uint8ClampedArray([0, 0, 0, 0]), width: 1, height: 1 };
        thresholdToBW(buf, 128);
        expect(buf.data[0]).toBe(255);
    });

    it('invert flips the result', () => {
        const buf = gray(0, 1);
        thresholdToBW(buf, 128, true);
        expect(buf.data[0]).toBe(255);
    });

    it('bayer output is strict 1-bit and roughly preserves mid-gray coverage', () => {
        const buf = { ...gray(128, 64 * 64), width: 64, height: 64 };
        bayerToBW(buf, 128);
        expect(isOneBit(buf.data)).toBe(true);
        let black = 0;
        for (let i = 0; i < buf.data.length; i += 4) if (buf.data[i] === 0) black++;
        const ratio = black / (64 * 64);
        expect(ratio).toBeGreaterThan(0.3);
        expect(ratio).toBeLessThan(0.7);
    });

    it('floyd-steinberg preserves average tone', () => {
        const buf = { ...gray(64, 64 * 64), width: 64, height: 64 };
        floydSteinbergToBW(buf);
        expect(isOneBit(buf.data)).toBe(true);
        let black = 0;
        for (let i = 0; i < buf.data.length; i += 4) if (buf.data[i] === 0) black++;
        const ratio = black / (64 * 64);
        // 64/255 luminance ≈ 75% black coverage
        expect(ratio).toBeGreaterThan(0.65);
        expect(ratio).toBeLessThan(0.85);
    });
});

describe('bitmapfont', () => {
    it('measures monospace single and multi line text (advance = cell width)', () => {
        // cellW=6, cellH=8 sample dimensions
        const m = measureBitmapText('AB', 6, 8, 1);
        expect(m.width).toBe(2 * 6);
        expect(m.height).toBe(8);
        const two = measureBitmapText('A\nBBB', 6, 8, 2);
        expect(two.width).toBe(3 * 6 * 2);
        expect(two.height).toBe(2 * 8 * 2);
    });

    it('snaps scale to an integer >= 1 of the cell height', () => {
        expect(bitmapScaleForSize(4, 7)).toBe(1);
        expect(bitmapScaleForSize(7, 7)).toBe(1);
        expect(bitmapScaleForSize(17, 7)).toBe(2); // round(17/7)=2
        expect(bitmapScaleForSize(32, 16)).toBe(2);
    });

    it('draws known glyphs with fill calls inside the cell', () => {
        const font = defaultFont(); // fixed-5x7
        const rects: Array<[number, number, number, number]> = [];
        drawBitmapText((x, y, w, h) => rects.push([x, y, w, h]), 'A', 10, 20, font, 2);
        expect(rects.length).toBeGreaterThan(0);
        for (const [x, y, w, h] of rects) {
            expect(x).toBeGreaterThanOrEqual(10);
            expect(x + w).toBeLessThanOrEqual(10 + font.w * 2);
            expect(y).toBeGreaterThanOrEqual(20);
            expect(y + h).toBeLessThanOrEqual(20 + font.h * 2);
        }
    });

    it('exposes a non-empty manifest with the default always present', () => {
        expect(FONT_MANIFEST.length).toBeGreaterThan(1);
        expect(FONT_MANIFEST.some(f => f.id === DEFAULT_FONT_ID)).toBe(true);
        expect(getFontMeta(DEFAULT_FONT_ID).w).toBeGreaterThan(0);
        // Unknown ids fall back to the default rather than throwing.
        expect(getFontMeta('nope').id).toBe(DEFAULT_FONT_ID);
    });

    it('lazily loads a non-default font and caches decoded glyphs', async () => {
        const terminus = FONT_MANIFEST.find(f => f.id.startsWith('ter-u'));
        expect(terminus).toBeTruthy();
        const font = await loadFont(terminus!.id);
        expect(font.id).toBe(terminus!.id);
        expect(font.glyphs.get(65)).toBeInstanceOf(Uint8Array); // 'A'
        // Second call returns the cached instance.
        expect(await loadFont(terminus!.id)).toBe(font);
    });
});

describe('measure', () => {
    const barcode: BarcodeElement = {
        type: 'barcode', id: 'b', x: 0, y: 0,
        width: 200, height: 48, data: '1234', showText: true
    };

    it('lays out barcodes with integer module width and quiet zones', () => {
        const layout = barcodeLayout(barcode);
        expect(layout.moduleW).toBeGreaterThanOrEqual(1);
        expect(layout.barsWidth).toBeLessThanOrEqual(barcode.width);
        expect(layout.barsWidth % layout.moduleW).toBe(0);
        expect(layout.barHeight + layout.textBlockH).toBeLessThanOrEqual(barcode.height);
    });

    it('reports encoding errors through measureElement instead of throwing', () => {
        const bad = { ...barcode, data: '' };
        const bounds = measureElement(bad);
        expect(bounds.error).toBeTruthy();
    });

    it('lays out QR with integer module size', () => {
        const qr: QrElement = { type: 'qr', id: 'q', x: 0, y: 0, size: 100, data: 'hi', ecLevel: 'M' };
        const layout = qrLayout(qr);
        expect(layout.size).toBeLessThanOrEqual(100);
        expect(layout.size % layout.moduleSize).toBe(0);
    });

    it('measures bitmap text (via family resolution) without a DOM measurer or loaded glyphs', () => {
        const text: TextElement = {
            type: 'text', id: 't', x: 0, y: 0, size: 16, text: 'HI',
            font: 'bitmap', bitmapFont: DEFAULT_BITMAP_FONT, fontFamily: 'sans-serif',
            bold: false, italic: false, underline: false, align: 'left'
        };
        const r = resolveBitmapFont(DEFAULT_BITMAP_FONT, 16);
        const bounds = measureElement(text);
        expect(bounds.width).toBe(2 * r.meta.w * r.scale);
        expect(bounds.error).toBeUndefined();
    });
});

describe('font families & resolver', () => {
    it('groups fonts into Fixed / Terminus / Spleen (normal weight only)', () => {
        const keys = FONT_FAMILIES.map(f => f.key);
        expect(keys).toContain('fixed');
        expect(keys).toContain('terminus');
        expect(keys).toContain('spleen');
        for (const fam of FONT_FAMILIES) {
            expect(fam.memberIds.length).toBeGreaterThan(0);
            expect(fam.memberIds.every(id => !id.endsWith('b'))).toBe(true); // no bold
        }
    });

    it('resolves a target to a perfect master when one matches exactly', () => {
        // Terminus has a 24px master → target 24 is an exact ×1 match.
        const r = resolveBitmapFont('terminus', 24);
        expect(r.renderedH).toBe(24);
        expect(r.scale).toBe(1);
        expect(r.meta.h).toBe(24);
    });

    it('prefers a clean integer multiple of the highest-resolution master on ties', () => {
        // target 24 in Fixed: 6×12 ×2 (=24) beats 5×8 ×3 (=24) — higher-res master wins.
        const r = resolveBitmapFont('fixed', 24);
        expect(r.renderedH).toBe(24);
        expect(r.meta.h).toBe(12);
        expect(r.scale).toBe(2);
    });

    it('does not aggressively upscale a tiny master for a small target', () => {
        // target 16 in Fixed: prefer 9×15 ×1 (=15, high-res, gentle) over 5×8 ×2 (=16).
        const r = resolveBitmapFont('fixed', 16);
        expect(r.scale).toBe(1);
        expect(r.meta.h).toBe(15);
        // and never a 3×+ blow-up of a small master for a mid target
        expect(resolveBitmapFont('fixed', 32).scale).toBeLessThanOrEqual(2);
    });

    it('never scales below 1× and stays crisp for small targets', () => {
        const r = resolveBitmapFont('spleen', 4); // smallest Spleen master is 16px
        expect(r.scale).toBe(1);
        expect(r.renderedH).toBe(r.meta.h);
    });

    it('accepts a concrete master id and uses it directly', () => {
        const r = resolveBitmapFont('ter-u32n', 32);
        expect(r.id).toBe('ter-u32n');
        expect(r.renderedH).toBe(32);
    });
});
