# Universal Label Renderer

The UI-independent reference implementation of the Universal Label Template (ULT) format. It parses and validates templates, resolves adaptive layouts, and rasterizes designs into printer-ready 1-bit planes.

## Install

```sh
npm install universal-label-renderer universal-label-core
```

The renderer has no Svelte dependency and runs in browsers and Node.js. Browser rasterization can use the included `browserRasterEnv`; Node.js callers provide a `RasterEnv` backed by their canvas implementation.

```ts
import {
  parseTemplateJSON,
  resolveTemplate,
  rasterizeDesign,
  browserRasterEnv
} from 'universal-label-renderer';

const parsed = parseTemplateJSON(templateJson);
if (!parsed.ok) throw new Error(parsed.errors.join('\n'));

const resolved = resolveTemplate(parsed.template, {
  widthPx: 320,
  heightPx: 96,
  tapeWidthMm: 12,
  labelLengthMm: 40,
  params: values
});
const page = await rasterizeDesign(resolved.design, browserRasterEnv);
```

See the [ULT specification](../ult/SPEC.md) and the [BleWebler2 repository](https://github.com/josb25/BleWebler2) for complete examples. The package includes the starter templates and lazy-loadable bitmap font data used by the reference implementation.

## Package boundary

This package owns the document model, safe expression engine, adaptive layout, validation, and raster output. Printer protocols and transports belong to `universal-label-core`. The BleWebler2 Svelte interface is intentionally not part of either public package.

## Licence

The implementation is MIT licensed. Bundled bitmap font data and starter templates retain their own terms; see [third-party notices](THIRD-PARTY-NOTICES.md).
