import { describe, it, expect } from 'vitest';
import { buildTemplate, templateToEditable, defaultAuthoringFor, type TemplateMeta, type ElementAuthoring } from './authoring';
import { resolveTemplate } from './template';
import { createDesign, addElement, createElement, snapRotation, rotationStepFor, type LabelDesign, type AnyElement } from '../model/design';

function designWith(...els: AnyElement[]): LabelDesign {
    let d = createDesign(96, 320, 'Test');
    // 96px / 12mm tape ⇒ 8 px/mm.
    d = { ...d, paper: { id: 'p', name: 'p', type: 'continuous', tapeWidthMm: 12 } };
    for (const e of els) d = addElement(d, e);
    return d;
}

function textEl(patch: Partial<Extract<AnyElement, { type: 'text' }>>): AnyElement {
    const base = createElement('text', createDesign(96, 320)) as Extract<AnyElement, { type: 'text' }>;
    return { ...base, ...patch };
}

function metaFor(design: LabelDesign, authoring: Record<string, ElementAuthoring>): TemplateMeta {
    return {
        id: 'tpl1', name: 'Test', params: [],
        adaptivity: { designedFor: { tapeWidthMm: 12, labelLengthMm: 40 } },
        authoring
    };
}

describe('buildTemplate materialisation', () => {
    it('expresses an mm offset and a % size from live pixels', () => {
        const el = textEl({ id: 'a', x: 8, y: 16, size: 48, text: 'Hi' });
        const design = designWith(el);
        const a: ElementAuthoring = { anchor: 'tl', origin: 'tl', dx: { unit: 'mm' }, dy: { unit: 'mm' }, size: { unit: '%', of: 'h' } };
        const tpl = buildTemplate(design, metaFor(design, { a }));
        const place = tpl.elements[0].place;
        expect(place.dx).toEqual({ u: 'mm', v: 1 });     // 8px / 8px-per-mm = 1mm
        expect(place.dy).toEqual({ u: 'mm', v: 2 });     // 16px / 8 = 2mm
        expect(place.size).toEqual({ u: '%', v: 50, of: 'h' }); // 48/96 = 50%
    });

    it('renders identically at the designed size (px round-trips)', () => {
        const el = textEl({ id: 'a', x: 24, y: 8, size: 32, text: 'Hi' });
        const design = designWith(el);
        const a: ElementAuthoring = { anchor: 'tl', origin: 'tl', dx: { unit: 'mm' }, dy: { unit: 'px' }, size: { unit: '%', of: 'h' } };
        const tpl = buildTemplate(design, metaFor(design, { a }));
        const out = resolveTemplate(tpl, { widthPx: 320, heightPx: 96, tapeWidthMm: 12 }).design.elements[0];
        expect(out.x).toBe(24);
        expect(out.y).toBe(8);
    });

    it('materialises an expression dim', () => {
        const el = textEl({ id: 'a', x: 10, y: 10, size: 20, text: 'Hi' });
        const design = designWith(el);
        const a: ElementAuthoring = { anchor: 'tl', origin: 'tl', dx: { unit: 'expr', expr: 'W - 20' }, dy: { unit: 'px' }, size: { unit: 'px' } };
        const tpl = buildTemplate(design, metaFor(design, { a }));
        expect(tpl.elements[0].place.dx).toHaveProperty('e');
        const out = resolveTemplate(tpl, { widthPx: 320, heightPx: 96, tapeWidthMm: 12 }).design.elements[0];
        expect(out.x).toBe(300); // W - 20
    });

    it('binds a content field to a parameter', () => {
        const el = textEl({ id: 'a', x: 8, y: 8, size: 20, text: 'placeholder' });
        const design = designWith(el);
        const meta = metaFor(design, { a: { anchor: 'tl', origin: 'tl', dx: { unit: 'px' }, dy: { unit: 'px' }, size: { unit: 'px' }, bind: 'title' } });
        meta.params = [{ name: 'title', label: 'Title', type: 'text', default: 'Hello' }];
        const tpl = buildTemplate(design, meta);
        const out = resolveTemplate(tpl, { widthPx: 320, heightPx: 96, tapeWidthMm: 12, params: { title: 'WORLD' } }).design.elements[0];
        expect(out.type).toBe('text');
        if (out.type === 'text') expect(out.text).toBe('WORLD');
    });

    it('snaps rotation by content type and carries it through the template', () => {
        const vector = textEl({ id: 'v', x: 8, y: 8, size: 20, text: 'Hi', font: 'vector' });
        const bitmap = textEl({ id: 'b', x: 8, y: 40, size: 20, text: 'Hi', font: 'bitmap' });
        expect(rotationStepFor(vector)).toBe(1);
        expect(rotationStepFor(bitmap)).toBe(90);
        expect(snapRotation(vector, 37)).toBe(37);   // free
        expect(snapRotation(bitmap, 37)).toBe(0);    // snaps to nearest 90
        expect(snapRotation(bitmap, 80)).toBe(90);
        expect(snapRotation(bitmap, -90)).toBe(270); // normalised

        const design = designWith({ ...bitmap, rotation: 90 });
        const tpl = buildTemplate(design, metaFor(design, {}));
        expect(tpl.elements[0].rotation).toBe(90);
        const out = resolveTemplate(tpl, { widthPx: 320, heightPx: 96, tapeWidthMm: 12 }).design.elements[0];
        expect(out.rotation).toBe(90);
    });

    it('carries the locked flag into the template and back through resolve', () => {
        const el = textEl({ id: 'a', x: 8, y: 8, size: 20, text: 'Hi', locked: true });
        const design = designWith(el);
        const tpl = buildTemplate(design, metaFor(design, {}));
        expect(tpl.elements[0].locked).toBe(true);
        const out = resolveTemplate(tpl, { widthPx: 320, heightPx: 96, tapeWidthMm: 12 }).design.elements[0];
        expect(out.locked).toBe(true);
    });

    it('carries per-axis locks independently', () => {
        const el = textEl({ id: 'a', x: 8, y: 8, size: 20, text: 'Hi', lockY: true });
        const tpl = buildTemplate(designWith(el), metaFor(designWith(el), {}));
        expect(tpl.elements[0].lockY).toBe(true);
        expect(tpl.elements[0].lockX).toBeUndefined();
        const out = resolveTemplate(tpl, { widthPx: 320, heightPx: 96, tapeWidthMm: 12 }).design.elements[0];
        expect(out.lockY).toBe(true);
        expect(out.lockX).toBeUndefined();
    });
});

describe('templateToEditable round-trip', () => {
    it('recovers the authoring intent from a built template', () => {
        const el = textEl({ id: 'a', x: 8, y: 16, size: 48, text: 'Hi' });
        const design = designWith(el);
        const a: ElementAuthoring = { anchor: 'tr', origin: 'tr', dx: { unit: 'mm' }, dy: { unit: 'mm' }, size: { unit: '%', of: 'h' }, autofit: true };
        const tpl = buildTemplate(design, metaFor(design, { a }));
        const { meta } = templateToEditable(tpl);
        const back = meta.authoring['a'];
        expect(back.anchor).toBe('tr');
        expect(back.dx.unit).toBe('mm');
        expect(back.size?.unit).toBe('%');
        expect(back.size?.of).toBe('h');
        expect(back.autofit).toBe(true);
    });

    it('recovers a param binding', () => {
        const el = textEl({ id: 'a', x: 8, y: 8, size: 20, text: 'x' });
        const design = designWith(el);
        const meta = metaFor(design, { a: { anchor: 'tl', origin: 'tl', dx: { unit: 'px' }, dy: { unit: 'px' }, size: { unit: 'px' }, bind: 'title' } });
        meta.params = [{ name: 'title', label: 'Title', type: 'text', default: 'Hello' }];
        const tpl = buildTemplate(design, meta);
        const { meta: back } = templateToEditable(tpl);
        expect(back.authoring['a'].bind).toBe('title');
    });

    it('defaultAuthoringFor picks a right-edge anchor for a right-side element', () => {
        const el = textEl({ id: 'a', x: 280, y: 8, size: 16, text: 'R' });
        const a = defaultAuthoringFor(el, 320, 96);
        expect(a.anchor === 'r' || a.anchor === 'tr' || a.anchor === 'br').toBe(true);
        expect(a.autofit).toBe(true);
    });
});
