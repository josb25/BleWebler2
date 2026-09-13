# Universal Label Core

The printer-agnostic runtime behind BleWebler2. It separates byte transport, printer protocol encoding, and print orchestration so the renderer and interface do not depend on one manufacturer.

## Install

```sh
npm install universal-label-core
```

All first-party drivers ship together in this package. Marklife, Niimbot, Catprinter, Phomemo, PeriPage, and the virtual printer therefore share one driver contract, one version, and one test pipeline; consumers do not assemble a set of manufacturer packages.

## Architecture

- `IDeviceTransport` moves bytes and reports connection state without interpreting printer commands.
- `IPrinterDriver` matches hardware, describes capabilities, and turns a `UniversalPage` into protocol operations.
- `PrintManager` connects the two, resolves the driver, and owns print-job state.

The bundled hardware families and virtual printer are registered by default. Applications can register an external driver explicitly with `PrintManager.registerDriver()`.

## Runtime-specific transports

Import transports through subpath exports so a browser build never loads Node.js native modules.

| Environment | Import | Class |
| --- | --- | --- |
| Web Bluetooth | `universal-label-core/transport/web` | `UniversalBluetoothTransport` |
| WebUSB | `universal-label-core/transport/usb` | `WebUsbTransport` |
| Web Serial | `universal-label-core/transport/web-serial` | `WebSerialTransport` |
| Capacitor BLE | `universal-label-core/transport/capacitor` | `CapacitorBleTransport` |
| Capacitor USB serial | `universal-label-core/transport/capacitor-usb` | `CapacitorUsbTransport` |
| Capacitor Android RFCOMM | `universal-label-core/transport/capacitor-classic` | `CapacitorClassicTransport` |
| Node.js BLE | `universal-label-core/transport/node` | `NodeBleTransport` |
| Node.js USB | `universal-label-core/transport/node-usb` | `NodeUsbTransport` |
| Node.js serial | `universal-label-core/transport/node-serial` | `NodeSerialTransport` |

Platform bindings are optional peer dependencies. Install only the binding required by the chosen transport:

| Transport | Additional dependency |
| --- | --- |
| Capacitor BLE | `@capacitor/core` and `@capacitor-community/bluetooth-le` |
| Capacitor USB serial | `@capacitor/core` and `@leeskies/capacitor-usb-serial` |
| Node.js BLE | `@stoprocent/noble` |
| Node.js USB | `usb` |
| Node.js serial | `serialport` |

Web transports and the virtual transport need no native binding. Capacitor Android RFCOMM uses BleWebler2's small app-owned native plugin because Capacitor has no standard Classic Bluetooth transport contract.

## Basic connection

```ts
import { PrintManager } from 'universal-label-core';
import { UniversalBluetoothTransport } from 'universal-label-core/transport/web';

const manager = new PrintManager();
await manager.connect(new UniversalBluetoothTransport());

const capabilities = manager.getCapabilities();
```

Printing accepts a renderer-produced `UniversalPage` and `UniversalPrintOptions`. See the renderer and web application for the complete raster-to-print flow.

## Extending the core

- [Driver architecture](../../docs/DRIVERS.md)
- [Driver implementation notes](src/drivers/README.md)
- [Root project documentation](../../README.md)
