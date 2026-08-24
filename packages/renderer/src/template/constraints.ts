/**
 * A deliberately small 2D constraint system, in the spirit of FreeCAD's sketcher
 * but scoped to what labels actually need: **signed distances between anchor
 * points**, along one axis at a time.
 *
 * A constraint says "my point P is `distance` away from target point Q along
 * this axis", where each point is one of the nine anchors (corners, side
 * midpoints, centre) of either an element or the canvas. Per element and axis:
 *
 *   - **no constraint** → the element keeps its ordinary {@link Placement}
 *   - **one constraint** → its *position* on that axis is solved (size stays
 *     whatever its own size dim says)
 *   - **two constraints** (on different points, e.g. left edge and right edge)
 *     → both *position and span* are solved, so the element stretches to fit
 *   - **more** → over-constrained; the extras are reported and ignored
 *
 * Everything is linear, so "solving" is closed-form — no iteration, no failure
 * modes beyond the degenerate cases called out above.
 */

import { anchorFx, anchorFy, type Anchor, type Dim } from './dim';

export type ConstraintAxis = 'x' | 'y';

export interface ConstraintRef {
    /** Element id, or omitted/undefined to mean the canvas itself. */
    element?: string;
    /** Which of the nine anchor points on that box. */
    point: Anchor;
}

export interface Constraint {
    id: string;
    axis: ConstraintAxis;
    /** The element being positioned, and which of its points is measured. */
    from: { element: string; point: Anchor };
    /** What it is measured against (another element, or the canvas). */
    to: ConstraintRef;
    /** Signed gap along the axis: `from` point minus `to` point. */
    distance: Dim;
}

/** A resolved box in canvas px — the input the solver works from. */
export interface SolveBox { x: number; y: number; w: number; h: number; }

export interface SolveIssue {
    constraintId: string;
    code: 'over-constrained' | 'degenerate' | 'missing-reference';
    message: string;
}

export interface AxisSolution {
    /** Solved position along the axis (undefined = leave as-is). */
    pos?: number;
    /** Solved span along the axis (only when two constraints pin both sides). */
    span?: number;
}

/** The anchor fraction along one axis (0 = start, 0.5 = middle, 1 = end). */
export function axisFraction(point: Anchor, axis: ConstraintAxis): number {
    return axis === 'x' ? anchorFx(point) : anchorFy(point);
}

/**
 * Solve one axis for one element.
 *
 * @param constraints  Constraints on this element/axis, already ordered.
 * @param span         The element's current span on this axis (its natural size).
 * @param targetOf     Resolves a constraint's target coordinate in canvas px.
 */
export function solveAxis(
    constraints: Constraint[],
    span: number,
    targetOf: (c: Constraint) => number | undefined,
    issues: SolveIssue[] = []
): AxisSolution {
    if (constraints.length === 0) return {};

    // Pair each usable constraint with its target coordinate and own fraction.
    const usable: Array<{ c: Constraint; T: number; f: number }> = [];
    for (const c of constraints) {
        const T = targetOf(c);
        if (T === undefined) {
            issues.push({ constraintId: c.id, code: 'missing-reference', message: 'Constraint target no longer exists' });
            continue;
        }
        usable.push({ c, T, f: axisFraction(c.from.point, c.axis) });
    }
    if (usable.length === 0) return {};

    // One constraint: it fixes the position; the element keeps its own size.
    if (usable.length === 1) {
        const { T, f } = usable[0];
        return { pos: T - span * f };
    }

    // Two (or more): the first independent pair fixes position *and* span.
    const [a] = usable;
    const b = usable.slice(1).find(u => Math.abs(u.f - a.f) > 1e-6);
    if (!b) {
        // Same point constrained twice — the second says nothing new (or fights).
        for (const u of usable.slice(1)) {
            issues.push({ constraintId: u.c.id, code: 'degenerate', message: 'Duplicate constraint on the same point' });
        }
        return { pos: a.T - span * a.f };
    }
    for (const u of usable) {
        if (u !== a && u !== b) {
            issues.push({ constraintId: u.c.id, code: 'over-constrained', message: 'Axis already fully constrained; ignored' });
        }
    }
    const solvedSpan = (a.T - b.T) / (a.f - b.f);
    return { span: Math.max(0, solvedSpan), pos: a.T - solvedSpan * a.f };
}

/** Group an element's constraints by axis, preserving order. */
export function constraintsFor(all: Constraint[] | undefined, elementId: string): { x: Constraint[]; y: Constraint[] } {
    const x: Constraint[] = [];
    const y: Constraint[] = [];
    for (const c of all ?? []) {
        if (c.from.element !== elementId) continue;
        (c.axis === 'x' ? x : y).push(c);
    }
    return { x, y };
}

/** Element ids a given element depends on through its constraints. */
export function constraintDeps(all: Constraint[] | undefined, elementId: string): string[] {
    const out = new Set<string>();
    for (const c of all ?? []) {
        if (c.from.element === elementId && c.to.element) out.add(c.to.element);
    }
    return [...out];
}

const ANCHOR_SET = new Set<Anchor>(['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']);

/** Validate untrusted constraints. Empty = safe. */
export function validateConstraint(raw: unknown, validateDim: (d: unknown) => string[]): string[] {
    if (!raw || typeof raw !== 'object') return ['Malformed constraint'];
    const c = raw as Record<string, unknown>;
    const errors: string[] = [];
    if (typeof c.id !== 'string' || c.id.length > 200) errors.push('Bad constraint id');
    if (c.axis !== 'x' && c.axis !== 'y') errors.push('Bad constraint axis');
    const from = c.from as Record<string, unknown> | undefined;
    if (!from || typeof from.element !== 'string' || !ANCHOR_SET.has(from.point as Anchor)) errors.push('Bad constraint source');
    const to = c.to as Record<string, unknown> | undefined;
    if (!to || !ANCHOR_SET.has(to.point as Anchor)) errors.push('Bad constraint target');
    else if (to.element !== undefined && typeof to.element !== 'string') errors.push('Bad constraint target element');
    errors.push(...validateDim(c.distance));
    return errors;
}
