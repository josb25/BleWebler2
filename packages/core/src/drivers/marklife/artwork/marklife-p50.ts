/**
 * Marklife P50 — the parts of the artwork a photograph cannot tell you.
 *
 * The schematic lives in `./marklife-p50.art.ts`. This file adds the product's
 * mechanical behavior and available colourways.
 */
import type { ArtworkAnimation, PrinterArtwork, PrinterColourway } from '../../printer-artwork';
import { MARKLIFE_P50_ART } from './marklife-p50.art';

/**
 * Empty on purpose, not by oversight.
 *
 * **The P50 has no cutter** — paper is torn against the fixed edge rather than
 * driven by a blade carrier, which is why the artwork publishes no cutter part
 * and no cutter hooks. Its lid mechanism has not been measured either.
 * Inventing a `cut` here would put a movement in the driver that the hardware
 * does not perform, and every UI reading this treats an entry as a statement of
 * fact about the machine. An empty record is the honest answer.
 */
const ANIMATIONS: Record<string, ArtworkAnimation> = {};

/**
 * The four bodies the P50 is sold in, sampled off the product photography.
 *
 * No `cutter` on any of them: with nothing moulded separately there is only one
 * colour per variant, and claiming a second would draw a part the printer does
 * not have.
 */
const COLOURWAYS: PrinterColourway[] = [
    { id: 'white', label: 'White', body: '#ffffff' },
    { id: 'aqua', label: 'Aqua', body: '#a2dcd8' },
    { id: 'yellow', label: 'Yellow', body: '#f6d24e' },
    { id: 'pink', label: 'Pink', body: '#efb0b8' }
];

export const MARKLIFE_P50_ARTWORK: PrinterArtwork = {
    ...MARKLIFE_P50_ART,
    animations: ANIMATIONS,
    colourways: COLOURWAYS
};
