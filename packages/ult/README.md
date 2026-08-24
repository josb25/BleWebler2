<div align="center">
  <h1>Universal Label Template</h1>
  <p><strong>A safe, adaptive JSON format for labels that outlive one printer.</strong></p>
  <p>
    <a href="SPEC.md"><img src="https://img.shields.io/badge/specification-1.0-2563eb.svg" alt="Specification 1.0"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/spec_licence-MIT-7c3aed.svg" alt="MIT licence"></a>
    <a href="https://josb25.github.io/BleWebler2/ult/"><img src="https://img.shields.io/badge/read-online-059669.svg" alt="Read online"></a>
  </p>
</div>

ULT describes parametric label designs without embedding executable code. A resolver combines a template with user parameters, a physical label size, and a printer resolution to produce a concrete design.

## Design goals

- **Adaptive:** anchors, constraints, percentages, millimetres, and safe expressions allow one template to fit different media.
- **Printer-independent:** templates describe intent and geometry, not device commands.
- **Safe to import:** expressions are bounded JSON syntax trees evaluated by a small, non-Turing-complete interpreter.
- **Deterministic:** the same document, parameters, canvas, and font set resolve to the same geometry.
- **Extensible:** unknown keys are ignored and removed during normalization.

## Read the specification

- [Specification 1.0](SPEC.md)
- [Worked examples](examples)
- [BleWebler2 reference implementation](../renderer)

This repository contains version 1 of the format. Incompatible future changes require a new document version.

## Minimal document

```json
{
  "version": 1,
  "kind": "label-template",
  "id": "hello-label",
  "name": "Hello label",
  "license": "CC0-1.0",
  "params": [
    { "name": "name", "label": "Name", "type": "text", "default": "World" }
  ],
  "elements": [
    {
      "id": "greeting",
      "type": "text",
      "text": { "parts": ["Hello ", { "e": { "t": "ident", "name": "name" } }] },
      "font": "bitmap",
      "bitmapFont": "fixed-5x7",
      "fontFamily": "monospace",
      "bold": false,
      "italic": false,
      "underline": false,
      "align": "center",
      "autofit": true,
      "place": { "anchor": "c", "origin": "c", "size": { "u": "%", "v": 45, "of": "h" } }
    }
  ],
  "adaptivity": { "designedFor": { "tapeWidthMm": 12, "labelLengthMm": 40 } },
  "threshold": 128
}
```

## Examples

| Template | Demonstrates |
| --- | --- |
| [Asset tag](examples/asset-tag.ult.json) | Code 39, Data Matrix, and a dashed fold line |
| [Barcode product](examples/barcode-product.ult.json) | Constraint-driven barcode layout |
| [Hazard label](examples/hazard-label.ult.json) | Symbols, shapes, knockout text, and wrapping |
| [Name badge](examples/name-badge.ult.json) | Relative placement and axis locks |
| [Price tag](examples/price-tag.ult.json) | Adaptive text and QR layout |
| [QR link card](examples/qr-url-card.ult.json) | Content-driven length on continuous tape |
| [Retail price tag](examples/retail-price-tag.ult.json) | EAN-13 and vertically centred text |
| [Spine label](examples/spine-label.ult.json) | Rotation and media-relative positioning |

`price-tag-pro.ult.json` is an additional expression-language conformance example. Examples are released under CC0 1.0 as declared in each document.

## Contributing

Specification changes should include a worked example or conformance case and explain compatibility effects. See the monorepo [contribution guide](../../CONTRIBUTING.md).

## Licence

The specification text is available under the [MIT License](LICENSE). Example template documents declare CC0 1.0 individually. Implementations are independent and may use their own compatible licences. See the [licensing and provenance policy](LICENSING.md).
