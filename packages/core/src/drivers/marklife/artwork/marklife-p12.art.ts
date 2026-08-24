/**
 * Original P12 schematic for identification in the BleWebler2 UI.
 *
 * Built from basic geometric primitives. It is a simplified interface graphic,
 * not a reproduction of product photography or a technical drawing.
 *
 * The SVG is self-contained — its `<style>` block carries defaults so the file
 * renders correctly on its own — and every value in it is a custom property the
 * UI can override.
 *
 * Movements, LED meanings and colourways are defined in the sibling
 * `marklife-p12.ts`.
 */
import type { PrinterArtwork } from '../../printer-artwork';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 136" width="112" height="136" role="img" aria-label="Marklife P12" data-printer="marklife-p12">
<style>
  /* Every selector is scoped to this printer's own root attribute.
     These SVGs get injected inline into host pages, where a style
     block is document-wide: an unscoped \`.outline\` would restyle any
     element on the page that happens to share the class name, and a
     second printer's block would silently redefine the first one's
     defaults. Scoped, the same file can appear a dozen times on one
     page — in a table, a chip, a settings row — and each copy is inert
     outside itself. */
  /* Outline weight is a styling choice: override with
     \`svg { --printer-outline: 2 }\` to restyle every printer at once.
     Widths set as attributes on individual shapes are measured
     geometry (bezel thickness, trim width) and stay put. */
  [data-printer="marklife-p12"] .outline { stroke-width: var(--printer-outline, 1.01); }

  /* The status LED. Unlit by default — that is what the render shows.
     It is a single-colour SMD part, so it has exactly one colour when
     lit: set \`--printer-led\` to one of these references.
       red    #ff3b2f
       green  #37d067
       blue   #3d8bff
     e.g. \`svg { --printer-led: #37d067 }\`. */
  [data-printer="marklife-p12"] .led { stroke: var(--printer-led, #5f5f5f); }

  /* The cutter slides: 6 mm up, 4 mm down on a
     30 mm part. Drive it with \`--printer-cutter-mm\` in mm,
     positive downward; the clamp holds it at the mechanical stops.
     Recolour the variant with \`--printer-cutter\` (e.g. #fff).
     The transition smooths occasional jumps — a slider, a state change.
     A caller driving this per frame must switch it off with
     \`--printer-cutter-ease: 0s\`, or every frame starts a fresh ease and
     the movement smears into mush. */
  [data-printer="marklife-p12"] .cutter {
    transform: translateY(clamp(-8.1px, calc(var(--printer-cutter-mm, 0) * 1.35px), 5.4px));
    transition: transform var(--printer-cutter-ease, .35s cubic-bezier(.4, 0, .2, 1));
  }
  /* Add class \`demo\` to the svg root to run the full stroke. */
  [data-printer="marklife-p12"].demo .cutter { animation: cutter-slide-marklife-p12 2.4s ease-in-out infinite; }
  @keyframes cutter-slide-marklife-p12 {
    0%, 100% { transform: translateY(0); }
    30%      { transform: translateY(-8.1px); }
    70%      { transform: translateY(5.4px); }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-printer="marklife-p12"] .cutter { transition: none; }
    [data-printer="marklife-p12"].demo .cutter { animation: none; }
  }
</style>
<g fill="var(--printer-cutter, #a94f51)" class="cutter outline" stroke="#636363" stroke-linejoin="round">
  <rect x="106.0" y="38.5" width="2.0" height="40.5" rx="1.0" ry="1.0"/>
  <path d="M 108.0 55.0 C 108.0 57.0 111.75 57.0 111.75 59.0 C 111.75 61.0 108.0 61.0 108.0 63.0 Z"/>
</g>
<g fill="var(--printer-body, #ffffff)" class="outline" stroke="#636363" stroke-linejoin="round">
  <rect x="0.5" y="0.5" width="105.75" height="134.75" rx="31.75" ry="31.75"/>
</g>
<g fill="none" class="outline" stroke="#636363" stroke-linejoin="round">
  <rect x="7.75" y="7.75" width="91.25" height="120.25" rx="24.5" ry="24.5"/>
</g>
<g fill="none" class="outline" stroke="#636363" stroke-linejoin="round">
  <line x1="94.25" y1="17.75" x2="102.75" y2="17.75" stroke-linecap="butt"/>
  <line x1="95.0" y1="116.75" x2="101.25" y2="120.75" stroke-linecap="butt"/>
</g>
<g fill="none" class="led outline" stroke-linejoin="round">
  <circle cx="53.75" cy="45.25" r="11.0" fill="none" stroke-width="2.25"/>
</g>
</svg>`;

export const MARKLIFE_P12_ART: Omit<PrinterArtwork, 'animations'> = {
    svg: SVG,
    viewBox: [112, 136] as const,
    parts: {
        cutter: {
            hook: 'cutter',
            lengthMm: 30,
            travelUpMm: 6,
            travelDownMm: 4,
            unitsPerMm: 1.35,
            colourVariants: ['#a94f51', '#ffffff']
        },
        led: {
            hook: 'led',
            kind: 'smd-single-colour',
            colours: { red: '#ff3b2f', green: '#37d067', blue: '#3d8bff' },
            unlit: '#5f5f5f'
        }
    },
    hooks: {
        outline: '--printer-outline',
        bodyColour: '--printer-body',
        cutterColour: '--printer-cutter',
        cutterPositionMm: '--printer-cutter-mm',
        led: '--printer-led'
    }
};
