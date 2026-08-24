import { describe, expect, it } from 'vitest';
import type { LoadedMedia, PaperProfile } from 'universal-label-core';
import { loadedMediaIdentityKey, resolveLoadedPaper } from './media-paper';

const papers: PaperProfile[] = [
    { id: '12x40', name: '12 × 40', type: 'gap', tapeWidthMm: 12, labelLengthMm: 40, gapMm: 2, borderRadiusMm: 1.5 },
    { id: '15x30', name: '15 × 30', type: 'gap', tapeWidthMm: 15, labelLengthMm: 30, gapMm: 2 }
];

const nfc: LoadedMedia = {
    kind: 'gap',
    id: 'UID-ONE',
    identification: {
        technology: 'nfc',
        uid: 'UID-ONE',
        barcode: 'PRODUCT-15X30',
        serialNumber: 'ROLL-ONE'
    }
};

describe('identified media-to-paper resolver', () => {
    it('uses the product barcode as the stable offer identity', () => {
        expect(loadedMediaIdentityKey(nfc)).toBe('nfc:barcode:PRODUCT-15X30');
    });

    it('matches dimensions resolved by a media reader before current settings', () => {
        const result = resolveLoadedPaper(
            { ...nfc, widthMm: 12, lengthMm: 40 },
            papers,
            undefined,
            48
        );
        expect(result.matchSource).toBe('reported');
        expect(result.matchedPaper?.id).toBe('12x40');
        expect(result.paper).not.toHaveProperty('borderRadiusMm');
        expect(result.paper).not.toHaveProperty('gapMm');
    });

    it('uses the printhead only when neither reported nor current dimensions exist', () => {
        const result = resolveLoadedPaper(nfc, papers, undefined, 11.8);
        expect(result.matchSource).toBe('printhead');
        expect(result.paper.tapeWidthMm).toBe(11.8);
    });
});
