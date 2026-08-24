import type { LoadedMedia, MediaKind, PaperProfile } from 'universal-label-core';

const paperType = (kind: MediaKind | undefined): PaperProfile['type'] => {
    if (kind === 'continuous') return 'continuous';
    if (kind === 'transparent') return 'transparent';
    if (kind === 'black') return 'black';
    if (kind === 'black-mark') return 'black-mark';
    if (kind === 'perforated') return 'perforated';
    if (kind === 'pvc') return 'pvc';
    if (kind === 'heat-shrink') return 'heat-shrink';
    return 'gap';
};

const cleanId = (value: string): string =>
    value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Stable identity for suppressing duplicate offers during one connection. */
export function loadedMediaIdentityKey(media: LoadedMedia): string | undefined {
    const tag = media.identification;
    if (!tag) return undefined;
    if (tag.barcode) return `${tag.technology}:barcode:${tag.barcode}`;
    if (tag.serialNumber) return `${tag.technology}:serial:${tag.serialNumber}`;
    if (tag.uid) return `${tag.technology}:uid:${tag.uid}`;
    if (media.id) return `${tag.technology}:id:${media.id}`;
    return undefined;
}

export type PaperMatchSource = 'reported' | 'current' | 'printhead';

export interface ResolvedLoadedPaper {
    paper: PaperProfile;
    /** Existing profile supplying dimensions, if one did. */
    matchedPaper?: PaperProfile;
    matchSource: PaperMatchSource;
}

/** Match device media to a usable app paper profile without inventing tag data. */
export function resolveLoadedPaper(
    media: LoadedMedia,
    papers: readonly PaperProfile[],
    current: PaperProfile | undefined,
    printheadWidthMm: number
): ResolvedLoadedPaper {
    const type = paperType(media.kind);
    const exact = media.widthMm === undefined
        ? undefined
        : papers.find(p =>
            p.type === type
            && p.tapeWidthMm === media.widthMm
            && (media.lengthMm === undefined || p.labelLengthMm === media.lengthMm)
        );
    const matchedPaper = exact ?? current;
    const matchSource: PaperMatchSource = exact
        ? 'reported'
        : current
            ? 'current'
            : 'printhead';
    const tag = media.identification;
    const identity = tag?.barcode || tag?.serialNumber || tag?.uid || media.id || media.kind || 'media';
    const tapeWidthMm = media.widthMm
        ?? matchedPaper?.tapeWidthMm
        ?? Math.max(1, Math.round(printheadWidthMm * 10) / 10);
    const segmented = type !== 'continuous';
    const canReuseSegment = segmented && matchedPaper?.type !== 'continuous';
    const labelLengthMm = media.lengthMm ?? (canReuseSegment ? matchedPaper?.labelLengthMm : undefined);
    // Equal dimensions do not prove equal die geometry or material. A 12 × 40
    // SKU may have square, circular or asymmetric corners, and its identifier
    // does not encode that shape. Reuse profile details only when the profile is
    // actually supplying missing dimensions, never merely because it is the
    // same size.
    const profileSuppliesDimensions = media.widthMm === undefined
        || (segmented && media.lengthMm === undefined);

    return {
        matchSource,
        matchedPaper,
        paper: {
            id: `detected_${cleanId(identity) || 'media'}`,
            name: media.name || `${tag?.technology?.toUpperCase() ?? 'Printer'} paper${tag?.barcode ? ` ${tag.barcode}` : ''}`,
            type,
            tapeWidthMm,
            ...(labelLengthMm !== undefined ? { labelLengthMm } : {}),
            ...(profileSuppliesDimensions && canReuseSegment && matchedPaper?.labelWidthMm !== undefined ? { labelWidthMm: matchedPaper.labelWidthMm } : {}),
            ...(profileSuppliesDimensions && canReuseSegment && matchedPaper?.gapMm !== undefined ? { gapMm: matchedPaper.gapMm } : {}),
            ...(profileSuppliesDimensions && canReuseSegment && matchedPaper?.borderRadiusMm !== undefined ? { borderRadiusMm: matchedPaper.borderRadiusMm } : {}),
            ...(profileSuppliesDimensions && matchedPaper?.appearance ? { appearance: matchedPaper.appearance } : {}),
            ...(profileSuppliesDimensions && matchedPaper?.inks ? { inks: matchedPaper.inks } : {})
        }
    };
}
