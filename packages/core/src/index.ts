import { PrintManager as _PrintManager } from "./core/print-manager";
export type PrintManager = _PrintManager;
export const PrintManager = _PrintManager;
export type { PrinterDriverChoice } from "./core/print-manager";

// Interfaces (transport + driver contracts — always safe to import)
export * from "./core/transports/transport.interface";
export * from "./drivers/driver.interface";
// Printer artwork: the picture of each model and what its parts can do.
export * from "./drivers/printer-artwork";
export * from "./drivers/printer-status";
export * from "./drivers/printer-error";
export { MARKLIFE_ARTWORK, MARKLIFE_P12_ARTWORK, MARKLIFE_P50_ARTWORK, marklifeArtwork } from "./drivers/marklife/artwork";
export * from "./types/paper";
export * from "./types/ink";
// Drivers
import { MarklifeDriver as _MarklifeDriver, MARKLIFE_PROFILES } from "./drivers/marklife/marklife-driver";
export type MarklifeDriver = _MarklifeDriver;
export const MarklifeDriver = _MarklifeDriver;
export { MARKLIFE_PROFILES };

import { CatPrinterDriver as _CatPrinterDriver, CATPRINTER_MODELS } from "./drivers/catprinter/catprinter-driver";
export type CatPrinterDriver = _CatPrinterDriver;
export const CatPrinterDriver = _CatPrinterDriver;
export { CATPRINTER_MODELS };

import { PhomemoDqDriver as _PhomemoDqDriver, PHOMEMO_DQ_MODELS } from "./drivers/phomemo/phomemo-dq-driver";
export type PhomemoDqDriver = _PhomemoDqDriver;
export const PhomemoDqDriver = _PhomemoDqDriver;
export { PHOMEMO_DQ_MODELS };

import { PhomemoM110Driver as _PhomemoM110Driver, PHOMEMO_M110_MODELS } from "./drivers/phomemo/phomemo-m110-driver";
export type PhomemoM110Driver = _PhomemoM110Driver;
export const PhomemoM110Driver = _PhomemoM110Driver;
export { PHOMEMO_M110_MODELS };

import { PhomemoM02Driver as _PhomemoM02Driver, PHOMEMO_M02_MODELS } from "./drivers/phomemo/phomemo-m02-driver";
export type PhomemoM02Driver = _PhomemoM02Driver;
export const PhomemoM02Driver = _PhomemoM02Driver;
export { PHOMEMO_M02_MODELS };

import { PhomemoMSeriesDriver as _PhomemoMSeriesDriver, PHOMEMO_M_SERIES_MODELS } from "./drivers/phomemo/phomemo-m-series-driver";
export type PhomemoMSeriesDriver = _PhomemoMSeriesDriver;
export const PhomemoMSeriesDriver = _PhomemoMSeriesDriver;
export { PHOMEMO_M_SERIES_MODELS };

import { PhomemoP12Driver as _PhomemoP12Driver, PHOMEMO_P12_MODELS } from "./drivers/phomemo/phomemo-p12-driver";
export type PhomemoP12Driver = _PhomemoP12Driver;
export const PhomemoP12Driver = _PhomemoP12Driver;
export { PHOMEMO_P12_MODELS };

import { NiimbotDriver as _NiimbotDriver } from "./drivers/niimbot/niimbot-driver";
export type NiimbotDriver = _NiimbotDriver;
export const NiimbotDriver = _NiimbotDriver;

import { DummyDriver as _DummyDriver } from "./drivers/dummy/dummy-driver";
export type DummyDriver = _DummyDriver;
export const DummyDriver = _DummyDriver;

// NOTE: Transports are NOT exported from the main index to prevent cross-environment
// bundling failures (e.g. Node BLE native bindings breaking web builds).
// Import the transport you need via its dedicated subpath:
//   import { NodeBleTransport }       from "universal-label-core/transport/node"
//   import { BluetoothTransport }     from "universal-label-core/transport/web"
//   import { CapacitorBleTransport }  from "universal-label-core/transport/capacitor"
//   import { CapacitorUsbTransport }  from "universal-label-core/transport/capacitor-usb"
//   import { CapacitorClassicTransport } from "universal-label-core/transport/capacitor-classic"
//   import { WebUsbTransport }        from "universal-label-core/transport/usb"
//   import { WebSerialTransport }     from "universal-label-core/transport/web-serial"
//   import { NodeUsbTransport }       from "universal-label-core/transport/node-usb"
//   import { NodeSerialTransport }    from "universal-label-core/transport/node-serial"
//   import { DummyTransport }         from "universal-label-core/transport/dummy"
