import { describe, expect, it } from 'vitest';
import {
    autoBind, monoPage, primaryInk, reduceToChannels, resolveSlot, singlePlane,
    DEFAULT_INK, type Ink, type InkPlane, type UniversalPage
} from './ink';

const black: Ink = { id: 'black', color: '#111111', primary: true, produced: { via: 'thermal' } };
const red: Ink = { id: 'red', color: '#d2262c', produced: { via: 'thermal', energyBand: 'high' } };
const blue: Ink = { id: 'blue', color: '#2255cc', produced: { via: 'ribbon' } };

/** A plane of `count` pixels, all dark or all light. */
function plane(ink: string, dark: boolean, count = 4): InkPlane {
    const data = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < data.length; i += 4) {
        const v = dark ? 0 : 255;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
    return { ink, data, width: count, height: 1 };
}

describe('primaryInk', () => {
    it('falls back to plain black when a profile declares nothing', () => {
        expect(primaryInk(undefined)).toBe(DEFAULT_INK);
        expect(primaryInk([])).toBe(DEFAULT_INK);
    });

    it('prefers the flagged ink over declaration order', () => {
        expect(primaryInk([red, black]).id).toBe('black');
    });

    it('treats the first ink as primary when none is flagged', () => {
        expect(primaryInk([red, blue]).id).toBe('red');
    });
});

describe('autoBind', () => {
    it('matches on id first', () => {
        expect(autoBind({ id: 'red' }, [black, red])?.id).toBe('red');
    });

    it('matches on name when the id does not line up', () => {
        const named: Ink = { ...red, id: 'spot1', name: 'Red' };
        expect(autoBind({ id: 'accent', name: 'red' }, [black, named])?.id).toBe('spot1');
    });

    it('falls back to the nearest colour to the slot intent', () => {
        expect(autoBind({ id: 'accent', intent: '#ee0000' }, [black, red, blue])?.id).toBe('red');
        expect(autoBind({ id: 'accent', intent: '#0000ff' }, [black, red, blue])?.id).toBe('blue');
    });

    it('gives up on a slot with nothing to match on', () => {
        expect(autoBind({ id: 'accent' }, [black, red])).toBeUndefined();
    });
});

describe('resolveSlot', () => {
    const slot = { id: 'accent', intent: '#ee0000' };

    it('honours an explicit binding over a better colour match', () => {
        const binding = { paperId: 'p', map: { accent: 'blue' } };
        expect(resolveSlot(slot, [black, red, blue], binding)?.id).toBe('blue');
    });

    it('auto-matches when the binding names an ink this roll does not have', () => {
        // A shared design meeting unfamiliar stock: stale, not fatal.
        const binding = { paperId: 'p', map: { accent: 'gold' } };
        expect(resolveSlot(slot, [black, red], binding)?.id).toBe('red');
    });

    it('returns nothing when the media cannot produce the slot at all', () => {
        expect(resolveSlot({ id: 'accent' }, [black])).toBeUndefined();
    });
});

describe('reduceToChannels', () => {
    it('leaves a page that already fits alone', () => {
        const page: UniversalPage = {
            colorModel: 'spot', width: 4, height: 1,
            planes: [plane('black', false), plane('red', true)]
        };
        expect(reduceToChannels(page, 2)).toBe(page);
    });

    it('folds surplus planes into the primary', () => {
        const page: UniversalPage = {
            colorModel: 'spot', width: 4, height: 1,
            planes: [plane('black', false), plane('red', true)]
        };
        const out = reduceToChannels(page, 1);
        expect(out.colorModel).toBe('spot');
        if (out.colorModel !== 'spot') return;
        expect(out.planes).toHaveLength(1);
        // The red content survived as black rather than vanishing.
        expect(out.planes[0].data[0]).toBe(0);
    });

    it('does not mutate the planes it was given', () => {
        const surviving = plane('black', false);
        const page: UniversalPage = {
            colorModel: 'spot', width: 4, height: 1,
            planes: [surviving, plane('red', true)]
        };
        reduceToChannels(page, 1);
        // A preview may still be showing the original planes in their own colours.
        expect(surviving.data[0]).toBe(255);
    });

    it('passes an RGB page through untouched', () => {
        const page: UniversalPage = {
            colorModel: 'rgb', width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255])
        };
        expect(reduceToChannels(page, 1)).toBe(page);
    });
});

describe('page helpers', () => {
    it('wraps a bitmap as one spot plane', () => {
        const page = monoPage({ data: new Uint8ClampedArray(8), width: 2, height: 1 });
        expect(page.colorModel).toBe('spot');
        expect(singlePlane(page).ink).toBe(DEFAULT_INK.id);
    });

    it('refuses to hand an RGB page to a spot driver', () => {
        const page: UniversalPage = {
            colorModel: 'rgb', width: 1, height: 1, data: new Uint8ClampedArray(4)
        };
        // Better an exception than a silently desaturated print.
        expect(() => singlePlane(page)).toThrow(/RGB page/);
    });
});
