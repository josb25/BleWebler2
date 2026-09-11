# Printer protocol sources

BleWebler2 implements printer interoperability from publicly documented wire
formats, independently observed protocol facts, and licence-compatible test
vectors. This ledger records the provenance of each implementation. It is not a
claim that the referenced projects endorse BleWebler2.

No proprietary application, firmware, capture, or third-party source tree is
redistributed in this repository. When a reference has a copyleft licence, only
uncopyrightable protocol facts and public documentation are used; its source
code is not copied into BleWebler2.

## Catprinter / Tiny `51 78`

Implementation: `packages/core/src/drivers/catprinter`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [NaitLee/Cat-Printer `commander.py`](https://github.com/NaitLee/Cat-Printer/blob/dc04283b84cf176469453aef511b8e19fc337d8b/printer_lib/commander.py) | `dc04283`, CC0-1.0 | Packet framing, CRC-8 parameters, little-endian energy/feed values, command meanings, lattice markers, LSB-first row data, and pause/resume notifications. |
| [rbaron/catprinter](https://github.com/rbaron/catprinter/tree/20fe5b7a9f8ee4e42874a06a09f9fc3e8dc1969f) | `20fe5b7`, MIT | 384-dot geometry, BLE pacing, RLE/raw row selection, and print-job ordering. |
| [TiMini-Print protocol suite](https://github.com/Dejniel/TiMini-Print/tree/f4b6e8275715b1a174ce24b59f52e9b9d3184c6d) | `f4b6e82`, Apache-2.0 | Independent packet/golden-vector corroboration, the `12 51 78` dialect, and model/dialect associations. |
| [OpenTLP Tiny family](https://josb25.github.io/opentlp/tiny.html) | live catalogue, CC0-1.0 data | Cross-project protocol summary and model catalogue. |

The TypeScript implementation in BleWebler2 was written for its existing
`IPrinterDriver` and transport contracts. Tests contain short protocol vectors
derived from the public byte format and independently reproduced by the sources
above.

## Phomemo D/Q rotated ESC/POS

Implementation: `packages/core/src/drivers/phomemo`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`, MIT | FF00/FF02/FF03 GATT layout, D/Q model grouping, 128-byte pacing, heat-time table, media selection, clockwise raster orientation, GS v 0 framing and end command. |
| [Phomemo D35 product page](https://phomemo.com/ja-ca/products/only-canada-d35-portable-bluetooth-labels-maker) | vendor documentation | 6–15 mm stock range and 203 dpi specification. |
| [Phomemo D50 media catalogue](https://phomemo.com/products/d50-labels-collection) | vendor documentation | 16–24 mm stock range. |

The implementation is a fresh TypeScript expression of the documented wire
facts. No third-party implementation files or assets are included. The driver
is explicitly marked untested pending reports or captures from physical units.

## Phomemo M110/M120/M220

Implementation: `packages/core/src/drivers/phomemo/phomemo-m110-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [phomemo-tools protocol documentation](https://github.com/vivier/phomemo-tools/blob/master/README.md#5-protocol-for-m110m120m220) | public documentation, GPL-3.0 | Captured speed/density ranges, three media values, GS v 0 dimensions, 43-byte M110 sample width, footer, and the M110/M120/M220 family association. Protocol facts only; no GPL source code copied. |
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`, MIT | FF00/FF02/FF03 GATT layout, BLE pacing, model metadata and an independent implementation of the job sequence. |

The 344-dot M110/M120 width follows the captured 43-byte row in the protocol
documentation. Public implementations disagree and one uses 384 dots, so the
profiles remain explicitly untested. M220 uses its separately documented
72 mm/576-dot model width with the same command family.

## Phomemo M02

Implementation: `packages/core/src/drivers/phomemo/phomemo-m02-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [phomemo-tools M02 protocol documentation](https://github.com/vivier/phomemo-tools/blob/master/README.md#4-protocol-for-m02) | public documentation, GPL-3.0 | M02/M02S/M02 Pro support, GS v 0 framing, MSB-first 48-byte rows and captured status/footer facts. Protocol facts only; no GPL source code copied. |
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`, MIT | M02 wake prefix, FF00 GATT transport, density setup, 128-byte pacing, minimal feed and M02X/Pro model metadata. |

The Pro profile uses 78 whole bytes (624 dots) per row. A public README calls
the geometry 626 dots, which cannot be represented by that row width; the
protocol-aligned value is used pending hardware validation.

## Phomemo general M-series

Implementation: `packages/core/src/drivers/phomemo/phomemo-m-series-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`, MIT | FF00 GATT transport, M03/T02/M200/M221/M250/M260 model widths, initialise/heat/density/raster/feed order and 128-byte pacing. |

M220 is intentionally excluded from this driver: captured protocol
documentation groups it with M110/M120 and BleWebler2 follows that stronger
evidence rather than registering the same retail name under two wire protocols.

## Researched but not yet implemented

- [MXW01 protocol specification](https://github.com/jeremy46231/MXW01-catprinter/blob/main/PROTOCOL.md), which documents the related but distinct V5X/MXW01 bulk-raster flow.
- Additional [Phomymo](https://github.com/transcriptionstream/phomymo) families: M02, M04, M110, generic M-series, P12/A30 and TSPL.
- [phomemo-tools](https://github.com/vivier/phomemo-tools), GPL-3.0, for public Phomemo protocol documentation only. No source code from this project is copied.
