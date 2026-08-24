/**
 * Marklife P12 — everything about the artwork that a photograph cannot tell you.
 *
 * The schematic lives in `./marklife-p12.art.ts`. This file adds the cutter
 * movement, LED states and available colourways.
 *
 * Still capability, not presentation. Durations are how long the real mechanism
 * takes; whether any of it is animated, and how, is the UI layer's decision.
 */
import type {
    ArtworkAnimation,
    LedStates,
    PrinterArtwork,
    PrinterColourway
} from '../../printer-artwork';
import { MARKLIFE_P12_ART } from './marklife-p12.art';

/**
 * The cutter rests in the middle and returns there. Both actions are gestures,
 * not state changes — nothing is left parked off-centre — so `returnsToRest`
 * is true for both.
 *
 * Deliberately no LED keyframes. On this printer the LED reports connection and
 * battery state; it does not react to the cutter moving, and flashing it here
 * would depict behaviour the machine does not have.
 */
const ANIMATIONS: Record<string, ArtworkAnimation> = {
    cut: {
        id: 'cut',
        label: 'Cut',
        durationMs: 700,
        returnsToRest: true,
        keyframes: [
            { at: 0, cutterMm: 0 },
            // Up to the stop, held an instant while the blade shears, then back.
            { at: 0.35, cutterMm: -6 },
            { at: 0.5, cutterMm: -6 },
            { at: 1, cutterMm: 0 }
        ]
    },
    open: {
        id: 'open',
        label: 'Open',
        durationMs: 800,
        returnsToRest: true,
        keyframes: [
            { at: 0, cutterMm: 0 },
            { at: 0.35, cutterMm: 4 },
            { at: 0.55, cutterMm: 4 },
            { at: 1, cutterMm: 0 }
        ]
    }
};

/** What the single-colour status LED is reporting. */
const LED_STATES: LedStates = {
    green: 'On, searching for a connection',
    blue: 'Connected',
    red: 'Battery low'
};

/**
 * The four combinations the P12 actually ships in. Body and cutter are moulded
 * separately and mix, so they are listed as real pairings rather than as two
 * independent colour choices — that way a UI cannot show a product that does
 * not exist.
 *
 * The mint is sampled from the product photography, not invented: a pale
 * pastel, much softer than a UI green.
 */
const COLOURWAYS: PrinterColourway[] = [
    { id: 'white-red', label: 'White · red cutter', body: '#ffffff', cutter: '#a94f51' },
    { id: 'white-white', label: 'White', body: '#ffffff', cutter: '#ffffff' },
    { id: 'mint-mint', label: 'Mint', body: '#a8ddba', cutter: '#a8ddba' },
    { id: 'mint-white', label: 'Mint · white cutter', body: '#a8ddba', cutter: '#ffffff' }
];

export const MARKLIFE_P12_ARTWORK: PrinterArtwork = {
    ...MARKLIFE_P12_ART,
    animations: ANIMATIONS,
    ledStates: LED_STATES,
    colourways: COLOURWAYS
};
