import { describe, it, expect } from 'vitest';
import { textLayout, measureElement } from './measure';
import type { TextElement } from '../model/design';

const text = (o: Partial<TextElement> = {}): TextElement => ({
    type: 'text', id: 't', x: 0, y: 0, size: 16, text: 'Hi',
    font: 'bitmap', bitmapFont: 'fixed', fontFamily: 'sans-serif',
    bold: false, italic: false, underline: false, align: 'left',
    ...o
});

describe('text frame', () => {
    it('hugs the glyphs when no frame is set', () => {
        const t = textLayout(text());
        expect(t.boxW).toBe(t.inkW);
        expect(t.boxH).toBe(t.inkH);
        expect([t.dx, t.dy]).toEqual([0, 0]);
    });

    it('takes each declared side independently', () => {
        const wOnly = textLayout(text({ width: 100 }));
        expect(wOnly.boxW).toBe(100);
        expect(wOnly.boxH).toBe(wOnly.inkH); // height still auto

        const hOnly = textLayout(text({ height: 60 }));
        expect(hOnly.boxW).toBe(hOnly.inkW);
        expect(hOnly.boxH).toBe(60);
    });

    it('places the block by align and valign', () => {
        const ink = textLayout(text());
        const at = (o: Partial<TextElement>) => {
            const t = textLayout(text({ width: 100, height: 60, ...o }));
            return [t.dx, t.dy];
        };
        expect(at({})).toEqual([0, 0]);                                   // top-left default
        expect(at({ align: 'center', valign: 'middle' }))
            .toEqual([(100 - ink.inkW) / 2, (60 - ink.inkH) / 2]);
        expect(at({ align: 'right', valign: 'bottom' }))
            .toEqual([100 - ink.inkW, 60 - ink.inkH]);
    });

    it('makes measureElement report the frame, so everything else agrees', () => {
        // Selection outline, constraints and the overflow check all read
        // measureElement — a frame that did not show up here is exactly the
        // box-vs-ink mismatch that can push rotated text off the canvas.
        const b = measureElement(text({ width: 100, height: 60 }));
        expect([b.width, b.height]).toEqual([100, 60]);
    });

    it('keeps the knockout padding when a side is auto', () => {
        const plain = textLayout(text());
        const inv = textLayout(text({ invert: true, invertPad: 5 }));
        expect(inv.boxW).toBe(plain.inkW + 10);
        expect(inv.boxH).toBe(plain.inkH + 10);
        expect([inv.dx, inv.dy]).toEqual([5, 5]);
    });

    it('lets an explicit frame win over the knockout padding', () => {
        const t = textLayout(text({ invert: true, invertPad: 5, width: 120, height: 40 }));
        expect([t.boxW, t.boxH]).toEqual([120, 40]);
    });

    it('wraps within the frame width', () => {
        const one = textLayout(text({ text: 'aaa bbb ccc ddd' }));
        const wrapped = textLayout(text({ text: 'aaa bbb ccc ddd', wrap: true, width: 40 }));
        expect(wrapped.lines.length).toBeGreaterThan(one.lines.length);
        expect(wrapped.boxW).toBe(40);
        // The block grows downwards; the frame height is still auto here.
        expect(wrapped.boxH).toBe(wrapped.inkH);
    });

    it('never returns a zero-sized frame', () => {
        const t = textLayout(text({ width: 0, height: -5 }));
        expect(t.boxW).toBeGreaterThanOrEqual(1);
        expect(t.boxH).toBeGreaterThanOrEqual(1);
    });
});
