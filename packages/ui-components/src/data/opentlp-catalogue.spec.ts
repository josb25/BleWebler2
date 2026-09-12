import { describe, expect, it } from 'vitest';
import {
    getOpenTlpSearchTerms,
    inferCatPrinterProtocolSlug,
    matchOpenTlpDevice,
    type CataloguePrinterProfile,
} from './opentlp-catalogue';

function profile(values: Partial<CataloguePrinterProfile> & Pick<CataloguePrinterProfile, 'id' | 'model'>): CataloguePrinterProfile {
    return { brand: 'Generic Cat Printer', ...values };
}

describe('OpenTLP catalogue matching', () => {
    it('prefers an exact stable device id', () => {
        expect(matchOpenTlpDevice(profile({ id: 'marklife_p12', brand: 'Marklife', model: 'P12' }))?.id)
            .toBe('marklife_p12');
    });

    it('maps generic Cat Printer names only within the inferred protocol family', () => {
        expect(matchOpenTlpDevice(profile({ id: 'catprinter_gb01', model: 'GB01' }))?.id)
            .toBe('generic_gb01');
        expect(inferCatPrinterProtocolSlug('catprinter_v5g_mx05')).toBe('catprinter-v5g');
        expect(matchOpenTlpDevice(profile({ id: 'catprinter_v5g_mx05', model: 'MX05' })))
            .toBeUndefined();
    });

    it('adds OpenTLP aliases to picker search terms', () => {
        const target = profile({ id: 'marklife_l13', brand: 'Marklife', model: 'L13' });
        expect(getOpenTlpSearchTerms(target)).toContain('SilverCrest');
    });
});
