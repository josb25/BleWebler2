import type { Ink } from "./ink";

/**
 * The die line: the shape the label actually is.
 *
 * Kept separate from the *carrier* fields above it — `tapeWidthMm`, `gapMm`,
 * the feed pitch — because those are what the mechanism sees and this is not.
 * The print head marks a rectangle whatever shape the sticker is; the die only
 * governs layout, preview and masking. That split is what lets arbitrary
 * outlines exist without a single driver knowing about them.
 *
 * All coordinates are millimetres in **label space**: the sticker seen upright,
 * as you would hold it, origin at the top-left of its bounding box. How that
 * sits on the roll is {@link PaperProfile.mountRotationDeg}.
 */
export type MediaDie =
    /** Per-corner radii, clockwise from the top-left. One value rounds all four. */
    | { kind: "rect"; radiiMm?: [number, number, number, number] | number }
    | { kind: "ellipse" }
    /**
     * An arbitrary outline as SVG path data, in millimetres.
     *
     * Geometry only — the same sanitised path subset the symbol elements use,
     * so an imported die line can never carry a document, a script or a
     * reference to anything outside itself.
     */
    | { kind: "path"; dMm: string; fillRule?: "nonzero" | "evenodd" };

/** How the stock looks before anything is printed on it. */
export interface PaperAppearance {
    /**
     * The substrate colours this format is sold in.
     *
     * A format and a colour are different facts: "12 × 40 mm gap" comes in
     * white, yellow and blue, and duplicating the whole profile per colour
     * would mean three things to keep in step. The chosen one is
     * {@link PaperAppearance.baseColor}.
     */
    colorways?: { id: string; name: string; color: string }[];
    /** The substrate colour in use. Defaults to the first colourway, else white. */
    baseColor?: string;
    /**
     * Artwork printed at the factory — the Christmas tree, the border, the logo.
     *
     * Never printed by us: it is already on the paper. It is composited *under*
     * the ink in previews because that is where it physically sits, and it is
     * the reason {@link PaperProfile.keepClearMm} exists.
     */
    artwork?: { kind: "svg"; svg: string } | { kind: "image"; src: string };
    finish?: "matte" | "gloss" | "transparent" | "metallic";
}

/**
 * Represents the physical properties of a label spool or tape.
 * Properties are defined in millimeters (mm) so they remain agnostic of
 * the printer's specific DPI or pixel resolution.
 */
export interface PaperProfile {
    /** Unique identifier for the paper profile (e.g., '15mm-continuous') */
    id: string;
    /** Human-readable name for the UI (e.g., '15mm Continuous White') */
    name: string;
    /** The physical type of the media */
    type: "gap" | "continuous" | "transparent" | "black" | "perforated" | "pvc" | "black-mark" | "heat-shrink";

    /** 
     * The physical width of the tape in mm. 
     * This corresponds to the height of the software canvas (the dimension perpendicular to the feed direction).
     */
    tapeWidthMm: number; 

    // --- Gap/Segmented specific properties ---
    
    /** 
     * Length of one segmented label in mm along the feed direction.
     * Corresponds to the width of the software canvas.
     */
    labelLengthMm?: number;
    /**
     * Physical width of the actual label (the peel-off sticker) in mm.
     * This dimension is perpendicular to the feed direction.
     * If omitted, it is assumed to be equal to the tapeWidthMm (e.g. continuous tape or full-width gap labels).
     * Corresponds to the height of the software canvas.
     */
    labelWidthMm?: number;
    /** Physical space between labels on the backing paper in mm */
    gapMm?: number;
    /** Visual corner radius of the label in mm */
    borderRadiusMm?: number;

    /**
     * The channels this media is able to develop, primary first.
     *
     * Belongs to the paper rather than the printer because it is a property of
     * the stock: the same machine prints black on one roll and black+red on the
     * next. Omitted means plain black — see `DEFAULT_INK`.
     */
    inks?: Ink[];

    // --- die-cut shape and appearance ---

    /**
     * The shape of the label. Absent means a plain rectangle, optionally
     * softened by {@link borderRadiusMm} — which stays supported so every
     * existing profile keeps working untouched.
     */
    die?: MediaDie;
    /**
     * Punched holes and slots, as SVG path data in millimetres, subtracted from
     * the die. Hang-tag holes, cable-flag slots.
     */
    holesMm?: string[];
    /**
     * How the label sits on the web, in degrees clockwise.
     *
     * The die is authored upright, as you would hold the sticker; the roll may
     * carry it sideways. A 40 × 60 mm tree on 40 mm tape is mounted at 90°.
     * Without this, "upright" would have to mean "however it happens to lie on
     * the roll", and every die line would need redrawing per orientation.
     */
    mountRotationDeg?: 0 | 90 | 180 | 270;
    /**
     * Where content must not go, as SVG path data in millimetres.
     *
     * Distinct from the die: this area is inside the label and perfectly
     * printable, you just do not want to print there — over the preprinted
     * logo, across the fold.
     */
    keepClearMm?: string[];
    /** How the blank stock looks: colour, factory artwork, finish. */
    appearance?: PaperAppearance;
    /**
     * Density band this stock wants, when it differs from plain paper.
     *
     * Coloured, synthetic and heat-shrink media all have much narrower usable
     * windows than the default, and today the user simply guesses.
     */
    densityHint?: { min?: number; max?: number; default?: number };
}

export const DEFAULT_PAPER_PROFILES: PaperProfile[] = [
    {
        id: '15mm-continuous',
        name: '15mm Continuous',
        type: 'continuous',
        tapeWidthMm: 15
    },
    {
        id: '12x40-gap',
        name: '12x40mm Gap',
        type: 'gap',
        tapeWidthMm: 12,
        labelLengthMm: 40,
        gapMm: 2,
        borderRadiusMm: 1.5
    },
    {
        id: '15x30-gap',
        name: '15x30mm Gap',
        type: 'gap',
        tapeWidthMm: 15,
        labelLengthMm: 30,
        gapMm: 2,
        borderRadiusMm: 2
    },
    {
        id: '15x50-gap',
        name: '15x50mm Gap',
        type: 'gap',
        tapeWidthMm: 15,
        labelLengthMm: 50,
        gapMm: 2,
        borderRadiusMm: 2
    },
    {
        id: '15mm-transparent',
        name: '15mm Transparent',
        type: 'transparent',
        tapeWidthMm: 15
    },
    {
        // A cable-flag roll: a single die-cut sticker that wraps a cable. It is
        // two 12.5x37mm writeable panels end-to-end (the fold between them is
        // where it doubles over), followed by a 7x35mm wrap tail that curls
        // around the cable to hold it - thick, thick, then thin - for a 109mm
        // pitch on a 15mm carrier. The wrap tail is part of the sticker but not
        // a place to write, so it is a keep-clear area rather than a hole, and
        // the two panels are where content belongs.
        id: 'cable-flag-15x109',
        name: '15mm Cable Flag (12.5x109)',
        type: 'gap',
        tapeWidthMm: 15,
        labelWidthMm: 12.5,
        labelLengthMm: 109,
        gapMm: 3,
        die: { kind: 'path', dMm: 'M1.5 0 H35.5 A1.5 1.5 0 0 1 37 1.5 A1.5 1.5 0 0 1 38.5 0 H72.5 A1.5 1.5 0 0 1 74 1.5 V2.75 H109 V9.75 H74 V11 A1.5 1.5 0 0 1 72.5 12.5 H38.5 A1.5 1.5 0 0 1 37 11 A1.5 1.5 0 0 1 35.5 12.5 H1.5 A1.5 1.5 0 0 1 0 11 V1.5 A1.5 1.5 0 0 1 1.5 0 Z' },
        keepClearMm: ['M74 2.75 H109 V9.75 H74 Z']
    }
];
