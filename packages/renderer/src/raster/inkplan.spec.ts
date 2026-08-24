import { describe, expect, it } from 'vitest';
import type { Ink, InkPlane, PaperProfile, UniversalPage } from 'universal-label-core';
import { planInks, previewBinding } from './inkplan';
import { compositePage, contrastRatio } from './composite';
import { parseTemplate } from '../template/validate';
import { resolveTemplate, templateFromDesign } from '../template/template';
import type { AnyElement, LabelDesign } from '../model/design';

const black: Ink = { id: 'black', color: '#111111', primary: true, produced: { via: 'thermal' } };
const red: Ink = { id: 'red', color: '#d2262c', produced: { via: 'thermal', energyBand: 'high' } };

function paper(inks?: Ink[]): PaperProfile {
    return { id: 'roll-1', name: 'Roll', type: 'gap', tapeWidthMm: 12, inks };
}

function box(id: string, ink?: string): AnyElement {
    return { id, type: 'shape', shape: 'rect', x: 0, y: 0, width: 8, height: 8, stroke: 1, fill: true, ink };
}

function design(elements: AnyElement[], over: Partial<LabelDesign> = {}): LabelDesign {
    return {
        version: 1, id: 'd', name: 'd', widthPx: 32, heightPx: 16, threshold: 128,
        elements, paper: paper([black, red]), ...over
    };
}

describe('planInks', () => {
    it('puts everything on one primary plane when nothing asks for a slot', () => {
        const plan = planInks(design([box('a'), box('b')]), 1);
        expect(plan.planes).toHaveLength(1);
        expect(plan.planes[0].ink.id).toBe('black');
        expect(plan.planes[0].elements.map(e => e.id)).toEqual(['a', 'b']);
        expect(plan.compromises).toEqual([]);
    });

    it('still emits a primary plane when the design is empty', () => {
        // A page must have at least one plane, even with nothing on it.
        expect(planInks(design([]), 2).planes).toHaveLength(1);
    });

    it('separates a slot onto its own plane when there is budget for it', () => {
        const d = design([box('a'), box('b', 'accent')], {
            slots: [{ id: 'accent', intent: '#ee0000' }]
        });
        const plan = planInks(d, 2);
        expect(plan.planes.map(p => p.ink.id)).toEqual(['black', 'red']);
        expect(plan.planes[1].elements.map(e => e.id)).toEqual(['b']);
        expect(plan.compromises).toEqual([]);
    });

    it('merges a slot into the primary when the printer has no spare channel', () => {
        const d = design([box('a'), box('b', 'accent')], {
            slots: [{ id: 'accent', intent: '#ee0000' }]
        });
        const plan = planInks(d, 1);
        expect(plan.planes).toHaveLength(1);
        expect(plan.planes[0].elements.map(e => e.id)).toEqual(['a', 'b']);
        expect(plan.compromises).toEqual([
            { slotId: 'accent', slotName: 'accent', action: 'merge', reason: 'over-budget' }
        ]);
    });

    it('drops a slot the author marked as decorative rather than recolouring it', () => {
        const d = design([box('a'), box('b', 'accent')], {
            slots: [{ id: 'accent', intent: '#ee0000', onUnavailable: 'drop' }]
        });
        const plan = planInks(d, 1);
        expect(plan.planes[0].elements.map(e => e.id)).toEqual(['a']);
        expect(plan.compromises[0].action).toBe('drop');
    });

    it('reports paper that cannot develop the colour separately from a channel shortage', () => {
        const d = design([box('b', 'accent')], {
            paper: paper([black]),
            slots: [{ id: 'accent', intent: '#ee0000' }]
        });
        // Two channels available, but this roll only carries one colorant — the
        // fix is different paper, not a different printer.
        expect(planInks(d, 2).compromises[0].reason).toBe('no-colorant');
    });

    it('warns once per slot however many elements sit on it', () => {
        const d = design([box('a', 'accent'), box('b', 'accent'), box('c', 'accent')], {
            paper: paper([black]),
            slots: [{ id: 'accent' }]
        });
        expect(planInks(d, 1).compromises).toHaveLength(1);
    });

    it('honours an explicit binding for the roll in use', () => {
        const gold: Ink = { id: 'gold', color: '#ccaa22', produced: { via: 'ribbon' } };
        const d = design([box('b', 'accent')], {
            paper: paper([black, red, gold]),
            slots: [{ id: 'accent', intent: '#ee0000' }],
            inkBindings: [{ paperId: 'roll-1', map: { accent: 'gold' } }]
        });
        const plan = planInks(d, 2);
        expect(plan.planes[1].ink.id).toBe('gold');
    });

    it('ignores a binding recorded against different paper', () => {
        const d = design([box('b', 'accent')], {
            slots: [{ id: 'accent', intent: '#ee0000' }],
            inkBindings: [{ paperId: 'some-other-roll', map: { accent: 'black' } }]
        });
        expect(planInks(d, 2).planes[1].ink.id).toBe('red');
    });

    it('keeps an element whose slot the design never declared', () => {
        // Hand-edited file, or a template whose slot list was trimmed.
        const plan = planInks(design([box('a', 'ghost')]), 1);
        expect(plan.planes[0].elements.map(e => e.id)).toEqual(['a']);
        expect(plan.compromises[0].slotId).toBe('ghost');
    });

    it('treats a design with no declared inks as plain black', () => {
        const plan = planInks(design([box('a')], { paper: paper(undefined) }), 2);
        expect(plan.planes).toHaveLength(1);
        expect(plan.planes[0].ink.id).toBe('black');
    });
});

describe('previewBinding', () => {
    it('shows what an unbound slot would auto-match to', () => {
        expect(previewBinding({ id: 'accent', intent: '#ee0000' }, [black, red])?.id).toBe('red');
    });

    it('shows the user\'s own choice once they have made one', () => {
        const b = { paperId: 'roll-1', map: { accent: 'black' } };
        expect(previewBinding({ id: 'accent', intent: '#ee0000' }, [black, red], b)?.id).toBe('black');
    });
});

function spotPage(planes: InkPlane[], width = 2): UniversalPage {
    return { colorModel: 'spot', width, height: 1, planes };
}

/** One row of pixels: `true` is a developed dot. */
function row(ink: string, dots: boolean[]): InkPlane {
    const data = new Uint8ClampedArray(dots.length * 4);
    dots.forEach((on, i) => {
        const v = on ? 0 : 255;
        data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    });
    return { ink, data, width: dots.length, height: 1 };
}

describe('compositePage', () => {
    it('renders a single black plane as black on white', () => {
        const img = compositePage(spotPage([row('black', [true, false])]), { inks: [black] });
        expect([img.data[0], img.data[1], img.data[2]]).toEqual([17, 17, 17]);
        expect([img.data[4], img.data[5], img.data[6]]).toEqual([255, 255, 255]);
    });

    it('renders each plane in its own colorant', () => {
        const page = spotPage([row('black', [true, false]), row('red', [false, true])]);
        const img = compositePage(page, { inks: [black, red] });
        expect([img.data[0], img.data[1], img.data[2]]).toEqual([17, 17, 17]);
        expect([img.data[4], img.data[5], img.data[6]]).toEqual([210, 38, 44]);
    });

    it('multiplies ink into the substrate rather than covering it', () => {
        // Thermal marks develop within the stock, so paper colour still shows.
        const green = '#00ff00';
        const img = compositePage(spotPage([row('red', [true])]), { inks: [red], background: green });
        expect(img.data[0]).toBe(0);   // no red survives a green substrate
        expect(img.data[1]).toBe(38);
    });

    it('leaves undeveloped dots showing the substrate', () => {
        const img = compositePage(spotPage([row('black', [false])]), { inks: [black], background: '#2fa84f' });
        expect([img.data[0], img.data[1], img.data[2]]).toEqual([47, 168, 79]);
    });
});

describe('ink in the shared template format', () => {
    const base = {
        version: 1, kind: 'label-template', id: 't1', name: 'T',
        params: [], threshold: 128,
        adaptivity: { designedFor: { tapeWidthMm: 12, labelLengthMm: 40 } },
        elements: [{
            id: 'e1', type: 'shape', shape: 'rect',
            place: { anchor: 'tl', origin: 'tl', dx: { u: 'px', v: 0 }, dy: { u: 'px', v: 0 }, w: { u: 'px', v: 8 }, h: { u: 'px', v: 8 } },
            stroke: 1, fill: true, ink: 'accent'
        }]
    };

    it('keeps a well-formed slot and the element that uses it', () => {
        const res = parseTemplate({ ...base, slots: [{ id: 'accent', name: 'Accent', intent: '#d2262c' }] });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.template.slots).toEqual([{ id: 'accent', name: 'Accent', intent: '#d2262c' }]);
        expect(res.template.elements[0].ink).toBe('accent');
    });

    it('drops an unusable intent colour without rejecting the file', () => {
        const res = parseTemplate({ ...base, slots: [{ id: 'accent', intent: 'javascript:alert(1)' }] });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.template.slots?.[0].intent).toBeUndefined();
        expect(res.warnings.join(' ')).toMatch(/unusable colour/i);
    });

    it('drops a slot whose id is not an identifier', () => {
        const res = parseTemplate({ ...base, slots: [{ id: 'not an id' }] });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.template.slots).toBeUndefined();
    });

    it('keeps an element ink whose slot was dropped, so intent is not silently lost', () => {
        const res = parseTemplate({ ...base, slots: [{ id: 'not an id' }] });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        // The planner treats it as a bare slot and warns; rewriting it to
        // primary here would destroy the author's decision on the way in.
        expect(res.template.elements[0].ink).toBe('accent');
    });

    it('carries slots and element inks onto the resolved design', () => {
        const res = parseTemplate({ ...base, slots: [{ id: 'accent', intent: '#d2262c' }] });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const { design } = resolveTemplate(res.template, { widthPx: 320, heightPx: 96, tapeWidthMm: 12 });
        expect(design.slots?.[0].id).toBe('accent');
        expect(design.elements[0].ink).toBe('accent');
    });

    it('survives a design -> template round trip', () => {
        const d = design([box('a', 'accent')], { slots: [{ id: 'accent', intent: '#d2262c' }] });
        const tpl = templateFromDesign(d, { adaptive: false });
        expect(tpl.slots?.[0].id).toBe('accent');
        expect(tpl.elements[0].ink).toBe('accent');
    });
});

describe('contrastRatio', () => {
    it('scores black on white as the maximum', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    });

    it('flags dark ink on dark stock as unreadable', () => {
        // A deep green roll: a technically perfect print nobody can read.
        expect(contrastRatio('#111111', '#14532d')).toBeLessThan(4.5);
    });

    it('passes black on the mid-green of the preprinted tree stock', () => {
        // Worth pinning: that roll looks alarming but reads fine, and a warning
        // that cried wolf on it would be turned off everywhere.
        expect(contrastRatio('#111111', '#2fa84f')).toBeGreaterThan(4.5);
    });
});
