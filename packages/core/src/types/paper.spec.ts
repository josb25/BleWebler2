import { describe, expect, it } from 'vitest';
import { DEFAULT_PAPER_PROFILES } from './paper';

describe('default paper profiles', () => {
    it('includes the issue #5 cable flag with exact reported geometry', () => {
        const paper = DEFAULT_PAPER_PROFILES.find(profile => profile.id === 'cable-flag-15x109');

        expect(paper).toMatchObject({
            name: '15mm Cable Flag (12.5x109)',
            type: 'gap',
            tapeWidthMm: 15,
            labelWidthMm: 12.5,
            labelLengthMm: 109,
            keepClearMm: ['M74 2.75 H109 V9.75 H74 Z'],
        });
        expect(paper?.die).toEqual(expect.objectContaining({ kind: 'path' }));
        expect(paper).not.toHaveProperty('gapMm');
    });
});
