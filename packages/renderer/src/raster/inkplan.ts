/**
 * Deciding which ink every element actually prints in.
 *
 * This is the one place where a design's *slots* (what the author asked for)
 * meet the media's *colorants* (what this roll can develop) and the printer's
 * channel budget (how many of them the hardware will accept). Everything after
 * this point deals in planes of pixels and has no idea a slot ever existed.
 *
 * Deliberately separate from the rasterizer and free of any canvas: the editor
 * needs the same answer in order to warn about content that will merge or
 * disappear, and it needs it without drawing anything.
 */
import {
    autoBind,
    primaryInk,
    resolveSlot,
    DEFAULT_INK,
    type Ink,
    type InkBinding,
    type InkSlot
} from 'universal-label-core';
import type { AnyElement, LabelDesign } from '../model/design';

/** One separated channel, and the elements that belong to it. */
export interface PlannedPlane {
    ink: Ink;
    elements: AnyElement[];
}

/** What happened to a slot that could not be given a channel of its own. */
export interface InkCompromise {
    slotId: string;
    /** Display name of the slot, for the warning the user reads. */
    slotName: string;
    /** 'merge' printed it in the primary ink; 'drop' left it off the page. */
    action: 'merge' | 'drop';
    /** Why the slot could not be honoured. */
    reason: 'no-colorant' | 'over-budget';
}

export interface InkPlan {
    /** Primary first, then one per additional colorant actually used. */
    planes: PlannedPlane[];
    /** Slots that could not be honoured, in declaration order. */
    compromises: InkCompromise[];
}

/**
 * Work out the planes a design will rasterise into.
 *
 * `inkChannels` is the printer's budget, straight from
 * `PrinterCapabilities.colorSupport.channels`. Resolving against it *here*,
 * before anything is drawn, is what lets 'drop' actually drop an element and
 * 'merge' re-render it in the primary colour — both of which are impossible
 * once the design has been flattened to pixels.
 *
 * Empty planes are never emitted, except the primary: a page always has at
 * least one plane, even when every element was dropped.
 */
export function planInks(design: LabelDesign, inkChannels: number = 1): InkPlan {
    const declared = design.paper?.inks;
    const inks: readonly Ink[] = declared && declared.length > 0 ? declared : [DEFAULT_INK];
    const primary = primaryInk(inks);

    const binding = design.inkBindings?.find(b => b.paperId === design.paper?.id);
    const slots = design.slots ?? [];

    // Pass one: what each element *wants*, ignoring the channel budget entirely.
    // Resolving first is what lets the budget be spent on the colours the design
    // actually uses. Spending it in the profile's declaration order instead
    // would hand channel two to a colorant nothing references while the one the
    // author picked got merged away.
    const wants = new Map<string, Ink | undefined>();
    const slotOf = new Map<string, InkSlot>();
    const order: Ink[] = [];
    for (const el of design.elements) {
        if (!el.ink) continue;
        // An element may name a slot the design never declared — a hand-edited
        // file, or a template whose slot list was trimmed. Treat it as a bare
        // slot rather than discarding the element.
        const slot: InkSlot = slots.find(s => s.id === el.ink) ?? { id: el.ink };
        slotOf.set(el.id, slot);
        const resolved = resolveSlot(slot, inks, binding);
        wants.set(el.id, resolved);
        if (resolved && resolved.id !== primary.id && !order.some(i => i.id === resolved.id)) {
            order.push(resolved);
        }
    }

    // Pass two: spend the budget. The primary always takes a channel, because it
    // is the merge target and a page must have somewhere to put content.
    const budget = Math.max(1, Math.floor(inkChannels));
    const affordable: Ink[] = [primary, ...order.slice(0, budget - 1)];

    const buckets = new Map<string, AnyElement[]>(affordable.map(i => [i.id, []]));
    const compromises: InkCompromise[] = [];
    const noted = new Set<string>();

    const compromise = (slot: InkSlot, reason: InkCompromise['reason']): 'merge' | 'drop' => {
        const action = slot.onUnavailable ?? 'merge';
        // One warning per slot, however many elements are on it — the user is
        // being told about their slot, not about each object.
        if (!noted.has(slot.id)) {
            noted.add(slot.id);
            compromises.push({ slotId: slot.id, slotName: slot.name ?? slot.id, action, reason });
        }
        return action;
    };

    for (const el of design.elements) {
        if (!el.ink) {
            buckets.get(primary.id)!.push(el);
            continue;
        }
        const slot = slotOf.get(el.id)!;
        const resolved = wants.get(el.id);
        if (!resolved) {
            if (compromise(slot, 'no-colorant') === 'merge') buckets.get(primary.id)!.push(el);
            continue;
        }
        if (!buckets.has(resolved.id)) {
            // The media can develop this colour but the printer has no channel
            // left for it — a different failure, and worth saying so, because
            // the fix is a different printer rather than different paper.
            if (compromise(slot, 'over-budget') === 'merge') buckets.get(primary.id)!.push(el);
            continue;
        }
        buckets.get(resolved.id)!.push(el);
    }

    const planes: PlannedPlane[] = [];
    for (const ink of affordable) {
        const elements = buckets.get(ink.id)!;
        if (elements.length === 0 && ink.id !== primary.id) continue;
        planes.push({ ink, elements });
    }
    return { planes, compromises };
}

/**
 * The colorant a slot would bind to right now, for the binding UI's preview.
 *
 * Same resolution the plan uses, exposed on its own so the editor can show a
 * swatch next to an unbound slot without building a whole plan.
 */
export function previewBinding(
    slot: InkSlot,
    paperInks: readonly Ink[] | undefined,
    binding?: InkBinding
): Ink | undefined {
    const inks = paperInks && paperInks.length > 0 ? paperInks : [DEFAULT_INK];
    const explicit = binding?.map[slot.id];
    if (explicit) {
        const hit = inks.find(i => i.id === explicit);
        if (hit) return hit;
    }
    return autoBind(slot, inks);
}
