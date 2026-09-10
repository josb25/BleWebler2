<script module lang="ts">
    /**
     * Inline SVG icons — a tiny dependency-free set drawn from Lucide
     * (https://lucide.dev), plus a few purpose-made glyphs for canvas
     * alignment. Stroke-based, inherits `currentColor`, so icons match the
     * surrounding text/button colour automatically.
     *
     * Lucide icons © Lucide Contributors, ISC License:
     *   Permission to use, copy, modify, and/or distribute this software for any
     *   purpose with or without fee is hereby granted, provided that the above
     *   copyright notice and this permission notice appear in all copies. THE
     *   SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.
     */
    export type IconName =
        | 'arrow-left' | 'undo' | 'redo' | 'printer' | 'pencil' | 'tag' | 'more'
        | 'search' | 'star' | 'trash' | 'x' | 'info' | 'plus' | 'minus' | 'check' | 'settings'
        | 'barcode' | 'qr' | 'image' | 'type' | 'download' | 'upload' | 'save' | 'copy' | 'scroll' | 'scissors'
        | 'chevron-up' | 'chevron-down' | 'file-text' | 'external-link'
        | 'bold' | 'italic' | 'underline'
        | 'align-left' | 'align-center-h' | 'align-right'
        | 'align-top' | 'align-center-v' | 'align-bottom'
        | 'lock' | 'unlock' | 'rotate'
        | 'square' | 'circle' | 'line' | 'shapes' | 'datamatrix' | 'invert'
        | 'heart' | 'flag'
        | 'move' | 'zoom-in' | 'zoom-out' | 'maximize' | 'layers' | 'sliders' | 'chevron-right';

    // Inner SVG markup per icon (viewBox 0 0 24 24).
    const PATHS: Record<IconName, string> = {
        'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
        'undo': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
        'redo': '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
        'printer': '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
        'pencil': '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
        'tag': '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".9" fill="currentColor" stroke="none"/>',
        'more': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
        'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        'star': '<path d="M12 2 15.09 8.26 22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z"/>',
        // A public "this is good" signal, deliberately a different glyph from
        // the star, which is the private bookmark.
        'move': '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>',
        'zoom-in': '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
        'zoom-out': '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>',
        'maximize': '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
        'layers': '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
        'sliders': '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
        'chevron-right': '<path d="m9 18 6-6-6-6"/>',
        'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
        'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
        'square': '<rect x="3" y="3" width="18" height="18" rx="2"/>',
        'circle': '<circle cx="12" cy="12" r="9"/>',
        'line': '<path d="M3 12h18"/>',
        'shapes': '<rect x="3" y="13" width="8" height="8" rx="1"/><circle cx="17.5" cy="17" r="4"/><path d="M12 3 8 10h8Z"/>',
        'datamatrix': '<path d="M3 3v18h18"/><path d="M21 3H7v4h4v4h4v4h6z"/>',
        'invert': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18a9 9 0 0 0 0-18" fill="currentColor"/>',
        'trash': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
        'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
        'minus': '<path d="M5 12h14"/>',
        'check': '<path d="M20 6 9 17l-5-5"/>',
        'settings': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        'barcode': '<path d="M3 5v14"/><path d="M6.5 5v14"/><path d="M10 5v14"/><path d="M14 5v14"/><path d="M17.5 5v14"/><path d="M21 5v14"/>',
        'qr': '<rect width="6" height="6" x="3" y="3" rx="1"/><rect width="6" height="6" x="15" y="3" rx="1"/><rect width="6" height="6" x="3" y="15" rx="1"/><path d="M15 15h2v2h-2z" fill="currentColor" stroke="none"/><path d="M19 15h2v2h-2z" fill="currentColor" stroke="none"/><path d="M15 19h2v2h-2z" fill="currentColor" stroke="none"/><path d="M19 19h2v2h-2z" fill="currentColor" stroke="none"/>',
        'image': '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
        'type': '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
        'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
        'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
        'save': '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
        'copy': '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
        'scroll': '<path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
        'scissors': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" x2="8.12" y1="4" y2="15.88"/><line x1="14.47" x2="20" y1="14.48" y2="20"/><line x1="8.12" x2="12" y1="8.12" y2="12"/>',
        'chevron-up': '<path d="m18 15-6-6-6 6"/>',
        'chevron-down': '<path d="m6 9 6 6 6-6"/>',
        'file-text': '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>',
        'external-link': '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>',
        'bold': '<path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>',
        'italic': '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
        'underline': '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>',
        // Purpose-made alignment glyphs: a reference edge line + an object box.
        'align-left': '<line x1="4" y1="3" x2="4" y2="21"/><rect x="7" y="8" width="12" height="8" rx="1"/>',
        'align-center-h': '<line x1="12" y1="3" x2="12" y2="21"/><rect x="6" y="8" width="12" height="8" rx="1"/>',
        'align-right': '<line x1="20" y1="3" x2="20" y2="21"/><rect x="5" y="8" width="12" height="8" rx="1"/>',
        'align-top': '<line x1="3" y1="4" x2="21" y2="4"/><rect x="8" y="7" width="8" height="12" rx="1"/>',
        'align-center-v': '<line x1="3" y1="12" x2="21" y2="12"/><rect x="8" y="6" width="8" height="12" rx="1"/>',
        'align-bottom': '<line x1="3" y1="20" x2="21" y2="20"/><rect x="8" y="5" width="8" height="12" rx="1"/>',
        'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        'unlock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
        'rotate': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'
    };
</script>

<script lang="ts">
    interface Props {
        name: IconName;
        /** px; defaults to 1em so the icon scales with surrounding text. */
        size?: number | string;
        /** Fill the shape (e.g. an active star) instead of stroke-only. */
        fill?: boolean;
    }
    let { name, size = '1.15em', fill = false }: Props = $props();
</script>

<svg
    class="icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- static, non-user icon markup -->
    {@html PATHS[name]}
</svg>

<style>
    .icon {
        display: inline-block;
        flex: none;
        vertical-align: -0.15em;
    }
</style>
