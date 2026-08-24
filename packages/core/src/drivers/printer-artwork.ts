/**
 * Printer artwork, and what its moving parts can do.
 *
 * A driver owns the picture of its printer for the same reason it owns the
 * model's paper sizes and printhead width: it is a fact about the device, and
 * adding a printer should be one edit in one place. The artwork is compact,
 * self-contained vector data intended for identification in the UI.
 *
 * **This describes capability, not presentation.** Nothing here mentions
 * animation, timing, easing or theming. The driver states that a cutter exists,
 * how long it is and how far it travels; the UI layer decides whether that
 * movement is animated, how fast, and what the icon should look like while it
 * happens. The two meet at {@link PrinterArtwork.hooks} — stable CSS custom
 * property names the SVG already carries — so a UI that knows how to drive a
 * cutter or an LED picks up a newly added printer without any changes.
 */

/** A single-colour SMD emitter shows exactly one of these, or nothing. */
export type LedColourName = 'red' | 'green' | 'blue';

export interface CutterPart {
    /** Class on the SVG group, so a UI can target it without knowing the shape. */
    hook: 'cutter';
    /** Physical length of the blade carrier. */
    lengthMm: number;
    /** Travel from rest, in millimetres. */
    travelUpMm: number;
    travelDownMm: number;
    /**
     * SVG user units per millimetre for this artwork, so a caller can convert
     * between the two without knowing how the icon was scaled.
     */
    unitsPerMm: number;
    /** Shell colours this part ships in — the same model comes both ways. */
    colourVariants: string[];
}

export interface LedPart {
    hook: 'led';
    /**
     * Single-colour SMD: it emits one wavelength. A UI must never blend these
     * or show two at once — that would depict a part the printer does not have.
     */
    kind: 'smd-single-colour';
    colours: Record<LedColourName, string>;
    /** How the part looks unpowered, which is also the artwork's default. */
    unlit: string;
}

export interface PrinterArtworkParts {
    cutter?: CutterPart;
    led?: LedPart;
}

/**
 * CSS custom properties the SVG reads. Published rather than assumed, so the
 * UI binds to a name the artwork guarantees instead of one it hopes for.
 */
export interface PrinterArtworkHooks {
    /** Outline stroke weight — purely a styling choice. */
    outline: string;
    bodyColour: string;
    /**
     * Surface relief — recesses and mouldings that read as the shell in its own
     * shadow. Defaults to a darkened {@link PrinterArtworkHooks.bodyColour}, so
     * a colourway carries the shading with it and nothing has to supply a
     * second colour per variant. Override only where the relief is genuinely a
     * different part rather than the same plastic.
     */
    bodyShade?: string;
    /**
     * Cutter hooks are absent on models without one. A UI should key off
     * {@link PrinterArtworkParts} to decide what to offer and reach for these
     * only when the corresponding part exists.
     */
    cutterColour?: string;
    /** Cutter position in millimetres, positive downward. */
    cutterPositionMm?: string;
    led?: string;
}

/**
 * A colour the printer is actually sold in.
 *
 * Body and cutter are separate because they are moulded separately and mix: the
 * P12 ships white with a red cutter, white with white, mint with mint and mint
 * with white. Listing the real combinations beats exposing two free colour
 * pickers, which would let a UI depict a product that does not exist.
 */
export interface PrinterColourway {
    id: string;
    label: string;
    body: string;
    /**
     * Absent on models with no separately moulded cutter — the P50 comes in
     * four body colours and nothing else changes with them.
     */
    cutter?: string;
}

/** One instant in a movement, as part positions rather than as CSS. */
export interface ArtworkKeyframe {
    /** Position through the movement, 0..1. */
    at: number;
    /** Cutter offset in millimetres, positive downward. */
    cutterMm?: number;
    /** LED state at this instant; `'off'` is the unlit colour. */
    led?: LedColourName | 'off';
}

/**
 * A named thing the printer does, described as motion.
 *
 * These live with the driver because they are **mechanical facts, not
 * decoration**: on this hardware a cut is the blade travelling its full 4 mm
 * down and returning, and no UI is in a position to know that. What a UI *does*
 * decide is whether to play it at all, how fast relative to the nominal
 * duration, and what to do under `prefers-reduced-motion`.
 *
 * Keyframes are part positions, deliberately not CSS. Converting them into
 * `@keyframes`, a transition, or a series of discrete states is the UI layer's
 * business — and the same data can drive a diagram or a test with no browser
 * involved.
 */
export interface ArtworkAnimation {
    id: string;
    /** Human label for a control that triggers it. */
    label: string;
    /** How long the real mechanism takes, in milliseconds. */
    durationMs: number;
    /** True when the movement returns to where it started. */
    returnsToRest: boolean;
    keyframes: ArtworkKeyframe[];
}

/**
 * What each LED colour *means* on this printer.
 *
 * Kept apart from {@link ArtworkAnimation} because the LED is not part of any
 * movement — it reports a condition the machine is in (searching, connected,
 * battery low), and those conditions have nothing to do with the cutter
 * travelling. Conflating the two produces an icon that flashes an unrelated
 * colour every time something moves.
 */
export type LedStates = Partial<Record<LedColourName, string>>;

export interface PrinterArtwork {
    /** Complete, self-contained SVG. Renders correctly with no stylesheet. */
    svg: string;
    /** `[width, height]` of the artwork's own coordinate space. */
    viewBox: readonly [number, number];
    parts: PrinterArtworkParts;
    hooks: PrinterArtworkHooks;
    /** Named movements, keyed by id — `cut`, `open`, … */
    animations: Record<string, ArtworkAnimation>;
    /** Meaning of each LED colour, where the model has an LED. */
    ledStates?: LedStates;
    /** The colours this model is sold in. First entry is the default. */
    colourways?: PrinterColourway[];
}

/**
 * Sample a movement at a point in time, in part positions.
 *
 * Linear between keyframes, because these describe where a mechanism *is*, not
 * how it should feel getting there — easing is a presentation choice and
 * belongs to whatever plays this back. Useful without a browser: stepping an
 * animation in a test, or rendering a filmstrip of a movement.
 */
export function sampleAnimation(
    animation: ArtworkAnimation,
    t: number
): { cutterMm: number; led: LedColourName | 'off' } {
    const frames = [...animation.keyframes].sort((a, b) => a.at - b.at);
    const clamped = Math.max(0, Math.min(1, t));
    let cutterMm = frames[0]?.cutterMm ?? 0;
    let led: LedColourName | 'off' = frames[0]?.led ?? 'off';

    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (f.cutterMm !== undefined && f.at <= clamped) cutterMm = f.cutterMm;
        // The LED switches at its keyframe rather than blending: a
        // single-colour emitter has no intermediate states to interpolate.
        if (f.led !== undefined && f.at <= clamped) led = f.led;

        const next = frames[i + 1];
        if (next && f.at <= clamped && clamped < next.at
            && f.cutterMm !== undefined && next.cutterMm !== undefined) {
            const span = next.at - f.at;
            const k = span > 0 ? (clamped - f.at) / span : 0;
            cutterMm = f.cutterMm + (next.cutterMm - f.cutterMm) * k;
        }
    }
    return { cutterMm, led };
}

/**
 * Clamp a requested cutter position to what the mechanism can actually do.
 *
 * The SVG clamps too, so the icon can never be driven off the body, but a
 * caller usually wants to know the real position — to disable a control at the
 * stop, or to show the true value rather than the one it asked for.
 */
export function clampCutterMm(cutter: CutterPart, mm: number): number {
    if (!Number.isFinite(mm)) return 0;
    return Math.max(-cutter.travelUpMm, Math.min(cutter.travelDownMm, mm));
}
