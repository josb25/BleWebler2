/**
 * Which drivers can draw their own printers.
 *
 * The artwork lives with the driver, so finding it means asking the right
 * driver — and the mapping from a wiki row to a driver is the one thing the
 * wiki knows that the driver does not. Kept here rather than duplicated in the
 * table and the detail page: both had the same brand test, which meant adding a
 * second brand's artwork was two edits in two files that could disagree, and
 * disagreeing is exactly how a thumbnail ends up showing a stock photo of a
 * printer whose detail page shows a drawing.
 */
import { marklifeArtwork, type PrinterArtwork } from 'universal-label-core';

/**
 * Everything a lookup needs. Structural rather than `HardwareSpec`, because a
 * driver's `PrinterModelProfile` carries the same two fields and has just as
 * much right to a picture as a wiki row does.
 */
export interface NamedModel {
    brand: string;
    model: string;
}

/** Driver artwork lookups by brand, lowercased. */
const BY_BRAND: Record<string, (model: string) => PrinterArtwork | undefined> = {
    marklife: marklifeArtwork
};

/**
 * The drawing for a hardware row, or `undefined` where no driver has one.
 *
 * Callers fall back to `hw.imageUrl`; a missing drawing is the normal case
 * while models are worked through, not an error.
 */
export function artworkFor(hw: NamedModel): PrinterArtwork | undefined {
    return BY_BRAND[hw.brand.toLowerCase()]?.(hw.model);
}

/**
 * The drawing for whatever is on the other end of the wire.
 *
 * A connected printer announces a Bluetooth name, not a model — `P12_1A2B`,
 * `Marklife P50`, sometimes just `Printer`. So this reads the model out of that
 * name, and does it **strictly**: a token has to equal a model key outright.
 * Prefix matching would let a P50S borrow the P50's picture, and showing
 * someone a drawing of a printer they do not own is worse than showing them the
 * generic icon — the whole value of the artwork is that it is a true likeness.
 *
 * `driverName` narrows the search to one brand where it identifies one. It is
 * free-text from the driver, so it is treated as a hint, never a requirement.
 */
export function artworkForDevice(
    deviceName?: string,
    driverName?: string
): PrinterArtwork | undefined {
    if (!deviceName) return undefined;
    const hinted = driverName?.toLowerCase() ?? '';
    const brands = Object.keys(BY_BRAND).filter(b => hinted.includes(b));
    const search = brands.length ? brands : Object.keys(BY_BRAND);

    // `P12_1A2B` → ['P12', '1A2B']; `Marklife-P50` → ['MARKLIFE', 'P50'].
    for (const token of deviceName.split(/[^A-Za-z0-9]+/).filter(Boolean)) {
        for (const brand of search) {
            const art = BY_BRAND[brand](token);
            if (art) return art;
        }
    }
    return undefined;
}
