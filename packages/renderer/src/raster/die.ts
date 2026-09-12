/**
 * The die line, as geometry.
 *
 * One function turns a {@link PaperProfile} into a path, and both the preview
 * drawing and the print-time mask use it. That is the whole point: a preview
 * that rounded corners one way while the mask cut them another would be worse
 * than having neither, because it would look right and print wrong.
 *
 * Output is in **label space** millimetres — the sticker upright, origin at the
 * top-left of its bounding box. Rotating it onto the web is the caller's job
 * (see `PaperProfile.mountRotationDeg`), because only the caller knows whether
 * it is drawing a roll or a canvas.
 */
import type { PaperProfile } from 'universal-label-core';

/** The label's own extent, before it is placed on any web. */
export interface DieSize { widthMm: number; heightMm: number; }

/**
 * The size of one label in label space.
 *
 * For a mounted-sideways die the roll's tape width is the label's *length*, so
 * the two axes swap. Getting this wrong is how a 40 × 60 tree ends up drawn as
 * a 60 × 40 one.
 */
export function dieSize(paper: PaperProfile): DieSize {
    const across = paper.labelWidthMm ?? paper.tapeWidthMm;
    const along = paper.labelLengthMm ?? paper.tapeWidthMm;
    const rot = paper.mountRotationDeg ?? 0;
    return rot === 90 || rot === 270
        ? { widthMm: across, heightMm: along }
        : { widthMm: along, heightMm: across };
}

/**
 * Per-corner radii in millimetres, clockwise from the top-left.
 *
 * Falls back to the long-standing `borderRadiusMm`, so every profile written
 * before dies existed keeps the corners it always had.
 */
function cornerRadii(paper: PaperProfile, size: DieSize): [number, number, number, number] {
    const die = paper.die;
    let base: [number, number, number, number];
    if (die?.kind === 'rect' && die.radiiMm !== undefined) {
        base = typeof die.radiiMm === 'number'
            ? [die.radiiMm, die.radiiMm, die.radiiMm, die.radiiMm]
            : [...die.radiiMm];
    } else {
        const r = paper.type === 'continuous' ? 0 : (paper.borderRadiusMm ?? 0);
        base = [r, r, r, r];
    }
    // A radius larger than half the side would fold the outline through itself.
    const cap = Math.min(size.widthMm, size.heightMm) / 2;
    return base.map(v => Math.max(0, Math.min(v, cap))) as [number, number, number, number];
}

/**
 * The outline as SVG path data, in label-space millimetres.
 *
 * Always a real path, never `undefined` — a plain rectangle is a die too, and
 * callers that have to branch on "is there a shape" end up duplicating this
 * logic badly.
 */
export function diePath(paper: PaperProfile): string {
    const size = dieSize(paper);
    const { widthMm: w, heightMm: h } = size;
    const die = paper.die;

    if (die?.kind === 'path') return die.dMm;

    if (die?.kind === 'ellipse') {
        const rx = w / 2;
        const ry = h / 2;
        // Two arcs: the portable way to write a full ellipse as path data.
        return `M0 ${ry} A${rx} ${ry} 0 1 0 ${w} ${ry} A${rx} ${ry} 0 1 0 0 ${ry} Z`;
    }

    const [tl, tr, br, bl] = cornerRadii(paper, size);
    if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
        return `M0 0 H${w} V${h} H0 Z`;
    }
    return [
        `M${tl} 0`,
        `H${w - tr}`,
        tr ? `A${tr} ${tr} 0 0 1 ${w} ${tr}` : '',
        `V${h - br}`,
        br ? `A${br} ${br} 0 0 1 ${w - br} ${h}` : '',
        `H${bl}`,
        bl ? `A${bl} ${bl} 0 0 1 0 ${h - bl}` : '',
        `V${tl}`,
        tl ? `A${tl} ${tl} 0 0 1 ${tl} 0` : '',
        'Z'
    ].filter(Boolean).join(' ');
}

/**
 * The die plus its holes, as one path.
 *
 * Holes rely on the even-odd fill rule to punch through rather than on being
 * drawn in reverse — asking authors to wind their hole paths backwards is a
 * trap nobody escapes on the first try.
 */
export function dieWithHoles(paper: PaperProfile): { d: string; fillRule: 'nonzero' | 'evenodd' } {
    const outline = diePath(paper);
    const holes = paper.holesMm ?? [];
    if (holes.length === 0) {
        const rule = paper.die?.kind === 'path' ? (paper.die.fillRule ?? 'nonzero') : 'nonzero';
        return { d: outline, fillRule: rule };
    }
    return { d: [outline, ...holes].join(' '), fillRule: 'evenodd' };
}

/** True when the die is anything other than a plain, square-cornered rectangle. */
export function hasShapedDie(paper: PaperProfile): boolean {
    if (paper.die?.kind === 'path' || paper.die?.kind === 'ellipse') return true;
    if (paper.holesMm?.length) return true;
    return cornerRadii(paper, dieSize(paper)).some(r => r > 0);
}

/**
 * A die line placed onto the printable canvas, as the six affine matrix
 * components that map label-space millimetres to canvas pixels.
 *
 * The die is authored upright in label space (the sticker as you would hold
 * it), but the canvas is the *roll's* orientation, and the sticker can sit
 * narrower on its carrier than the tape is wide. Two facts the bare
 * `design.size / dieSize` scaling used to miss:
 *
 *  - the die's across-tape extent is `labelWidthMm`, not `tapeWidthMm`, so
 *    scaling it to the full canvas height stretches it; and
 *  - a die-cut sticker narrower than its liner is centred on the web, so it
 *    carries an inset of `(tapeWidthMm - labelWidthMm) / 2` across the tape.
 *
 * Both are applied here so a canvas mask, an SVG clip and a printed thumbnail
 * can share one transform and never disagree about where the sticker ends.
 *
 * Returns `a b c d e f` such that `x' = a*x + c*y + e`, `y' = b*x + d*y + f`,
 * with the input in label-space mm and the output in canvas pixels. `null`
 * when the die has no defined size to place.
 */
export function diePlacement(
    paper: PaperProfile,
    canvasWidthPx: number,
    canvasHeightPx: number
): { a: number; b: number; c: number; d: number; e: number; f: number } | null {
    const size = dieSize(paper);
    if (size.widthMm <= 0 || size.heightMm <= 0) return null;
    const rot = paper.mountRotationDeg ?? 0;
    const tape = paper.tapeWidthMm;
    const labelW = paper.labelWidthMm ?? tape;
    // The sticker is centred on the carrier, so half the carrier-vs-sticker
    // difference is blank margin on each side of the tape.
    const insetMm = Math.max(0, (tape - labelW) / 2);

    // Across the tape the die spans `labelW`; along the feed it spans the
    // label length. Which canvas axis is which depends on the mount rotation.
    // For an upright or inverted mount the feed runs along canvas-x; for a
    // sideways mount it runs down canvas-y, and the across-tape inset swaps
    // axes with it.
    const sideways = rot === 90 || rot === 270;
    const alongPx = sideways ? canvasHeightPx : canvasWidthPx;
    const acrossPx = sideways ? canvasWidthPx : canvasHeightPx;
    const alongScale = alongPx / size.widthMm;
    // The die's across-tape extent is `labelW`, rendered into the `acrossPx`
    // canvas axis that represents the full `tapeWidthMm`. Scale to the
    // sticker, not the tape, then shift by the inset so it stays centred.
    const acrossScale = (acrossPx * (labelW / tape)) / size.heightMm;
    const insetPx = insetMm * (acrossPx / tape);

    if (rot === 0) {
        return { a: alongScale, b: 0, c: 0, d: acrossScale, e: 0, f: insetPx };
    }
    if (rot === 180) {
        return { a: -alongScale, b: 0, c: 0, d: -acrossScale, e: canvasWidthPx, f: canvasHeightPx - insetPx };
    }
    if (rot === 90) {
        // Sideways: label x (length) -> canvas +y, label y (width) -> canvas +x.
        // x' = -acrossScale * y + e ; y' = alongScale * x + f
        return { a: 0, b: alongScale, c: -acrossScale, d: 0, e: insetPx, f: 0 };
    }
    // rot === 270
    return { a: 0, b: -alongScale, c: acrossScale, d: 0, e: canvasWidthPx - insetPx, f: canvasHeightPx };
}
