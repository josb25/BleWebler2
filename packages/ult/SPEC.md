# Universal Label Template (ULT) — Specification 1.0

A ULT document is a single JSON object describing a **parametric, adaptive
label template**. A *resolver* combines it with a target canvas size and a set
of parameter values to produce a concrete, absolute-pixel label bitmap. This
spec defines the document shape, the responsive geometry model, the expression
language, and the safety guarantees required for importing untrusted files.

Conventions: keys are case-sensitive. Unknown keys MUST be ignored (importers
SHOULD drop them). All lengths in the *document* are either relative or in
millimetres/pixels as noted; the *resolved* output is in device pixels.

---

## 1. Document

```jsonc
{
  "version": 1,
  "kind": "label-template",
  "id": "uuid-or-stable-id",
  "name": "Price tag",
  "author": "optional",
  "description": "optional",
  "license": "CC0-1.0",
  "tags": ["retail", "price"],
  "revision": 1,
  "params": [ /* Param */ ],
  "elements": [ /* Element */ ],
  "constraints": [ /* Constraint */ ],   // optional, see §3.2
  "slots": [ /* InkSlot */ ],             // optional, see §1.5
  "gallery": { /* embedded images */ },   // optional, see §1.4
  "adaptivity": { /* Adaptivity */ },
  "threshold": 128            // 1..254 final 1-bit cutoff
}
```

`version` MUST be `1` and `kind` MUST be `"label-template"`. Other versions
are rejected.

### 1.1 Param

A typed input the user fills in. `name` MUST match `^[A-Za-z_$][\w$]*$` and is
the identifier used in expressions/bindings.

```jsonc
{ "name": "price", "label": "Price", "type": "number",
  "default": 5, "min": 0, "max": 9999, "step": 0.01 }
```

`type` ∈ `text | number | boolean | select | color | date`.
`options` (select), `min`/`max`/`step` (number), `multiline` (text), `help` are optional.

### 1.2 Adaptivity

```jsonc
{ "designedFor": { "tapeWidthMm": 12, "labelLengthMm": 40 },
  "minTapeWidthMm": 9, "maxTapeWidthMm": 24,       // optional declared range
  "minLabelLengthMm": 20, "maxLabelLengthMm": 80,
  "relativeTo": "printable",   // "printable" (default) | "media"
  "autoLength": true,          // continuous tape: canvas grows to the content
  "autoLengthPadMm": 2 }       // trailing pad when autoLength is on (0..50)
```

`designedFor` is the authoring size. The optional range is the author's promise
of where the template is meant to work; validators SHOULD lint the corners of
this range (see §5).

`relativeTo` chooses the box anchors and percentages resolve against.
`"printable"` (default) uses the printable canvas; `"media"` uses the whole
physical label *including* the unprintable margins, then shifts the result back
into canvas coordinates — which is what you want when the eye judges centring
against the sticker edge rather than the printhead's reach. Overflow checks
always run against the printable area regardless.

`autoLength` applies to **continuous** media only, where the label length is not
fixed by the paper: the canvas width becomes the content's own extent plus
`autoLengthPadMm`, so the printer feeds exactly as much tape as the design
needs. Renderers targeting die-cut/gap media ignore it.

### 1.3 Element

Common shape — geometry is a [Placement](#3-placement), data fields are
[Bindings](#4-text-bindings):

```jsonc
{ "type": "text|barcode|qr|datamatrix|image|shape|symbol", "id": "stable-id", "place": { /* Placement */ },
  "locked": false,   /* optional: interaction-freeze in editors; ignored by renderers */
  "lockX": false,    /* optional: freeze the horizontal coordinate only */
  "lockY": false,    /* optional: freeze the vertical coordinate only */
  "ink": "accent",  /* optional slot id, see §1.5 */
  "monoThreshold": 128, /* optional per-element cutoff, 1..254 */
  "rotation": 0,     /* optional: degrees clockwise about the element centre */ ... }
```

`locked` (optional boolean) is an editor-interaction hint — a locked element is
frozen against accidental move/resize/delete. `lockX` / `lockY` freeze one
coordinate each, so an element can slide along one axis while its placement on
the other stays exactly as the author set it. Renderers ignore all three, and
layout rules still resolve a locked axis normally — the flags restrict *editing*,
never adaptivity. They are carried through so a template reopens as authored.

`rotation` (optional number, degrees clockwise about the element's centre) is
baked into the rendered bitmap. Content that rasterises to hard 1-bit pixels —
bitmap fonts, barcodes, QR, Data Matrix — should only use 90° steps (editors
snap them), since other angles resample to fuzz; system-font text, images,
shapes and symbols are redrawn rather than resampled and may use any angle. Overflow checks use the element's *rotated* bounding box.

| type | data / style fields |
|------|---------------------|
| `text` | `text` (Binding), `font` (`bitmap`\|`vector`), `bitmapFont`, `fontFamily`, `bold`, `italic`, `underline`, `align` (`left`\|`center`\|`right`), `autofit` (bool), `wrap` (bool), `valign` (`top`\|`middle`\|`bottom`), `invert` (bool), `invertPad` (px) |
| `barcode` | `data` (Binding), `showText` (bool), `symbology` (see below) |
| `qr` | `data` (Binding), `ecLevel` (`L`\|`M`\|`Q`\|`H`) |
| `datamatrix` | `data` (Binding) — ECC200 |
| `image` | `src` (Binding → data URL), `mode` (`threshold`\|`bayer`\|`floyd-steinberg`), `threshold` (0..255), `invert` (bool) |
| `shape` | `shape` (`line`\|`rect`\|`ellipse`), `stroke` (px), `fill` (bool), `radius` (Dim, rect), `dash` (px, line) |
| `symbol` | `name` (Binding → bundled key), `path` (optional custom artwork, §3.3) |

For `text`/`qr`/`datamatrix`/`symbol` the size comes from `place.size`; for
`barcode`/`image`/`shape` from `place.w`/`place.h`.

**`barcode.symbology`** ∈ `code128` (default, and what an omitted value means) ·
`code39` · `ean13` · `ean8` · `upca` · `itf`. Renderers compute and append the
check digit for the GS1 symbologies, so `data` may be given with or without it;
a supplied-but-wrong check digit is an error rather than something to print.
EAN/UPC guard bars are drawn taller than the data bars.

**`shape`** is pure geometry, so its box *is* its size — which makes it the most
predictable thing for a constraint to stretch. A `line` runs along its box's
longer axis, through the centre, at `stroke` thickness; that way a box stretched
between two elements yields a rule of constant weight rather than a growing
slab.

**`text.invert`** knocks the glyphs out of a solid block (white on black),
padded by `invertPad` (default 4 px). The block is part of the element's
measured bounds, so layout, selection and overflow checks all agree.

**The text frame.** `place.w` and `place.h` are the text box, and either may be
omitted, in which case that side hugs the glyphs. A declared side is the
element's box for every purpose — selection, constraints, `relTo` references and
the overflow check all measure the same rectangle, so there is no gap between
where the text *is* and where it is *drawn*. Inside the frame the block is
placed by `align` horizontally and `valign` vertically.

`wrap` additionally turns `place.w` into a **text column**: the string breaks on
whitespace at that width and grows downwards. `autofit` shrinks the glyph size
(down to `min.size`) until the block fits whichever sides were declared — both,
if both are.

### 1.4 Authorship, licence and gallery

`author`, `description`, `tags` and `revision` are optional descriptive
metadata. `revision` is a positive integer. A missing licence is not an
implicit permission to redistribute the template.

When present, `license` is one of `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`,
`CC-BY-NC-4.0`, `CC-BY-NC-SA-4.0`, `CC-BY-ND-4.0`,
`CC-BY-NC-ND-4.0`, or `all-rights-reserved`. Importers MUST NOT invent a
licence for an unrecognised value.

`gallery` may contain one `cover` image and a bounded `shots` array. Every
image has an embedded `data:image/...;base64,...` `src`, required `alt` text,
and optional `credit`. Remote URLs are forbidden: opening a template must not
contact an author-controlled server. Importers MUST bound decoded image sizes
and the number of shots.

### 1.5 Ink slots

An optional `slots` array declares design-side colour channels independently
of any printer or roll of media:

```jsonc
{ "id": "accent", "name": "Accent", "intent": "#d00000",
  "onUnavailable": "merge" }
```

`id` follows the parameter identifier grammar. `intent` is `#rgb` or
`#rrggbb` and is used for previews and media matching. `onUnavailable` is
`merge` (retain the content in the primary channel) or `drop` (omit a
decorative or potentially misleading channel). An element's optional `ink`
field refers to a slot id. Renderers MUST preserve the element even when the
named slot is undeclared, treating it as a bare slot rather than silently
moving it to another channel.

---

## 2. Dim (a length)

Any geometry number is a **Dim**, one of:

```jsonc
42                                   // absolute canvas px
{ "u": "px", "v": 42 }               // absolute px
{ "u": "mm", "v": 5 }                // millimetres (device-agnostic)
{ "u": "%", "v": 50, "of": "w" }     // % of canvas: of ∈ w | h | min | max
{ "e": <Ast>, "src": "H - 3*mm" }    // safe expression → px (see §6); src optional
```

`mm` conversion uses the *target* canvas: `pxPerMm = canvasHeightPx /
tapeWidthMm`. This is what makes a template resolution-independent — the same
`{ "u":"mm","v":1 }` is 8px on a 96px/12mm head and 16px on a 192px/12mm head.

---

## 3. Placement

Positions an element by an **anchor** on the canvas plus a responsive offset,
and sizes it with Dims and clamps. This reflows predictably instead of drifting.

```jsonc
{
  "relTo": "other-element-id", // optional: anchor to another element's box, not the canvas
  "anchor": "br",           // canvas/reference point: tl t tr l c r bl b br  (default tl)
  "origin": "br",           // element's own reference point (default = anchor)
  "dx": { "u": "mm", "v": -2 },   // offset from the anchor, +x/+y (Dim)
  "dy": { "u": "mm", "v": -2 },
  "w":  { "u": "%", "v": 60, "of": "w" },   // size (element-type dependent)
  "h":  { "u": "%", "v": 50, "of": "h" },
  "size": { "u": "%", "v": 40, "of": "h" }, // text/qr
  "min": { "size": 6 },     // legibility / on-canvas clamps
  "max": { "size": 40 }
}
```

Resolution (given resolved element bounds `w,h` and canvas `W,H`):

```
fx(a) ∈ {l:0, c:.5, r:1}   fy(a) ∈ {t:0, c:.5, b:1}   // per anchor letter
x = W*fx(anchor) - w*fx(origin) + dx
y = H*fy(anchor) - h*fy(origin) + dy
```

So `anchor:"tr", origin:"tr", dx:{mm:-2}` keeps an element 2 mm from the right
edge at every label length.

### 3.1 Relative anchoring (`relTo`)

When `relTo` is set to another element's `id`, the base box is *that element's
resolved box* instead of the canvas. So "5 mm to the right of the barcode" is
`{ relTo:"bc", anchor:"r", origin:"l", dx:{u:"mm",v:5} }`. Resolvers must resolve
elements in dependency order (an element resolves after the one it references)
and break reference cycles by falling back to the canvas.

`relTo` moves an element as a whole and is per *element*. When you need the two
axes to follow different references — or need a *size* to be solved rather than
declared — use constraints.

### 3.2 Constraint

A constraint is a **signed distance between two anchor points along one axis**.
Each point is one of the nine anchors of an element or of the canvas.

```jsonc
{ "id": "bc-left",
  "axis": "x",                                  // x | y
  "from": { "element": "bc", "point": "l" },    // the element being placed
  "to":   { "point": "l" },                     // omit "element" to mean the canvas
  "distance": { "u": "mm", "v": 2 } }           // a Dim; from-point minus to-point
```

Per element and axis:

| constraints | effect |
|---|---|
| 0 | the element keeps its ordinary `place` |
| 1 | its **position** on that axis is solved; its size is whatever its own Dims say |
| 2 (different points) | **position *and* span** are solved — the element stretches to fit |
| 3+ | over-constrained; the extras are reported and ignored |

Everything is linear, so solving is closed-form — no iteration and no failure
modes beyond the degenerate cases above. Constraints are applied *after* an
element's own placement resolves, and override it on the axes they cover.

A solved span applies where a span is meaningful: `w`/`h` for `barcode` and
`image`, `size` for `qr`, and — on the x axis only — the column width of a
`wrap`ping `text`. A solved span on non-wrapping text is ignored, since a glyph
run's extent follows the font.

Because constraints reference other elements, resolvers must order elements by
their combined `relTo` **and** constraint dependencies, breaking cycles by
falling back to the canvas.

### 3.3 Symbol artwork

A `symbol` renders either a bundled icon (`name`) or artwork the template
carries itself (`path`, which wins if present):

```jsonc
{ "type": "symbol", "id": "hazard", "place": { ... },
  "name": "warning",
  "path": {                        // optional; overrides `name`
    "d": "M50 5L98 90H2Z",         // absolute path data, geometry only
    "viewBox": [0, 0, 100, 100],
    "fillRule": "nonzero",         // or "evenodd"
    "label": "Company mark"
  } }
```

`path.d` accepts the SVG path grammar — `M L H V C S Q T A Z`, absolute and
relative — and nothing else. It is **not** an SVG document: there is no
element tree, no `style`, no `use`, no `image`, no script, and no way to
reference anything outside the template. Authoring tools that accept an SVG
file MUST reduce it to this form (flattening transforms, converting basic
shapes, dropping everything non-geometric) at import time, so that importing a
template stays a data-validation problem — the same guarantee §6 makes for
expressions. Importers MUST reject `d` that does not parse, and SHOULD bound
its length and command count.

The artwork is fitted into a `place.size` square, preserving aspect ratio.

---

## 4. Text bindings

A bindable string field is either a plain literal or a **pre-compiled**
interpolation (an array of literal segments and expression ASTs). `{{`/`}}`
escape literal braces.

```jsonc
"PRODUCT"                                    // literal
{ "parts": [ "EUR ", { "e": <Ast for `price`> } ] }   // "EUR {price}"
```

Resolution concatenates literals with the stringified value of each `e`.

---

## 5. Adaptivity & linting

A conforming editor SHOULD resolve a template across a **size matrix** — the
`designedFor` size, common media, and the declared range corners — and flag any
element that, at some size, extends outside the canvas (`overflow`), is clipped,
or resolves empty. Publishing to a store SHOULD require an error-free report.
Anchors, `%`/`mm` sizing, `autofit`, `wrap`, constraints and `min/max` clamps are
the tools authors use to pass this check. Note that the matrix includes common
media the template was not designed for, so a template that only makes sense in
one orientation still has to *resolve safely* everywhere — shrinking or
reflowing rather than running off the canvas.

---

## 6. Expressions (safety)  <a id="safety"></a>

Expressions are **not** JavaScript. They are a small, pure, non-Turing-complete
language. Crucially, a template stores the **already-parsed AST** (plain JSON),
so importing never runs a tokenizer/parser on untrusted source — it validates a
data tree. Authoring tools parse the friendly source string (`clamp(4, W*0.1,
H)`) into this AST and can render it back.

### 6.1 AST node kinds

```
{ "t":"num",  "v": 12 }
{ "t":"str",  "v": "abc" }
{ "t":"bool", "v": true }
{ "t":"null" }
{ "t":"ident","name":"W" }
{ "t":"array","items":[Ast,...] }
{ "t":"unary","op":"-|!|+","arg":Ast }
{ "t":"binary","op":"+ - * / % ** < <= > >= == != === !==","left":Ast,"right":Ast }
{ "t":"logical","op":"&& || ??","left":Ast,"right":Ast }
{ "t":"cond","test":Ast,"then":Ast,"else":Ast }
{ "t":"member","obj":Ast,"key":"name" }     // plain-data reads only
{ "t":"index","obj":Ast,"index":Ast }
{ "t":"call","callee":"min","args":[Ast,...] }  // callee ∈ whitelist only
```

### 6.2 Whitelisted functions (the entire callable surface)

`min max abs round floor ceil sqrt pow clamp number` ·
`if` · `str len upper lower trim slice replace padStart padEnd pad`

There are **no** method calls (`x.toUpperCase()` is not grammar), no
user-defined functions, no loops, no assignment, no `new`/`this`.

### 6.3 Scope

Resolvers expose: `W`, `H` (canvas px), `mm` (px per mm), `px` (=1), `Wmm`,
`Hmm`, `corner` (the label's own die-cut corner radius in px) / `cornerMm`, and
every parameter by name. `corner` is 0 on square or continuous media; a rect
whose `radius` is `{"e": <corner>}` therefore matches the sticker it is printed
on, whichever one that turns out to be. Example: `W - 4*mm`, `min(W,H)/2`,
`qty > 1 ? qty + " pcs" : "single"`.

### 6.4 Guarantees an importer MUST enforce

1. Every AST contains only the node kinds/operators above; every `call.callee`
   is in the whitelist; no `member.key` in `{__proto__, constructor, prototype}`.
2. Size caps: element/param counts, string lengths, embedded-image bytes, and
   total AST node count are bounded.
3. The evaluator is pure, has a step budget, and reads only own-properties of
   plain objects/arrays/strings — so no scope value can reach `Function`.

A template that passes (1)–(2) is safe to resolve; the resolver enforces (3).
The reference `parseTemplate()` **normalises** input by rebuilding the document
from validated pieces, so unknown fields cannot survive import.

---

## 7. Resolving (summary)

```
resolve(template, { widthPx, heightPx, tapeWidthMm, params }) -> { design, issues }
```

Elements are resolved in dependency order (`relTo` + constraint references). For
each: build scope → resolve bindings to strings → resolve Placement Dims to px
(mm via `heightPx/tapeWidthMm`) → apply `wrap`/`autofit`/clamps → apply any
constraints for this element, solving span first and re-measuring, then position
→ emit an absolute-pixel element. The result is an ordinary label design consumed
by the normal rasterizer/printer path, unchanged.

Each `Dim` carrying an expression MAY also carry `"src"`, the human-readable
source it was parsed from. Resolvers MUST ignore `src` and evaluate only `e`;
editors use it to show and round-trip what the author typed.
