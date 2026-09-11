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

## Researched but not yet implemented

- [MXW01 protocol specification](https://github.com/jeremy46231/MXW01-catprinter/blob/main/PROTOCOL.md), which documents the related but distinct V5X/MXW01 bulk-raster flow.
- [Phomymo](https://github.com/transcriptionstream/phomymo), MIT, for Phomemo model groupings and Web Bluetooth protocol research.
- [phomemo-tools](https://github.com/vivier/phomemo-tools), GPL-3.0, for public Phomemo protocol documentation only. No source code from this project is copied.

