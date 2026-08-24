/**
 * The vector-font catalogue: the typefaces a *shared* design is allowed to use.
 *
 * Bitmap fonts (see ./registry) are bundled glyph data and therefore already
 * reproduce identically everywhere. Vector text does not: `fontFamily` is a CSS
 * family string resolved against whatever happens to be installed, so the same
 * label renders differently on the author's machine, on someone else's, and on
 * the printer. For a design that only ever prints on the machine it was made
 * on that is fine — and stays allowed. For a design someone else opens it is a
 * correctness bug, so publishing requires a font from this catalogue.
 *
 * Two rules govern what may appear here, and both are load-bearing:
 *
 *  1. **Open licence, redistributable.** Every entry is SIL Open Font License
 *     1.1, which explicitly permits bundling and web embedding. The obligation
 *     is to ship the licence text and keep the copyright notice — hence
 *     {@link WebFont.copyright} and {@link WebFont.license} travelling with the
 *     catalogue rather than living in a file nobody reads.
 *
 *  2. **Self-hosted, always.** Font files are served from this application's
 *     own origin and never from a third-party font CDN. Hotlinking one would
 *     leak every viewer's IP address to that provider — which is both a
 *     straightforward privacy regression for a local-first app and, for an
 *     operator in Germany, well-trodden legal ground (LG München I, 3 O
 *     17493/20, decided that embedding Google Fonts from Google's servers
 *     without consent was an unlawful transfer of the visitor's IP). Bundling
 *     is also the only way the offline behaviour survives.
 */

import { WEB_FONT_IDS, type WebFontId } from '../../model/design';

export type { WebFontId };

export interface WebFont {
    id: WebFontId;
    /** Menu name. */
    label: string;
    /** CSS family, as registered by the bundled @font-face rules. */
    family: string;
    /** Families tried if the bundled file has not loaded yet. */
    fallback: string;
    /** Weights bundled for this family. */
    weights: readonly number[];
    /** Whether a real italic is bundled (never synthesise one for print). */
    italic: boolean;
    /** One line on what it is for, shown in the picker. */
    note: string;
    license: 'OFL-1.1';
    copyright: string;
    source: string;
}

/**
 * Deliberately small. Six families cover the label vocabulary — a UI sans, a
 * condensed face for narrow tape, a heavy face for warnings, a broad-coverage
 * face for non-Latin scripts, a monospace for codes and serials, and a serif —
 * and every extra family is bytes on a device that may be offline and a choice
 * the author has to make. Grow it on evidence, not on taste.
 */
const CATALOGUE: Record<WebFontId, WebFont> = {
    'inter': {
        id: 'inter',
        label: 'Inter',
        family: 'Inter',
        fallback: 'system-ui, sans-serif',
        weights: [400, 600, 700],
        italic: false,
        note: 'Neutral sans. Holds up at small sizes — the safe default.',
        license: 'OFL-1.1',
        copyright: 'Copyright (c) 2016 The Inter Project Authors',
        source: 'https://github.com/rsms/inter'
    },
    'archivo-narrow': {
        id: 'archivo-narrow',
        label: 'Archivo Narrow',
        family: 'Archivo Narrow',
        fallback: 'system-ui, sans-serif',
        weights: [400, 700],
        italic: true,
        note: 'Condensed. Fits more characters across a narrow tape.',
        license: 'OFL-1.1',
        copyright: 'Copyright (c) 2012 Omnibus-Type',
        source: 'https://github.com/Omnibus-Type/ArchivoNarrow'
    },
    'archivo-black': {
        id: 'archivo-black',
        label: 'Archivo Black',
        family: 'Archivo Black',
        fallback: 'system-ui, sans-serif',
        weights: [400],
        italic: false,
        note: 'Very heavy. For warnings and anything read at a distance.',
        license: 'OFL-1.1',
        copyright: 'Copyright (c) 2012 Omnibus-Type',
        source: 'https://github.com/Omnibus-Type/Archivo'
    },
    'noto-sans': {
        id: 'noto-sans',
        label: 'Noto Sans',
        family: 'Noto Sans',
        fallback: 'system-ui, sans-serif',
        weights: [400, 700],
        italic: true,
        note: 'Widest script coverage. Use when the text is not Latin.',
        license: 'OFL-1.1',
        copyright: 'Copyright (c) 2012 The Noto Project Authors',
        source: 'https://github.com/notofonts/notofonts.github.io'
    },
    'ibm-plex-mono': {
        id: 'ibm-plex-mono',
        label: 'IBM Plex Mono',
        family: 'IBM Plex Mono',
        fallback: 'ui-monospace, monospace',
        weights: [400, 600],
        italic: false,
        note: 'Monospace with unambiguous 0/O and 1/l — for serials and codes.',
        license: 'OFL-1.1',
        copyright: 'Copyright (c) 2017 IBM Corp.',
        source: 'https://github.com/IBM/plex'
    },
    'lora': {
        id: 'lora',
        label: 'Lora',
        family: 'Lora',
        fallback: 'Georgia, serif',
        weights: [400, 700],
        italic: true,
        note: 'Serif with real contrast. Suits product and gift labels.',
        license: 'OFL-1.1',
        copyright: 'Copyright (c) 2011 Cyreal',
        source: 'https://github.com/cyrealtype/Lora-Cyrillic'
    }
};

/**
 * The catalogue in menu order. Derived from {@link WEB_FONT_IDS} rather than
 * written out again, so the record above is the only place a family is listed
 * and a missing entry is a type error instead of a gap nobody notices.
 */
export const WEB_FONTS: readonly WebFont[] = WEB_FONT_IDS.map(id => CATALOGUE[id]);

/** The default a vector text element gets when it is first made shareable. */
export const DEFAULT_WEB_FONT: WebFontId = 'inter';

export function isWebFontId(v: unknown): v is WebFontId {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CATALOGUE, v);
}

export function webFont(id: WebFontId): WebFont | undefined {
    return CATALOGUE[id];
}

/**
 * The CSS family list for a catalogue id, bundled family first.
 *
 * The fallback is a safety net for the window before the file loads, not a
 * substitute for it: metrics differ between the two, so anything that measures
 * text must wait for the real font (see the loader) or it will lay out against
 * the wrong advance widths and quietly produce a label that overflows.
 */
export function webFontFamily(id: WebFontId): string {
    const f = CATALOGUE[id];
    return f ? `"${f.family}", ${f.fallback}` : 'system-ui, sans-serif';
}

/**
 * Attribution lines for every bundled family, for an about/licences screen.
 * OFL requires the notice to ship with the fonts; surfacing it in the app is
 * the honest way to satisfy that rather than burying it in the repository.
 */
export function fontAttributions(): string[] {
    return WEB_FONTS.map(f => `${f.label} — ${f.copyright}. Licensed under the SIL Open Font License 1.1. ${f.source}`);
}
