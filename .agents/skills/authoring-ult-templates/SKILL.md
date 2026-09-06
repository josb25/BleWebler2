---
name: authoring-ult-templates
description: Creates, edits, audits, and validates BleWebler2 Universal Label Template (.ult.json) files with the canonical parser and multi-size adaptive lint. Use when turning a label idea into ULT, repairing a template, adding predefined fields, or checking a template for sharing or store readiness.
---

# Authoring ULT templates

Create portable, safe, adaptive ULT files. Treat the repository's specification
and validator as authoritative; do not recreate their rules from memory.

User instructions override this workflow when they conflict.

## Prepare

Work from the BleWebler2 repository root.

1. Read `packages/ult/SPEC.md` completely before changing a template.
2. Inspect the smallest number of relevant files in `packages/ult/examples/`.
   Choose examples with similar content, media, and adaptivity rather than
   copying the largest example.
3. Establish the intended media type and orientation, designed width and
   length, supported size range, label content, and user-editable fields. Infer
   only defaults that do not materially change the requested result.
4. Use `packages/ult/examples/<descriptive-slug>.ult.json` for a new example
   unless the user specifies another destination.

## Author

- Use physical `mm`, relative `%`, anchors, and constraints for adaptive
  geometry. Use `px` only when a dot-critical element needs it.
- Make variable content a typed parameter and bind elements to it. Give fields
  clear consumer-facing labels, safe defaults, and relevant bounds or options.
- Use `autoLength` only for continuous media. Use a fixed designed length for
  die-cut or gap labels.
- Keep every expression's optional `src` exactly equivalent to its stored `e`
  AST. Use only the safe expression language defined by the ULT specification;
  never add JavaScript, executable hooks, or evaluation instructions.
- Keep templates manufacturer- and transport-independent. Printer protocols,
  NFC payloads, catalogue identifiers, and driver-specific corrections belong
  outside ULT.
- Do not add remote image or gallery URLs. Embed only permitted, bounded data
  images as defined by the specification.
- Do not invent an author, provenance, or licence. A missing licence gives no
  permission to redistribute. If store readiness requires a licence and none
  was supplied, ask the user to choose one.
- Preserve unrelated working-tree changes.

## Validate

Run the canonical hardware-free validation after every meaningful edit:

```sh
npm run cli -- --template "<path-to-template.ult.json>" --validate
```

Fix all errors and rerun until the command succeeds. Review warnings; either
fix them or report why they remain.

Exercise values most likely to break the layout by repeating `--param`:

```sh
npm run cli -- --template "<path-to-template.ult.json>" --validate --param field=value
```

As applicable, check defaults, empty optional text, the longest plausible text,
numeric minima and maxima, boolean states, and every select option. Prefer a
few targeted invocations over a large arbitrary combination matrix.

Do not connect to or print on real hardware unless the user explicitly asks.
If visual inspection is available, preview the designed size plus range
extremes. Do not claim visual quality when only structural validation ran.

## Report

State the template path, intended media and adaptive range, parameter cases
tested, validation commands and results, and any remaining warning or visual
limitation. Never call a template valid if the canonical command was not run.
