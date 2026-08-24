# Bitmap fonts

The designer's pixel-font text is rendered from open-source **BDF bitmap
fonts**, pre-converted to compact JSON at build time. Bitmap glyphs land exactly
on the pixel grid with no anti-aliasing, which is what keeps small label text
crisp after 1-bit conversion.

## Pipeline

```
fonts/bdf/**/*.bdf   →  scripts/bundle-bdf.mjs  →  src/raster/fonts/data/*.json
                                                    src/raster/fonts/manifest.json
```

- `fonts/bdf/` holds the raw upstream `.bdf` sources. It is **git-ignored** (a
  few MB of upstream text) — the shipped artifact is the generated JSON, which
  *is* committed. Re-download the sources (links below) only when regenerating.
- Only ASCII (32–126) and Latin-1 (160–255) are bundled — label text, not a
  Unicode terminal — keeping each font a few KB.
- The default font (`fixed-5x7`) is imported statically and always available;
  every other font is a separate lazy chunk fetched the first time a label
  uses it (see `src/raster/fonts/registry.ts`).

Regenerate after adding/removing a `.bdf`:

```bash
npm run fonts
```

## Families, sources & licenses

| Family | Sizes | License | Source |
| --- | --- | --- | --- |
| **X11 misc-fixed** | 5×7 … 10×20 (`fixed-*`) | Public domain | https://www.cl.cam.ac.uk/~mgk25/ucs-fonts.html |
| **Terminus** | 12 … 32, normal + bold (`ter-u*`) | SIL OFL 1.1 | http://terminus-font.sourceforge.net/ |
| **Spleen** | 8×16, 12×24, 16×32, 32×64 | BSD 2-Clause | https://github.com/fcambus/spleen |

Full license texts are in [`LICENSES/`](./LICENSES). These must be retained when
redistributing the app, since the generated glyph JSON is derived from them.
