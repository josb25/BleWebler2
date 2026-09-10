import { describe, it, expect } from 'vitest';
import { compileText, resolveText, textBindingSource } from './expr';
import { resolveDim, resolvePlacement, type DimContext } from './dim';
import { parseExpr } from './safe-expr';
import { resolveTemplate, templateFromDesign, createTemplate, scaleTemplatePixelGeometry, type LabelTemplate } from './template';
import { createDesign, addElement, createElement, mmToPx, type LabelDesign } from '../model/design';

const ctx = (W: number, H: number, extra: Record<string, unknown> = {}): DimContext => ({
    W, H, pxPerMm: 8, scope: { W, H, mm: 8, px: 1, ...extra }
});

describe('text bindings', () => {
    it('compiles and resolves interpolations', () => {
        const b = compileText('Price: {price} EUR');
        expect(typeof b).toBe('object');
        expect(resolveText(b, { price: 9.5 })).toBe('Price: 9.5 EUR');
    });

    it('leaves plain strings untouched', () => {
        expect(compileText('Hello')).toBe('Hello');
        expect(resolveText('Hello', {})).toBe('Hello');
    });

    it('supports expressions in bindings', () => {
        expect(resolveText(compileText('{qty > 1 ? qty + " pcs" : "single"}'), { qty: 3 })).toBe('3 pcs');
    });

    it('round-trips to an editable source string', () => {
        const b = compileText('SKU {upper(sku)}');
        expect(textBindingSource(b)).toBe('SKU {upper(sku)}');
    });

    it('escapes literal braces', () => {
        const b = compileText('{{literal}} {x}');
        expect(resolveText(b, { x: 1 })).toBe('{literal} 1');
    });
});

describe('dimensions', () => {
    it('resolves absolute and relative units', () => {
        const c = ctx(400, 96);
        expect(resolveDim(50, c)).toBe(50);
        expect(resolveDim({ u: 'px', v: 20 }, c)).toBe(20);
        expect(resolveDim({ u: 'mm', v: 5 }, c)).toBe(40); // 5mm * 8px/mm
        expect(resolveDim({ u: '%', v: 50, of: 'w' }, c)).toBe(200);
        expect(resolveDim({ u: '%', v: 50, of: 'h' }, c)).toBe(48);
        expect(resolveDim({ u: '%', v: 100, of: 'min' }, c)).toBe(96);
    });

    it('resolves expression dims against the scope', () => {
        const c = ctx(400, 96);
        expect(resolveDim({ e: parseExpr('W - 4 * mm') }, c)).toBe(400 - 32);
        expect(resolveDim({ e: parseExpr('min(W, H) / 2') }, c)).toBe(48);
    });

    it('anchors keep an element attached to an edge as the canvas grows', () => {
        const content = { w: 40, h: 20 };
        // Pin the top-right corner 4px in from the right edge.
        const place = { anchor: 'tr' as const, origin: 'tr' as const, dx: -4, dy: 4 };
        const small = resolvePlacement(place, ctx(200, 96), content);
        const big = resolvePlacement(place, ctx(600, 96), content);
        expect(small.x + content.w).toBe(200 - 4);
        expect(big.x + content.w).toBe(600 - 4); // still 4px from the (new) right edge
        expect(small.y).toBe(4);
    });

    it('centres with anchor+origin c', () => {
        const box = resolvePlacement({ anchor: 'c', origin: 'c' }, ctx(200, 100), { w: 40, h: 20 });
        expect(box.x).toBe(80);
        expect(box.y).toBe(40);
    });

    it('applies min/max clamps to sizes', () => {
        const box = resolvePlacement({ anchor: 'tl', size: { u: '%', v: 100, of: 'h' }, min: { size: 10 }, max: { size: 30 } }, ctx(200, 8), { w: 8, h: 8 });
        expect(box.size).toBe(10); // 100% of 8px height = 8, clamped up to min 10
    });
});

describe('resolveTemplate', () => {
    function sampleTemplate(): LabelTemplate {
        const tpl = createTemplate('Price tag', 12, 40);
        tpl.params = [{ name: 'price', label: 'Price', type: 'number', default: 5 }];
        tpl.elements = [
            {
                type: 'text', id: 'title',
                place: { anchor: 'tl', origin: 'tl', dx: { u: 'mm', v: 1 }, dy: { u: 'mm', v: 1 }, size: { u: '%', v: 40, of: 'h' } },
                text: compileText('EUR {price}'),
                font: 'bitmap', bitmapFont: 'fixed', fontFamily: 'sans-serif',
                bold: false, italic: false, underline: false, align: 'left'
            }
        ];
        return tpl;
    }

    it('compiles to an absolute-pixel LabelDesign for a target size', () => {
        const tpl = sampleTemplate();
        const { design } = resolveTemplate(tpl, { widthPx: 320, heightPx: 96, tapeWidthMm: 12, params: { price: 12 } });
        expect(design.widthPx).toBe(320);
        expect(design.heightPx).toBe(96);
        expect(design.elements).toHaveLength(1);
        const el = design.elements[0];
        expect(el.type).toBe('text');
        if (el.type === 'text') {
            expect(el.text).toBe('EUR 12');
            expect(el.size).toBeGreaterThan(0);
            // 1mm inset at 96px/12mm = 8px/mm → x=8, y=8
            expect(el.x).toBe(8);
            expect(el.y).toBe(8);
        }
    });

    it('reflows to a higher-DPI printer at the same physical width (device-agnostic)', () => {
        const tpl = sampleTemplate();
        // Same 12mm tape, but the second printer has double the printhead density
        // (192px vs 96px for 12mm). The 1mm inset must resolve to 2x the pixels.
        const a = resolveTemplate(tpl, { widthPx: 320, heightPx: 96, tapeWidthMm: 12, params: { price: 12 } }).design.elements[0];
        const b = resolveTemplate(tpl, { widthPx: 640, heightPx: 192, tapeWidthMm: 12, params: { price: 12 } }).design.elements[0];
        expect(a.x).toBe(8);
        expect(b.x).toBe(16);
        if (a.type === 'text' && b.type === 'text') expect(b.size).toBeGreaterThan(a.size);
    });

    it('retargets literal pixel geometry while leaving physical and relative units alone', () => {
        const tpl = createTemplate('pixel label', 12, 40);
        tpl.elements = [{
            type: 'shape', id: 'box',
            place: {
                anchor: 'tl', dx: { u: 'px', v: 8 }, dy: { u: 'mm', v: 1 },
                w: 80, h: { u: '%', v: 50, of: 'h' }, min: { w: 8 }
            },
            shape: 'rect', stroke: 2, fill: false, radius: { u: 'px', v: 4 }
        }];
        tpl.constraints = [{
            id: 'gap', axis: 'x', from: { element: 'box', point: 'l' },
            to: { point: 'l' }, distance: { u: 'px', v: 8 }
        }];

        const scaled = scaleTemplatePixelGeometry(tpl, 1.5);
        const shape = scaled.elements[0];
        expect(shape.place.dx).toEqual({ u: 'px', v: 12 });
        expect(shape.place.dy).toEqual({ u: 'mm', v: 1 });
        expect(shape.place.w).toBe(120);
        expect(shape.place.h).toEqual({ u: '%', v: 50, of: 'h' });
        expect(shape.place.min?.w).toBe(12);
        expect(scaled.constraints?.[0].distance).toEqual({ u: 'px', v: 12 });
        if (shape.type === 'shape') {
            expect(shape.stroke).toBe(3);
            expect(shape.radius).toEqual({ u: 'px', v: 6 });
        }
    });

    it('anchors an element relative to another element (relTo)', () => {
        const tpl = createTemplate('rel', 12, 40);
        tpl.elements = [
            // An image has an exact resolved box (width=40), a clean reference.
            { type: 'image', id: 'img', place: { anchor: 'tl', dx: { u: 'px', v: 20 }, dy: { u: 'px', v: 10 }, w: { u: 'px', v: 40 }, h: { u: 'px', v: 40 } }, src: '', mode: 'threshold', threshold: 128, invert: false },
            // Text placed just right of the image: anchor on its right edge, my left edge, +6px gap.
            {
                type: 'text', id: 't', place: { relTo: 'img', anchor: 'r', origin: 'l', dx: { u: 'px', v: 6 }, dy: 0, size: { u: 'px', v: 16 } },
                text: 'X', font: 'bitmap', bitmapFont: 'fixed', fontFamily: 'sans-serif',
                bold: false, italic: false, underline: false, align: 'left'
            }
        ];
        const els = resolveTemplate(tpl, { widthPx: 320, heightPx: 96, tapeWidthMm: 12 }).design.elements;
        const img = els.find(e => e.id === 'img')!;
        const t = els.find(e => e.id === 't')!;
        expect(img.x).toBe(20);
        expect(t.x).toBe(20 + 40 + 6); // img.x + img.width + gap
        expect(els.map(e => e.id)).toEqual(['img', 't']); // original z-order preserved
    });

    it('is cycle-safe when two elements reference each other', () => {
        const tpl = createTemplate('cycle', 12, 40);
        const mk = (id: string, relTo: string) => ({
            type: 'text' as const, id, place: { relTo, anchor: 'r' as const, origin: 'l' as const, dx: { u: 'px' as const, v: 4 }, size: { u: 'px' as const, v: 12 } },
            text: id, font: 'bitmap' as const, bitmapFont: 'fixed', fontFamily: 'sans-serif',
            bold: false, italic: false, underline: false, align: 'left' as const
        });
        tpl.elements = [mk('a', 'b'), mk('b', 'a')];
        // Should not throw or hang; produces finite positions.
        const els = resolveTemplate(tpl, { widthPx: 320, heightPx: 96, tapeWidthMm: 12 }).design.elements;
        expect(els).toHaveLength(2);
        expect(Number.isFinite(els[0].x)).toBe(true);
        expect(Number.isFinite(els[1].x)).toBe(true);
    });

    it('flags overflow as an issue', () => {
        const tpl = createTemplate('overflow', 12, 40);
        tpl.elements = [{
            type: 'text', id: 'big',
            place: { anchor: 'tl', dx: { u: 'px', v: 10 }, dy: { u: 'px', v: 10 }, size: { u: 'px', v: 40 } },
            text: 'This is a very long line of text that will not fit',
            font: 'bitmap', bitmapFont: 'fixed', fontFamily: 'sans-serif',
            bold: false, italic: false, underline: false, align: 'left'
        }];
        const { issues } = resolveTemplate(tpl, { widthPx: 80, heightPx: 96, tapeWidthMm: 12 });
        expect(issues.some(i => i.code === 'overflow')).toBe(true);
    });

    it('adaptive templateFromDesign anchors a right-side element to the right edge', () => {
        let design: LabelDesign = createDesign(96, 400, 'Adaptive');
        const t = createElement('text', design);
        t.x = 360; t.y = 8; // near the right edge
        if (t.type === 'text') { t.text = 'R'; t.size = 16; }
        design = addElement(design, t);

        const tpl = templateFromDesign(design, { adaptive: true });
        expect(tpl.elements[0].place.anchor).toMatch(/r$|^r$/); // right-ish anchor

        // Resolve on a much longer label — the element should still sit near the
        // right edge (adaptive), not stay pinned at x=360.
        const wide = resolveTemplate(tpl, { widthPx: 800, heightPx: 96, tapeWidthMm: 12 }).design.elements[0];
        expect(wide.x).toBeGreaterThan(600);
    });

    it('templateFromDesign preserves absolute geometry on a 1:1 resolve', () => {
        let design: LabelDesign = createDesign(96, mmToPx(40), 'Roundtrip');
        const t = createElement('text', design);
        t.x = 12; t.y = 20;
        if (t.type === 'text') t.text = 'Hi';
        design = addElement(design, t);

        const tpl = templateFromDesign(design);
        const { design: out } = resolveTemplate(tpl, {
            widthPx: design.widthPx, heightPx: design.heightPx, tapeWidthMm: 12
        });
        const el = out.elements[0];
        expect(el.x).toBe(12);
        expect(el.y).toBe(20);
        if (el.type === 'text') expect(el.text).toBe('Hi');
    });
});

describe('resolveTemplate mm scale', () => {
    it('uses an explicit dpmm instead of estimating it from the tape width', () => {
        const tpl = createTemplate('t', 15, 30);
        tpl.elements = [{
            type: 'text', id: 't',
            place: { anchor: 'tl', origin: 'tl', dx: { u: 'mm', v: 10 }, dy: { u: 'mm', v: 0 }, size: { u: 'px', v: 16 } },
            text: compileText('x'),
            font: 'bitmap', bitmapFont: 'fixed', fontFamily: 'sans-serif',
            bold: false, italic: false, underline: false, align: 'left'
        }];
        // A 96-dot head on 15 mm labels: the canvas is 96 px but the tape is 15 mm.
        const estimated = resolveTemplate(tpl, { widthPx: 240, heightPx: 96, tapeWidthMm: 15 }).design;
        const explicit = resolveTemplate(tpl, { widthPx: 240, heightPx: 96, tapeWidthMm: 15, dpmm: 8 }).design;
        expect(Math.round(estimated.elements[0].x)).toBe(64);
        expect(Math.round(explicit.elements[0].x)).toBe(80);
    });
});
