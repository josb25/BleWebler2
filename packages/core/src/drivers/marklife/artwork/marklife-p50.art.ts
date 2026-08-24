/**
 * Original P50 schematic for identification in the BleWebler2 UI.
 *
 * Built from basic geometric primitives. It is a simplified interface graphic,
 * not a reproduction of product photography or a technical drawing.
 *
 * The SVG is self-contained — its `<style>` block carries defaults so the file
 * renders correctly on its own — and every value in it is a custom property the
 * UI can override.
 *
 * Movements and colourways are defined in the sibling `marklife-p50.ts`.
 */
import type { PrinterArtwork } from '../../printer-artwork';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 116 132" width="116" height="132" role="img" aria-label="Marklife P50" data-printer="marklife-p50">
<style>
  /* Scoped to this printer's own root: these SVGs are injected inline
     into host pages, where a style block is document-wide. An
     unscoped \`.outline\` would reach any element on the page sharing
     the class, and a second printer's block would redefine this one's
     defaults. */
  /* Outline weight is a styling choice; shape-level widths are
     measured geometry and do not follow it. */
  [data-printer="marklife-p50"] .outline { stroke-width: var(--printer-outline, 1.0); }
</style>
<g fill="var(--printer-body, #f2f2f2)" class="body outline" stroke="#6b6b6b" stroke-linejoin="round">
  <path d="M 28.5 2.0 H 87.0 C 103.25 2.0 109.0 7.75 109.0 24.0 V 100.5 C 109.0 122.75 101.25 130.5 79.0 130.5 H 36.5 C 14.25 130.5 6.5 122.75 6.5 100.5 V 24.0 C 6.5 7.75 12.25 2.0 28.5 2.0 Z"/>
</g>
<g fill="var(--printer-body, #f2f2f2)" class="ear outline" stroke="#6b6b6b" stroke-linejoin="round">
  <path d="M 6.5 43 C 3 43 2 44.5 2 48 C 2 64 2.6 76 6.5 76 Z"/>
  <path d="M 109.0 43 C 112.5 43 113.5 44.5 113.5 48 C 113.5 64 112.9 76 109.0 76 Z"/>
</g>
<g fill="#1f1f1f" class="lid outline" stroke="#6b6b6b" stroke-linejoin="round">
  <rect x="20.5" y="17.0" width="74.0" height="29.5" rx="14.75" ry="14.75"/>
</g>
<g fill="var(--printer-shade, color-mix(in srgb, var(--printer-body, #f2f2f2) 78%, #000))" class="bar">
  <rect x="17.5" y="78.5" width="81.0" height="6.5" rx="0.0" ry="0.0"/>
</g>
<g fill="#1f1f1f" class="slit">
  <rect x="21.0" y="80.75" width="74.0" height="2.0" rx="0.0" ry="0.0"/>
</g>
<g fill="none" class="trim outline" stroke="var(--printer-shade, color-mix(in srgb, var(--printer-body, #f2f2f2) 78%, #000))" stroke-linejoin="round">
  <path d="M 26.0 88.5 V 102.0 A 8.5 8.5 0 0 0 34.5 110.5 H 81.0 A 8.5 8.5 0 0 0 89.5 102.0 V 88.5"/>
  <ellipse cx="57.75" cy="97.5" rx="17.0" ry="6.5"/>
</g>
<g fill="none" class="outline" stroke="#6b6b6b" stroke-linejoin="round">
  <line x1="6.5" y1="81.75" x2="17.5" y2="81.75" stroke-linecap="butt"/>
  <line x1="98.5" y1="81.75" x2="109.0" y2="81.75" stroke-linecap="butt"/>
</g>
</svg>`;

export const MARKLIFE_P50_ART: Omit<PrinterArtwork, 'animations'> = {
    svg: SVG,
    viewBox: [116, 132] as const,
    parts: {

    },
    hooks: {
        outline: '--printer-outline',
        bodyColour: '--printer-body',
        bodyShade: '--printer-shade'
    }
};
