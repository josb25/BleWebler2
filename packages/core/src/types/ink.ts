/**
 * Ink: slots, colorants, and the binding between them.
 *
 * A thermal printer does not have "colours" — it has a print head that deposits
 * energy, and media that reacts to it. Most stock reacts by going black. Some
 * reacts by going blue. Two-colour stock reacts *differently at different energy
 * levels*, and a thermal-transfer machine simply carries whatever ribbon is
 * loaded. Meanwhile a full-colour device has no discrete inks at all, just a
 * gamut.
 *
 * Rather than pick one of those worlds, the model keeps two separate id spaces
 * and a mapping between them:
 *
 *   - {@link InkSlot}      — design side. What the author asked for. Arbitrary ids.
 *   - {@link Ink}          — media side. What this roll can actually develop.
 *   - {@link InkBinding}   — slot id → ink id, chosen per media, user-overridable.
 *
 * The two spaces exist because they change independently: a design outlives the
 * roll it was first printed on, and a roll is used by designs that have never
 * heard of it. Collapsing them into one enum would mean every design carries
 * assumptions about hardware it will never meet.
 */

/**
 * A colour channel as the *design* thinks of it.
 *
 * Declared by a template or design, with an id of the author's choosing. Nothing
 * here refers to hardware — a slot is a promise to be filled in later, and stays
 * meaningful on media that cannot honour it.
 */
export interface InkSlot {
    /** Design-local identifier, e.g. 'accent', 'warn-red'. */
    id: string;
    /** Display name for the binding UI, e.g. 'Accent'. Defaults to the id. */
    name?: string;
    /**
     * What this slot is *meant* to look like, as CSS RGB.
     *
     * Does triple duty, which is what lets one model span both worlds: it is the
     * preview colour before anything is bound, it is the key for auto-binding by
     * nearest colour on a spot device, and on an RGB device it is simply the
     * output — no binding, no quantisation, no discrete-channel ceiling.
     */
    intent?: string;
    /** What to do when no colorant can be bound. Default 'merge'. */
    onUnavailable?: InkFallback;
}

/**
 * What happens to a slot the active media or printer cannot produce.
 *
 * The author decides, because the pipeline cannot: a red SALE banner must
 * survive as black, while a red accent rule printed black is just a confusing
 * bar.
 */
export type InkFallback =
    /** Fold into the primary channel — the content matters, the colour does not. */
    | 'merge'
    /** Leave it off the page — decorative, and misleading in another colour. */
    | 'drop';

/**
 * One channel a given roll of media is able to develop.
 *
 * Declared by the {@link PaperProfile}, because it is a property of the stock,
 * not of the machine: the same printer prints black on one roll and black+red on
 * the next.
 */
export interface Ink {
    /** Media-local identifier, e.g. 'black', 'red'. */
    id: string;
    /** Display colour for previews and auto-binding — never consulted when printing. */
    color: string;
    /** Human-readable name for the binding UI, e.g. 'Red (high energy)'. */
    name?: string;
    /**
     * Marks this as the channel everything falls back to. Exactly one per
     * profile; the first ink is assumed primary if none says so.
     */
    primary?: boolean;
    /** How the mark is physically produced. Drivers read this; the renderer does not. */
    produced:
        /**
         * Direct thermal. `energyBand` selects between colours on two-colour
         * stock — the driver maps the band onto its own protocol (a second pass,
         * a dual bitplane, a density switch), which is why the band is named
         * rather than given as a number.
         */
        | { via: 'thermal'; energyBand?: 'low' | 'high' }
        /** Thermal transfer — the colour is whatever ribbon is loaded. */
        | { via: 'ribbon' };
}

/**
 * Slot id → ink id, for one specific media profile.
 *
 * Kept per media (rather than one global map) so that moving a design from
 * black-only stock to black+red and back does not destroy the mapping. Absent
 * entries are auto-bound; present entries are the user's explicit choice and are
 * never silently rewritten.
 */
export interface InkBinding {
    /** {@link PaperProfile.id} this binding applies to. */
    paperId: string;
    /** Slot id → ink id. A slot absent from the map is unbound. */
    map: Record<string, string>;
}

/**
 * One separated channel, rasterised.
 *
 * Deliberately shares {@link UniversalImageData}'s RGBA layout rather than
 * packing to 1 bit: it wastes bytes, but it means every existing driver's pixel
 * loop keeps working untouched on a single-plane page.
 */
export interface InkPlane {
    /** {@link Ink.id} this plane develops. */
    ink: string;
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
}

/**
 * A page as handed to a driver, in whichever colour model the driver declared.
 *
 * Plain monochrome is not a separate case — it is `spot` with a single plane, so
 * every existing driver stays on exactly the path it is on today.
 *
 * A driver never has to handle more planes than it supports: PrintManager has
 * already reduced the page to the declared channel count before this reaches
 * `printPage`, so the length is a guarantee rather than a hint.
 */
export type UniversalPage =
    | {
        colorModel: 'spot';
        width: number;
        height: number;
        /** Primary first. Overlaps knock out downward unless the element opted into overprint. */
        planes: InkPlane[];
    }
    | {
        colorModel: 'rgb';
        width: number;
        height: number;
        /** Full-gamut RGBA. The device does its own halftoning. */
        data: Uint8Array | Uint8ClampedArray;
    };

/**
 * Wrap a single bitmap as a one-plane page.
 *
 * The bridge for everything that legitimately has only one channel to give — a
 * caller that has already rasterised, a test, an import. Not a shortcut around
 * the ink plan: designs go through the renderer, which knows about slots.
 */
export function monoPage(
    image: { data: Uint8Array | Uint8ClampedArray; width: number; height: number },
    inkId: string = DEFAULT_INK.id
): UniversalPage {
    return {
        colorModel: 'spot',
        width: image.width,
        height: image.height,
        planes: [{ ink: inkId, data: image.data, width: image.width, height: image.height }]
    };
}

/**
 * The one plane a single-channel driver prints.
 *
 * Structurally compatible with `UniversalImageData`. Throws on an RGB page
 * rather than silently desaturating one: PrintManager reduces every page to the driver's declared colour model
 * before `printPage`, so reaching here with the wrong model is a wiring bug, and
 * a bad print is a worse way to find out than an exception.
 */
export function singlePlane(page: UniversalPage): InkPlane {
    if (page.colorModel !== 'spot') {
        throw new Error('singlePlane() received an RGB page — this driver declared spot colour.');
    }
    return page.planes[0];
}

/**
 * Guarantee a page carries no more planes than the driver declared.
 *
 * This is a safety net, not the policy. Slots that the media or the channel
 * budget cannot honour are already resolved at raster time, where 'drop' can
 * actually drop something and 'merge' can re-render in the primary colour.
 * By the time a page exists there are only pixels, so all this can do is fold
 * the surplus into the primary plane — which is the least-bad outcome, and only
 * happens if a caller rasterised against a budget the driver disagrees with.
 */
export function reduceToChannels(page: UniversalPage, channels: number): UniversalPage {
    if (page.colorModel !== 'spot') return page;
    const limit = Math.max(1, Math.floor(channels));
    if (page.planes.length <= limit) return page;

    const kept = page.planes.slice(0, limit);
    const primary = kept[0];
    // Copy before merging: planes may be shared with a preview that is still
    // showing them in their own colours.
    const merged = new Uint8ClampedArray(primary.data);
    for (const surplus of page.planes.slice(limit)) {
        for (let i = 0; i < merged.length; i += 4) {
            // Dark in any surplus plane becomes dark in the primary. Planes are
            // already 1-bit, so a single channel test is exact.
            if (surplus.data[i] < 128) {
                merged[i] = 0;
                merged[i + 1] = 0;
                merged[i + 2] = 0;
                merged[i + 3] = 255;
            }
        }
    }
    kept[0] = { ...primary, data: merged };
    return { ...page, planes: kept };
}

/** The colorant assumed when a profile declares no inks at all. */
export const DEFAULT_INK: Ink = {
    id: 'black',
    color: '#111111',
    name: 'Black',
    primary: true,
    produced: { via: 'thermal' }
};

/** The primary colorant of a profile — the merge target for unbindable slots. */
export function primaryInk(inks: readonly Ink[] | undefined): Ink {
    if (!inks || inks.length === 0) return DEFAULT_INK;
    return inks.find(i => i.primary) ?? inks[0];
}

/**
 * Resolve one slot against the colorants a profile offers.
 *
 * An explicit binding always wins, even when a "better" colour match exists —
 * a user who linked a slot by hand does not want it silently re-linked. Only
 * unbound slots fall through to auto-matching.
 *
 * Returns `undefined` when nothing can be bound; the caller then applies
 * {@link InkSlot.onUnavailable}.
 */
export function resolveSlot(
    slot: InkSlot,
    inks: readonly Ink[] | undefined,
    binding?: InkBinding
): Ink | undefined {
    const available = inks && inks.length > 0 ? inks : [DEFAULT_INK];

    const bound = binding?.map[slot.id];
    if (bound) {
        const hit = available.find(i => i.id === bound);
        if (hit) return hit;
        // A binding pointing at an ink this roll does not have is stale, not
        // fatal — fall through and auto-match rather than dropping the content.
    }

    return autoBind(slot, available);
}

/**
 * Pick the colorant a slot should bind to when the user has not said.
 *
 * Ordered from most to least certain: an id match is unambiguous, a name match
 * is near enough, and colour distance is a guess that still beats defaulting a
 * red slot onto black. Slots with no `intent` and no name match get nothing, so
 * the caller's fallback policy decides.
 */
export function autoBind(slot: InkSlot, inks: readonly Ink[]): Ink | undefined {
    const byId = inks.find(i => i.id === slot.id);
    if (byId) return byId;

    const wanted = (slot.name ?? slot.id).toLowerCase();
    const byName = inks.find(i => (i.name ?? i.id).toLowerCase() === wanted);
    if (byName) return byName;

    if (slot.intent) {
        const target = parseRgb(slot.intent);
        if (target) {
            let best: Ink | undefined;
            let bestDist = Infinity;
            for (const ink of inks) {
                const c = parseRgb(ink.color);
                if (!c) continue;
                const d = (c[0] - target[0]) ** 2 + (c[1] - target[1]) ** 2 + (c[2] - target[2]) ** 2;
                if (d < bestDist) { bestDist = d; best = ink; }
            }
            // "Nearest" has to mean near. On a black-only roll every slot is
            // nearest to black, and returning it would bind a red slot to black
            // silently — which is precisely the outcome the caller's fallback
            // policy exists to notice and warn about.
            if (best && bestDist <= MAX_MATCH_DISTANCE * MAX_MATCH_DISTANCE) return best;
        }
    }

    return undefined;
}

/**
 * How far apart two colours may be and still count as the same intent, as plain
 * RGB distance.
 *
 * Generous enough to bind "red" to a roll's particular red, and to survive the
 * difference between a screen swatch and a developed dye; far short of letting
 * one primary stand in for another.
 */
const MAX_MATCH_DISTANCE = 128;

/**
 * Parse `#rgb` / `#rrggbb` into 0-255 components.
 *
 * Deliberately narrow: these values come from shared media profiles and
 * templates, so anything exotic is treated as "no usable colour" and falls back
 * to the caller's policy rather than throwing mid-render.
 */
function parseRgb(css: string): [number, number, number] | undefined {
    const m = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return undefined;
    const hex = m[1];
    if (hex.length === 3) {
        return [
            parseInt(hex[0] + hex[0], 16),
            parseInt(hex[1] + hex[1], 16),
            parseInt(hex[2] + hex[2], 16)
        ];
    }
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
    ];
}
