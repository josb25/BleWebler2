/**
 * Auto-length for continuous (gapless) media: the canvas feeds exactly as much
 * tape as the content needs. Covers the content-extent measurement that the
 * editor's two-pass sizing is built on.
 */
import { describe, it, expect } from 'vitest';
import { contentExtentPx, resolveTemplate, createTemplate, type LabelTemplate, type TemplateElement } from './template';

const H = 96;

function textEl(id: string, dxPx: number, sizePx = 16, content = 'HELLO'): TemplateElement {
    return {
        type: 'text', id,
        place: { anchor: 'tl', origin: 'tl', dx: { u: 'px', v: dxPx }, dy: 0, size: { u: 'px', v: sizePx } },
        text: content,
        font: 'bitmap', bitmapFont: 'fixed', fontFamily: 'sans-serif',
        bold: false, italic: false, underline: false, align: 'left'
    };
}

function tplWith(...els: TemplateElement[]): LabelTemplate {
    const t = createTemplate('auto', 12, 40);
    t.elements = els;
    return t;
}

function resolveAt(tpl: LabelTemplate, widthPx: number) {
    return resolveTemplate(tpl, { widthPx, heightPx: H, tapeWidthMm: 12, labelLengthMm: widthPx / 8 }).design;
}

describe('contentExtentPx', () => {
    it('is the right edge of the right-most element', () => {
        const design = resolveAt(tplWith(textEl('a', 10), textEl('b', 100)), 640);
        const b = design.elements.find(e => e.id === 'b')!;
        // extent = b.x + its measured width
        expect(contentExtentPx(design)).toBeGreaterThan(b.x);
        expect(contentExtentPx(design)).toBeLessThan(640);
    });

    it('is 0 for an empty label', () => {
        expect(contentExtentPx(resolveAt(tplWith(), 320))).toBe(0);
    });

    it('accounts for a rotated element via its rotated bounding box', () => {
        const flat = tplWith(textEl('a', 10, 16, 'LONGISH TEXT'));
        const turned = tplWith({ ...textEl('a', 10, 16, 'LONGISH TEXT'), rotation: 90 });
        // Rotating a wide, short element by 90° narrows its horizontal extent.
        expect(contentExtentPx(resolveAt(turned, 640))).toBeLessThan(contentExtentPx(resolveAt(flat, 640)));
    });
});

describe('relativeTo: printable vs whole media', () => {
    /** A 40px-wide box centred horizontally. */
    function centred(): LabelTemplate {
        const t = createTemplate('rel', 12, 40);
        t.elements = [{
            type: 'image', id: 'box',
            place: { anchor: 'c', origin: 'c', dx: 0, dy: 0, w: { u: 'px', v: 40 }, h: { u: 'px', v: 40 } },
            src: '', mode: 'threshold', threshold: 128, invert: false
        }];
        return t;
    }
    const resolveWith = (t: LabelTemplate, insets: { x: number; y: number }) =>
        resolveTemplate(t, { widthPx: 320, heightPx: H, tapeWidthMm: 12, labelLengthMm: 40, mediaInsets: insets }).design;

    it('centres in the printable area by default', () => {
        const el = resolveWith(centred(), { x: 60, y: 10 }).elements[0];
        expect(el.x).toBe((320 - 40) / 2); // insets ignored
        expect(el.y).toBe((H - 40) / 2);
    });

    it('centres on the whole label when relativeTo is media', () => {
        const t = centred();
        t.adaptivity.relativeTo = 'media';
        const el = resolveWith(t, { x: 60, y: 10 }).elements[0];
        // Laid out in the (320+60) x (96+20) media box, then shifted back.
        expect(el.x).toBe((380 - 40) / 2 - 60);
        expect(el.y).toBe((116 - 40) / 2 - 10);
    });

    it('keeps the canvas the printable size either way', () => {
        const t = centred();
        t.adaptivity.relativeTo = 'media';
        const d = resolveWith(t, { x: 60, y: 10 });
        expect(d.widthPx).toBe(320);
        expect(d.heightPx).toBe(H);
    });

    it('is a no-op when there are no unprintable margins', () => {
        const t = centred();
        t.adaptivity.relativeTo = 'media';
        expect(resolveWith(t, { x: 0, y: 0 }).elements[0].x).toBe(resolveWith(centred(), { x: 0, y: 0 }).elements[0].x);
    });
});

describe('auto-length sizing (two-pass, as the editor does it)', () => {
    /** Mirrors EditorStore.design: resolve, measure, resolve again at the needed width. */
    function autoLength(tpl: LabelTemplate, startWidth: number, padPx: number): number {
        let design = resolveAt(tpl, startWidth);
        const needed = Math.max(8, Math.round(contentExtentPx(design) + padPx));
        if (needed !== startWidth) design = resolveAt(tpl, needed);
        return design.widthPx;
    }

    it('shrinks the canvas to fit short content', () => {
        const w = autoLength(tplWith(textEl('a', 8, 16, 'HI')), 640, 16);
        expect(w).toBeLessThan(200);
        expect(w).toBeGreaterThan(16);
    });

    it('grows the canvas for longer content', () => {
        const short = autoLength(tplWith(textEl('a', 8, 16, 'HI')), 320, 16);
        const long = autoLength(tplWith(textEl('a', 8, 16, 'A MUCH LONGER LABEL LINE')), 320, 16);
        expect(long).toBeGreaterThan(short);
    });

    it('is stable — re-running on the result does not drift', () => {
        const tpl = tplWith(textEl('a', 8, 16, 'STABLE TEXT'));
        const once = autoLength(tpl, 320, 16);
        const twice = autoLength(tpl, once, 16);
        expect(twice).toBe(once);
    });

    it('includes the trailing pad', () => {
        const tpl = tplWith(textEl('a', 8, 16, 'PAD'));
        expect(autoLength(tpl, 320, 40) - autoLength(tpl, 320, 0)).toBe(40);
    });
});
