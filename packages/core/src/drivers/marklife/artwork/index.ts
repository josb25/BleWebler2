/**
 * Marklife artwork registry.
 *
 * Each model contributes one module — `marklife-<model>.ts`, hand-authored,
 * which composes its generated `*.art.ts` picture with the things a photograph
 * cannot show (movements, LED meanings, colourways). This file only maps model
 * keys onto them, so adding a printer is one import and one entry.
 */
import type { PrinterArtwork } from '../../printer-artwork';
import { MARKLIFE_P12_ARTWORK } from './marklife-p12';
import { MARKLIFE_P50_ARTWORK } from './marklife-p50';

export { MARKLIFE_P12_ARTWORK, MARKLIFE_P50_ARTWORK };

/**
 * Artwork by model key, matching the keys used elsewhere in the driver.
 * Models without artwork are simply absent; callers must handle `undefined`
 * rather than assume every printer has a picture.
 */
export const MARKLIFE_ARTWORK: Readonly<Record<string, PrinterArtwork>> = {
    P12: MARKLIFE_P12_ARTWORK,
    P50: MARKLIFE_P50_ARTWORK
};

export function marklifeArtwork(model: string): PrinterArtwork | undefined {
    return MARKLIFE_ARTWORK[model.toUpperCase()];
}
