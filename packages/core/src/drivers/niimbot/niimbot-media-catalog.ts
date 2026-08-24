import type { LoadedMedia } from "../printer-status";

export type NiimbotMediaCatalogEntry = Pick<LoadedMedia, 'name' | 'kind' | 'widthMm' | 'lengthMm'>;

/**
 * Offline mappings for opaque catalogue keys returned by NIIMBOT printers.
 *
 * Keep entries limited to functional media facts verified from a physical roll
 * or another recorded compatibility observation. Product artwork, marketing
 * text and manufacturer catalogue responses do not belong here.
 */
const NIIMBOT_MEDIA_CATALOG: Readonly<Record<string, Readonly<NiimbotMediaCatalogEntry>>> = Object.freeze({
    // Observed on the 12 × 40 mm white gap roll supplied with a D11_H.
    '01222281': Object.freeze({
        name: 'NIIMBOT 12 × 40 mm',
        kind: 'gap',
        widthMm: 12,
        lengthMm: 40
    })
});

/** Resolve an opaque RFID catalogue key without contacting the manufacturer. */
export function lookupNiimbotMedia(catalogueKey: string): NiimbotMediaCatalogEntry | undefined {
    const entry = NIIMBOT_MEDIA_CATALOG[catalogueKey.trim()];
    return entry ? { ...entry } : undefined;
}
