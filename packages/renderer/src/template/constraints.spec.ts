/**
 * The simplified FreeCAD-style constraint solver: anchor-to-anchor distances
 * along one axis, solved for position (one constraint) or position + span (two).
 */
import { describe, it, expect } from 'vitest';
import { solveAxis, constraintsFor, constraintDeps, type Constraint } from './constraints';
import { resolveTemplate, createTemplate, type LabelTemplate, type TemplateElement } from './template';

const H = 96, W = 320;

function box(id: string, x: number, w: number): TemplateElement {
    return {
        type: 'image', id, src: '',
        place: { anchor: 'tl', origin: 'tl', dx: { u: 'px', v: x }, dy: { u: 'px', v: 10 }, w: { u: 'px', v: w }, h: { u: 'px', v: 20 } },
        mode: 'threshold', threshold: 128, invert: false
    };
}

function tpl(els: TemplateElement[], constraints?: Constraint[]): LabelTemplate {
    const t = createTemplate('c', 12, 40);
    t.elements = els;
    t.constraints = constraints;
    return t;
}

const resolve = (t: LabelTemplate) =>
    resolveTemplate(t, { widthPx: W, heightPx: H, tapeWidthMm: 12, labelLengthMm: 40 });

const px = (v: number) => ({ u: 'px' as const, v });

describe('solveAxis', () => {
    const target = (T: number) => () => T;

    it('leaves an unconstrained axis alone', () => {
        expect(solveAxis([], 50, target(0))).toEqual({});
    });

    it('one constraint fixes position, keeping the span', () => {
        // my left edge (f=0) at 40
        const c: Constraint = { id: '1', axis: 'x', from: { element: 'a', point: 'tl' }, to: { point: 'tl' }, distance: px(40) };
        expect(solveAxis([c], 50, target(40))).toEqual({ pos: 40 });
    });

    it('anchors by the measured point, not the origin', () => {
        // my *right* edge (f=1) at 100 with span 30 -> x = 70
        const c: Constraint = { id: '1', axis: 'x', from: { element: 'a', point: 'tr' }, to: { point: 'tr' }, distance: px(0) };
        expect(solveAxis([c], 30, target(100))).toEqual({ pos: 70 });
    });

    it('two constraints on opposite edges solve position AND span', () => {
        const left: Constraint = { id: 'l', axis: 'x', from: { element: 'a', point: 'tl' }, to: { point: 'tl' }, distance: px(20) };
        const right: Constraint = { id: 'r', axis: 'x', from: { element: 'a', point: 'tr' }, to: { point: 'tr' }, distance: px(-30) };
        // left edge -> 20, right edge -> 290  => span 270, pos 20
        const sol = solveAxis([left, right], 999, c => (c.id === 'l' ? 20 : 290));
        expect(sol).toEqual({ span: 270, pos: 20 });
    });

    it('flags a duplicate constraint on the same point as degenerate', () => {
        const a: Constraint = { id: 'a', axis: 'x', from: { element: 'e', point: 'tl' }, to: { point: 'tl' }, distance: px(10) };
        const b: Constraint = { ...a, id: 'b' };
        const issues: Parameters<typeof solveAxis>[3] = [];
        const sol = solveAxis([a, b], 40, target(10), issues);
        expect(sol.pos).toBe(10);
        expect(issues.map(i => i.code)).toEqual(['degenerate']);
    });

    it('flags a third constraint as over-constrained', () => {
        const mk = (id: string, point: 'tl' | 'tr' | 't'): Constraint =>
            ({ id, axis: 'x', from: { element: 'e', point }, to: { point: 'tl' }, distance: px(0) });
        const issues: Parameters<typeof solveAxis>[3] = [];
        solveAxis([mk('1', 'tl'), mk('2', 'tr'), mk('3', 't')], 10, target(0), issues);
        expect(issues.map(i => i.code)).toEqual(['over-constrained']);
    });

    it('reports a missing reference instead of throwing', () => {
        const c: Constraint = { id: '1', axis: 'x', from: { element: 'a', point: 'tl' }, to: { element: 'gone', point: 'tl' }, distance: px(0) };
        const issues: Parameters<typeof solveAxis>[3] = [];
        expect(solveAxis([c], 10, () => undefined, issues)).toEqual({});
        expect(issues[0].code).toBe('missing-reference');
    });
});

describe('grouping helpers', () => {
    const c = (id: string, from: string, axis: 'x' | 'y', to?: string): Constraint =>
        ({ id, axis, from: { element: from, point: 'tl' }, to: to ? { element: to, point: 'tl' } : { point: 'tl' }, distance: px(0) });

    it('groups by element and axis', () => {
        const all = [c('1', 'a', 'x'), c('2', 'a', 'y'), c('3', 'b', 'x')];
        const g = constraintsFor(all, 'a');
        expect(g.x.map(k => k.id)).toEqual(['1']);
        expect(g.y.map(k => k.id)).toEqual(['2']);
    });

    it('lists element dependencies, ignoring canvas targets', () => {
        expect(constraintDeps([c('1', 'a', 'x', 'b'), c('2', 'a', 'y')], 'a')).toEqual(['b']);
    });
});

describe('constraints through resolveTemplate', () => {
    it('positions an element against the canvas', () => {
        const t = tpl([box('a', 0, 40)], [
            { id: 'c1', axis: 'x', from: { element: 'a', point: 'tr' }, to: { point: 'tr' }, distance: { u: 'px', v: -8 } }
        ]);
        // right edge 8px in from the canvas right edge
        expect(resolve(t).design.elements[0].x).toBe(W - 8 - 40);
    });

    it('stretches an element between two canvas edges', () => {
        const t = tpl([box('a', 0, 40)], [
            { id: 'l', axis: 'x', from: { element: 'a', point: 'tl' }, to: { point: 'tl' }, distance: { u: 'px', v: 10 } },
            { id: 'r', axis: 'x', from: { element: 'a', point: 'tr' }, to: { point: 'tr' }, distance: { u: 'px', v: -10 } }
        ]);
        const el = resolve(t).design.elements[0];
        expect(el.x).toBe(10);
        expect(el.type === 'image' && el.width).toBe(W - 20);
    });

    it('positions relative to another element, resolved in dependency order', () => {
        // 'b' is declared first but depends on 'a' -> must still land correctly.
        const t = tpl([box('b', 0, 30), box('a', 100, 50)], [
            { id: 'c1', axis: 'x', from: { element: 'b', point: 'tl' }, to: { element: 'a', point: 'tr' }, distance: { u: 'px', v: 6 } }
        ]);
        const els = resolve(t).design.elements;
        const a = els.find(e => e.id === 'a')!;
        const b = els.find(e => e.id === 'b')!;
        expect(b.x).toBe(a.x + 50 + 6);
        expect(els.map(e => e.id)).toEqual(['b', 'a']); // z-order preserved
    });

    it('reflows when the canvas resizes', () => {
        const t = tpl([box('a', 0, 40)], [
            { id: 'r', axis: 'x', from: { element: 'a', point: 'tr' }, to: { point: 'tr' }, distance: { u: 'px', v: 0 } }
        ]);
        const narrow = resolveTemplate(t, { widthPx: 200, heightPx: H, tapeWidthMm: 12, labelLengthMm: 25 }).design.elements[0];
        const wide = resolveTemplate(t, { widthPx: 600, heightPx: H, tapeWidthMm: 12, labelLengthMm: 75 }).design.elements[0];
        expect(narrow.x).toBe(200 - 40);
        expect(wide.x).toBe(600 - 40);
    });

    it('survives a constraint cycle without hanging', () => {
        const t = tpl([box('a', 0, 30), box('b', 50, 30)], [
            { id: '1', axis: 'x', from: { element: 'a', point: 'tl' }, to: { element: 'b', point: 'tr' }, distance: px(4) },
            { id: '2', axis: 'x', from: { element: 'b', point: 'tl' }, to: { element: 'a', point: 'tr' }, distance: px(4) }
        ]);
        const els = resolve(t).design.elements;
        expect(els).toHaveLength(2);
        expect(Number.isFinite(els[0].x)).toBe(true);
        expect(Number.isFinite(els[1].x)).toBe(true);
    });

    it('works on the y axis too', () => {
        const t = tpl([box('a', 10, 30)], [
            { id: 'b', axis: 'y', from: { element: 'a', point: 'b' }, to: { point: 'b' }, distance: { u: 'px', v: -4 } }
        ]);
        const el = resolve(t).design.elements[0];
        expect(el.y).toBe(H - 4 - 20); // element height is 20
    });
});
