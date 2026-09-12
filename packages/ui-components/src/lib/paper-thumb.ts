/**
 * A design rendered *as the loaded paper*, not as a bare rectangle.
 *
 * The rasterizer's job ends at "which dots are marked" — it has no opinion about
 * the shape of the thing being marked, and it should not: the printer marks a
 * rectangle regardless. But a preview that shows a square block when the roll in
 * the machine is a round-cornered die-cut is telling you something false about
 * what you will hold, which is exactly what a preview is for.
 *
 * So the paper is applied here, on top of a finished raster: substrate colour
 * underneath, and the die outline cut out of the result.
 */
import {
    rasterizeDesign, compositePage, dieWithHoles, diePlacement, hasShapedDie,
    type LabelDesign
} from 'universal-label-renderer';
import type { PaperProfile } from 'universal-label-core';

/** Substrate colour: the chosen colourway, else a sensible tone per media type. */
export function substrateOf(paper: PaperProfile | undefined): string {
    if (!paper) return '#ffffff';
    const declared = paper.appearance?.baseColor ?? paper.appearance?.colorways?.[0]?.color;
    if (declared) return declared;
    if (paper.type === 'black') return '#26272b';
    if (paper.type === 'heat-shrink') return '#e8e6e1';
    if (paper.type === 'pvc') return '#f2f4f6';
    return '#ffffff';
}

/**
 * The die as a Path2D in canvas pixels.
 *
 * Built from the shared {@link dieWithHoles}, in label-space millimetres, then
 * scaled onto the canvas and rotated if the stock is mounted sideways. Sharing
 * the geometry with the on-screen roll drawing is the point — a mask that cut
 * corners differently from the preview would look right and print wrong.
 */
function diePath2D(paper: PaperProfile, design: LabelDesign): { path: Path2D; fillRule: CanvasFillRule } | null {
    if (!hasShapedDie(paper)) return null;
    const { d, fillRule } = dieWithHoles(paper);
    // The canvas is the *roll's* orientation; the die is drawn upright in
    // label space. diePlacement maps label-space mm to canvas pixels, and
    // accounts for a die-cut sticker narrower than its carrier being centred
    // on the web — without it a 12.5 mm die on 15 mm tape stretches to fill the
    // canvas and sits at the edge rather than inset and to scale.
    const m = diePlacement(paper, design.widthPx, design.heightPx);
    if (!m) return null;
    const matrix = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
    const path = new Path2D();
    path.addPath(new Path2D(d), matrix);
    return { path, fillRule };
}

/**
 * Cut a composited canvas down to the paper's die, in place.
 *
 * Where {@link paintDesignOnPaper} also rasters and colours the substrate, this
 * is just the mask step — for screens that already have a rasterized page (the
 * design-detail preview, the size gallery) and only need the rectangle trimmed
 * to the sticker's actual outline so a die-cut does not read as a bare block.
 * Uses the same {@link diePlacement} as the editor and the print thumbnail, so
 * the cut cannot disagree with either.
 */
export function applyDieMask(canvas: HTMLCanvasElement, design: LabelDesign, paper?: PaperProfile): void {
    if (!paper) return;
    const die = diePath2D(paper, design);
    if (!die) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fill(die.path, die.fillRule);
    ctx.globalCompositeOperation = 'source-over';
}

/**
 * Render a design to a data URL, shaped and coloured by the paper it prints on.
 *
 * Transparent outside the die line, so a rounded label sits on the card
 * background rather than inside a white square pretending to be one.
 */
export async function paintDesignOnPaper(
    canvas: HTMLCanvasElement,
    design: LabelDesign,
    paper?: PaperProfile
): Promise<void> {
    // The design carries the paper through to the raster so ink slots resolve
    // against the roll's own colorants rather than defaulting to black.
    const withPaper: LabelDesign = paper ? { ...design, paper } : design;
    const page = await rasterizeDesign(withPaper);
    const image = compositePage(page, {
        inks: withPaper.paper?.inks,
        background: substrateOf(paper)
    });

    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);

    const die = paper ? diePath2D(paper, withPaper) : null;
    if (die) {
        // destination-in keeps only what falls inside the die, which is what
        // makes the shape genuinely cut rather than painted over in white —
        // white corners would be wrong on any coloured card behind them.
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fill(die.path, die.fillRule);
        ctx.globalCompositeOperation = 'source-over';
    }
}

export async function paperThumb(design: LabelDesign, paper?: PaperProfile): Promise<string> {
    const canvas = document.createElement('canvas');
    await paintDesignOnPaper(canvas, design, paper);
    return canvas.toDataURL();
}
