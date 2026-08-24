/**
 * Guards the unified model: the template is the single source of truth and a
 * plain label is just a template with all-`px` placements. Dragging must write
 * back to the placement *in its own unit* and resolve to exactly where it was
 * dropped.
 */
import { describe, it, expect } from 'vitest';
import { placeAtPx, authoringViewOf } from './authoring';
import { resolveTemplate, createTemplate, createTemplateElement, type LabelTemplate, type TemplateElement } from './template';
import { measureElement } from '../raster/measure';
import type { Placement } from './dim';

const W = 320, H = 96, PX_PER_MM = 8; // 96px / 12mm

function textEl(id: string, place: Placement, text = 'Hi'): TemplateElement {
    return {
        type: 'text', id, place, text,
        font: 'bitmap', bitmapFont: 'fixed', fontFamily: 'sans-serif',
        bold: false, italic: false, underline: false, align: 'left'
    };
}

function tplWith(...els: TemplateElement[]): LabelTemplate {
    const t = createTemplate('t', 12, 40);
    t.elements = els;
    return t;
}

function resolveAt(tpl: LabelTemplate, widthPx = W, heightPx = H) {
    return resolveTemplate(tpl, { widthPx, heightPx, tapeWidthMm: 12, labelLengthMm: 40 }).design;
}

/** The context placeAtPx needs, computed from a resolved element. */
function ctxFor(tpl: LabelTemplate, id: string) {
    const el = resolveAt(tpl).elements.find(e => e.id === id)!;
    const b = measureElement(el);
    return { W, H, pxPerMm: PX_PER_MM, bounds: { w: b.width, h: b.height } };
}

describe('unified model: a plain label is an all-px template', () => {
    it('px placements resolve to identity geometry', () => {
        const el = textEl('a', { anchor: 'tl', origin: 'tl', dx: { u: 'px', v: 37 }, dy: { u: 'px', v: 21 }, size: { u: 'px', v: 24 } });
        const out = resolveAt(tplWith(el)).elements[0];
        expect(out.x).toBe(37);
        expect(out.y).toBe(21);
        if (out.type === 'text') expect(out.size).toBe(24);
    });

    it('createTemplateElement produces px placements for every type', () => {
        for (const type of ['text', 'barcode', 'qr', 'image'] as const) {
            const te = createTemplateElement(type, W, H);
            const view = authoringViewOf(te, []);
            expect(view.dx.unit).toBe('px');
            expect(view.dy.unit).toBe('px');
            expect(view.bind).toBeUndefined();
        }
    });
});

describe('unified model: dragging writes back to the placement', () => {
    it('a px element dropped at (120, 30) resolves back to exactly (120, 30)', () => {
        const el = textEl('a', { anchor: 'tl', origin: 'tl', dx: { u: 'px', v: 8 }, dy: { u: 'px', v: 8 }, size: { u: 'px', v: 24 } });
        let tpl = tplWith(el);
        const moved = { ...el, place: placeAtPx(el.place, { x: 120, y: 30 }, ctxFor(tpl, 'a')) };
        tpl = tplWith(moved);
        const out = resolveAt(tpl).elements[0];
        expect(out.x).toBe(120);
        expect(out.y).toBe(30);
        // Still expressed in px.
        expect(authoringViewOf(moved, []).dx.unit).toBe('px');
    });

    it('an mm element keeps mm units and lands where it was dropped', () => {
        const el = textEl('a', { anchor: 'tl', origin: 'tl', dx: { u: 'mm', v: 1 }, dy: { u: 'mm', v: 1 }, size: { u: 'px', v: 24 } });
        let tpl = tplWith(el);
        const moved = { ...el, place: placeAtPx(el.place, { x: 80, y: 16 }, ctxFor(tpl, 'a')) };
        expect(moved.place.dx).toEqual({ u: 'mm', v: 10 }); // 80px / 8 px-per-mm
        expect(moved.place.dy).toEqual({ u: 'mm', v: 2 });
        const out = resolveAt(tplWith(moved)).elements[0];
        expect(out.x).toBe(80);
        expect(out.y).toBe(16);
    });

    it('a %-sized element keeps % units when resized', () => {
        const el = textEl('a', { anchor: 'tl', origin: 'tl', dx: 0, dy: 0, size: { u: '%', v: 25, of: 'h' } });
        const tpl = tplWith(el);
        const moved = { ...el, place: placeAtPx(el.place, { size: 48 }, ctxFor(tpl, 'a')) };
        expect(moved.place.size).toEqual({ u: '%', v: 50, of: 'h' }); // 48 / 96
    });

    it('a right-anchored element stays right-anchored after a drag', () => {
        const el = textEl('a', { anchor: 'tr', origin: 'tr', dx: { u: 'mm', v: -1 }, dy: 0, size: { u: 'px', v: 16 } });
        const tpl = tplWith(el);
        const moved = { ...el, place: placeAtPx(el.place, { x: 200 }, ctxFor(tpl, 'a')) };
        expect(moved.place.anchor).toBe('tr');
        // Resolves at the drop point on the designed size...
        expect(resolveAt(tplWith(moved)).elements[0].x).toBe(200);
        // ...and still tracks the right edge on a longer label.
        const wide = resolveTemplate(tplWith(moved), { widthPx: 640, heightPx: H, tapeWidthMm: 12, labelLengthMm: 80 }).design.elements[0];
        expect(wide.x).toBe(200 + (640 - W));
    });

    it('an expression dim is authoritative and survives a drag', () => {
        const el = textEl('a', { anchor: 'tl', origin: 'tl', dx: { e: { t: 'binary', op: '-', left: { t: 'ident', name: 'W' }, right: { t: 'num', v: 40 } }, src: 'W - 40' }, dy: 0, size: { u: 'px', v: 16 } });
        const tpl = tplWith(el);
        const moved = { ...el, place: placeAtPx(el.place, { x: 10 }, ctxFor(tpl, 'a')) };
        // The expression wins — dragging doesn't silently overwrite the formula.
        expect(moved.place.dx).toEqual(el.place.dx);
        expect(resolveAt(tplWith(moved)).elements[0].x).toBe(W - 40);
    });
});

describe('unified model: relative structure survives editing', () => {
    it('a relTo element keeps tracking its reference after the reference moves', () => {
        const img: TemplateElement = {
            type: 'image', id: 'img', src: '',
            place: { anchor: 'tl', origin: 'tl', dx: { u: 'px', v: 20 }, dy: { u: 'px', v: 10 }, w: { u: 'px', v: 40 }, h: { u: 'px', v: 40 } },
            mode: 'threshold', threshold: 128, invert: false
        };
        const label = textEl('t', { relTo: 'img', anchor: 'r', origin: 'l', dx: { u: 'px', v: 6 }, dy: 0, size: { u: 'px', v: 16 } });
        let tpl = tplWith(img, label);
        expect(resolveAt(tpl).elements.find(e => e.id === 't')!.x).toBe(20 + 40 + 6);

        // Move the reference image; the label must follow it.
        const movedImg = { ...img, place: placeAtPx(img.place, { x: 100 }, ctxFor(tpl, 'img')) };
        tpl = tplWith(movedImg, label);
        expect(resolveAt(tpl).elements.find(e => e.id === 't')!.x).toBe(100 + 40 + 6);
    });
});
