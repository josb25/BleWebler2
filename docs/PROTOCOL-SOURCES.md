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

## Catprinter V5X / MXW01 `22 21`

Implementation: `packages/core/src/drivers/catprinter/mxw01-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [jeremy46231/MXW01-catprinter protocol](https://github.com/jeremy46231/MXW01-catprinter/blob/0744587459fbe9644b4a2295c9a3ecb06b12d5cc/PROTOCOL.md) | `0744587`, MIT | AE30/AE01/AE02/AE03 GATT layout, `22 21` packet framing and CRC, A2/A9/AD flow, 384-dot LSB-first bulk raster, 90-row minimum and acknowledgement semantics. |
| [clementvp/mxw01-thermal-printer](https://github.com/clementvp/mxw01-thermal-printer/tree/ead9a022f0de96b96844ea0e8737bbfdda0518ef) | `ead9a02`, MIT in package metadata | Independent TypeScript corroboration of framing, print flow, raster padding and characteristic separation. Protocol facts only; no source copied. |
| [TiMini-Print](https://github.com/Dejniel/TiMini-Print/tree/a9a456c4243132bad52c500e39bdec221fe98db9) | `a9a456c`, Apache-2.0 | V5X family association and advertised clone-name catalogue. |

V5X is deliberately a separate driver from Tiny: it sends control packets on
AE01 but raw image rows on AE03, and its `22 21` framing is incompatible with
both Tiny dialects. The implementation is newly written against BleWebler2's
driver contracts; no third-party source or assets are redistributed.

## Catprinter V5G `51 78`

Implementation: `packages/core/src/drivers/catprinter/v5g-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [TiMini-Print](https://github.com/Dejniel/TiMini-Print/tree/a9a456c4243132bad52c500e39bdec221fe98db9) | `a9a456c`, Apache-2.0 | V5G packet prefix, F2 density payload, job command order, A2 LSB-first 384-dot rows, AE30/AE01/AE02 transport, pacing and advertised-name family associations. |

V5G shares the `51 78` envelope and many advertised names with hardware that
uses the Tiny or V5X command flow. Those observations cannot identify one wire
protocol by name and GATT service alone, so automatic selection remains
ambiguous and the user-facing driver-family choice is the fallback. The basic
monochrome implementation is newly written for BleWebler2; TiMini-Print source
code, adaptive thermal-control logic and compression code are not copied.

## Catprinter V5C / YTB01 `56 88`

Implementation: `packages/core/src/drivers/catprinter/v5c-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [TiMini-Print](https://github.com/Dejniel/TiMini-Print/tree/a9a456c4243132bad52c500e39bdec221fe98db9) | `a9a456c`, Apache-2.0 | YTB01 family association, `56 88` framing, CRC, connection/status packets, three-state density and mode settings, A4 raw rows, A6 finish command, AE30 endpoints, pacing and pause/resume notifications. |

The monochrome implementation was written against BleWebler2's driver and
transport contracts. It does not copy TiMini-Print source, LZO compression or
status-controller code; only the documented packet facts and short conformance
vectors are used.

## Funny Print LX-D / BH-01

Implementation: `packages/core/src/drivers/catprinter/funny-lx-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [TiMini-Print Funny LX family](https://github.com/Dejniel/TiMini-Print/tree/a9a456c4243132bad52c500e39bdec221fe98db9/timiniprint/protocol/families/funny_lx) | `a9a456c`, Apache-2.0 | FFE6/FFE1/FFE2 GATT layout, status/MAC exchange, CRC-16/XMODEM challenge flow and vectors, darkness command, 384-dot MSB-first raster, 100-byte indexed packets, retry/delay/ready notifications, footer acknowledgement and LX-D/BH-01 name association. |

The TypeScript encoder, authentication state and notification queue are newly
written against BleWebler2's transport contract. No TiMini-Print source code is
copied. Support is limited to its hardware-observed direct LX-D variant; other
Funny Print device types remain excluded.

## Phomemo D/Q rotated ESC/POS

Implementation: `packages/core/src/drivers/phomemo`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`; conflicting MIT/ISC metadata, no licence file | FF00/FF02/FF03 GATT layout, D/Q model grouping, 128-byte pacing, heat-time table, media selection, clockwise raster orientation, GS v 0 framing and end command. Protocol facts only; no source code copied. |
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
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`; conflicting MIT/ISC metadata, no licence file | FF00/FF02/FF03 GATT layout, BLE pacing, model metadata and an independent implementation of the job sequence. Protocol facts only; no source code copied. |

The 344-dot M110/M120 width follows the captured 43-byte row in the protocol
documentation. Public implementations disagree and one uses 384 dots, so the
profiles remain explicitly untested. M220 uses its separately documented
72 mm/576-dot model width with the same command family.

## Phomemo M02

Implementation: `packages/core/src/drivers/phomemo/phomemo-m02-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [phomemo-tools M02 protocol documentation](https://github.com/vivier/phomemo-tools/blob/master/README.md#4-protocol-for-m02) | public documentation, GPL-3.0 | M02/M02S/M02 Pro support, GS v 0 framing, MSB-first 48-byte rows and captured status/footer facts. Protocol facts only; no GPL source code copied. |
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`; conflicting MIT/ISC metadata, no licence file | M02 wake prefix, FF00 GATT transport, density setup, 128-byte pacing, minimal feed and M02X/Pro model metadata. Protocol facts only; no source code copied. |

The Pro profile uses 78 whole bytes (624 dots) per row. A public README calls
the geometry 626 dots, which cannot be represented by that row width; the
protocol-aligned value is used pending hardware validation.

## Phomemo general M-series

Implementation: `packages/core/src/drivers/phomemo/phomemo-m-series-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`; conflicting MIT/ISC metadata, no licence file | FF00 GATT transport, M03/T02/M200/M221/M250/M260 model widths, initialise/heat/density/raster/feed order and 128-byte pacing. Protocol facts only; no source code copied. |

M220 is intentionally excluded from this driver: captured protocol
documentation groups it with M110/M120 and BleWebler2 follows that stronger
evidence rather than registering the same retail name under two wire protocols.

## Phomemo P12/P12 Pro/A30

Implementation: `packages/core/src/drivers/phomemo/phomemo-p12-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [soburi/phomemo_p12](https://github.com/soburi/phomemo_p12/tree/3c1bf0d4237c92321a51f600c66bdc0b5640e529) | `3c1bf0d`, MIT | P12 setup exchange and response pacing, raster flow and tape-feed behaviour. |
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`; conflicting MIT/ISC metadata, no licence file | A30 association and 120-dot profile, FF00 GATT transport, setup packet grouping and BLE pacing. Protocol facts only; no source code copied. |

The retail name `P12` is also used by incompatible Marklife hardware. Automatic
detection therefore refuses to choose when both name and shared FF00 service
remain ambiguous; the user must select the Phomemo P12/A30 family explicitly.

## Phomemo M04S/M04AS

Implementation: `packages/core/src/drivers/phomemo/phomemo-m04-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`; conflicting MIT/ISC metadata, no licence file | FF00 GATT transport, captured proprietary setup commands, raw compression mode, 53/80/110 mm raster widths, 256-byte pacing and feed sequence. Its M04 implementation records successful M04AS hardware testing in issue 23. Protocol facts only; no source code copied. |
| [Phomemo M04AS product documentation](https://phomemo.com/products/m04as) | vendor documentation | M04AS media sizes and 300/304 dpi product specification. |

The driver advertises the widest mechanism to the editor and chooses one of the
captured 600/896/1232-dot raster profiles from the paper selected for each job.
This keeps the protocol decision inside the driver without creating three
ambiguous Bluetooth drivers for one physical printer. The local implementation
is a fresh TypeScript expression of the documented wire facts; no third-party
source or assets are included.

## Phomemo PM-241 / TSPL

Implementation: `packages/core/src/drivers/phomemo/phomemo-tspl-driver.ts`

| Reference | Revision/licence | Facts used |
| --- | --- | --- |
| [TSC TSPL/TSPL2 Programming Manual 3.0](https://fs.tscprinters.com/system/files/31-0000001-00_tspl_tspl2_programming_3_0.pdf) | vendor programming specification | SIZE, GAP, OFFSET, DENSITY, SPEED, DIRECTION, CLS, BITMAP and PRINT syntax; BITMAP dimensions and overwrite mode. |
| [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo/tree/1f58d3f0e7f941b9143277cda828380149e56855) | `1f58d3f`; conflicting MIT/ISC metadata, no licence file | PM-241/PM-241-BT TSPL association, 102-byte/816-dot raster width, USB use, bitmap polarity and pacing. Protocol facts only; no source code copied. |
| [Phomemo PM-241-BT support centre](https://phomemo.com/en-ca/pages/pm-241-bt-support-center-1) | vendor documentation | PM-241-BT USB connection and product support identity. |

The TSPL encoder is written from the vendor command specification. It uses the
existing transport abstraction, so USB and native Bluetooth Classic can carry
the same byte stream; Web Bluetooth cannot reach a Classic-only device.

## Researched but not yet implemented

- [phomemo-tools](https://github.com/vivier/phomemo-tools), GPL-3.0, for public Phomemo protocol documentation only. No source code from this project is copied.
