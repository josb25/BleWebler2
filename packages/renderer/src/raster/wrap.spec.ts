/**
 * Text wrapping. The critical guarantee is that measurement and rasterization
 * lay text out identically — both go through `textLines`, so a wrapped label
 * always prints exactly what the editor showed.
 */
import { describe, it, expect } from 'vitest';
import { wrapText, textLines, measureElement } from './measure';
import { createDesign, createElement, type TextElement } from '../model/design';

function text(patch: Partial<TextElement> = {}): TextElement {
    const base = createElement('text', createDesign(96, 320)) as TextElement;
    return { ...base, ...patch };
}

/** A fake proportional measurer: 10px per character. */
const perChar10 = (s: string) => s.length * 10;

describe('wrapText', () => {
    it('breaks on word boundaries within the limit', () => {
        expect(wrapText('aaa bbb ccc', 70, perChar10)).toEqual(['aaa bbb', 'ccc']);
    });

    it('keeps explicit newlines as hard breaks', () => {
        expect(wrapText('aa\nbb', 1000, perChar10)).toEqual(['aa', 'bb']);
        expect(wrapText('a\n\nb', 1000, perChar10)).toEqual(['a', '', 'b']);
    });

    it('hard-breaks a single word that cannot fit', () => {
        // 8 chars @10px in a 30px column -> chunks of 3.
        expect(wrapText('abcdefgh', 30, perChar10)).toEqual(['abc', 'def', 'gh']);
    });

    it('hard-breaks an overlong word after wrapping the line before it', () => {
        expect(wrapText('hi abcdefgh', 30, perChar10)).toEqual(['hi', 'abc', 'def', 'gh']);
    });

    it('returns the raw lines when no width is available', () => {
        expect(wrapText('a b c', 0, perChar10)).toEqual(['a b c']);
    });

    it('never emits a line wider than the limit (except unbreakable single chars)', () => {
        const lines = wrapText('the quick brown fox jumps over the lazy dog', 100, perChar10);
        for (const l of lines) expect(perChar10(l)).toBeLessThanOrEqual(100);
    });
});

describe('textLines on elements', () => {
    it('does not wrap unless wrap + width are set', () => {
        expect(textLines(text({ text: 'a b c d e f g h' }))).toEqual(['a b c d e f g h']);
        expect(textLines(text({ text: 'a b c', wrap: true }))).toEqual(['a b c']); // no width
    });

    it('wraps a bitmap element by its monospace cell width', () => {
        // fixed font at size 16 -> a known integer scale; just assert it split.
        const lines = textLines(text({ text: 'AAAA BBBB CCCC', size: 16, font: 'bitmap', wrap: true, width: 40 }));
        expect(lines.length).toBeGreaterThan(1);
        expect(lines.join(' ')).toBe('AAAA BBBB CCCC');
    });

    it('wraps a vector element using the supplied measurer', () => {
        const el = text({ text: 'aaa bbb ccc', font: 'vector', wrap: true, width: 70 });
        expect(textLines(el, (s: string) => s.length * 10)).toEqual(['aaa bbb', 'ccc']);
    });
});

describe('measureElement with wrapping', () => {
    it('grows in height and stays within the wrap width', () => {
        const plain = text({ text: 'AAAA BBBB CCCC', size: 16, font: 'bitmap' });
        const wrapped = text({ text: 'AAAA BBBB CCCC', size: 16, font: 'bitmap', wrap: true, width: 40 });
        const a = measureElement(plain);
        const b = measureElement(wrapped);
        expect(b.height).toBeGreaterThan(a.height);
        expect(b.width).toBeLessThan(a.width);
        expect(b.width).toBeLessThanOrEqual(40);
    });

    it('measures the same lines the renderer will draw', () => {
        const el = text({ text: 'aaa bbb ccc', font: 'vector', wrap: true, width: 70 });
        const measurer = (s: string) => s.length * 10;
        const lines = textLines(el, measurer);
        const bounds = measureElement(el, measurer);
        // Width == the widest laid-out line, i.e. both agree on the same layout.
        expect(bounds.width).toBe(Math.max(...lines.map(measurer)));
    });
});
