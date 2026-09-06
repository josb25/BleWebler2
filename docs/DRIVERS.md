# Drivers

BleWebler2 separates label rendering, device transport, and printer protocol handling. A driver implements the exported `IPrinterDriver` contract from `universal-label-core`; an application registers it with `PrintManager.registerDriver()`.

All drivers maintained by BleWebler2 belong in the single `universal-label-core` package. Marklife, Niimbot, and the virtual printer are built in and tested through the same print pipeline as the application. New first-party manufacturers extend this package rather than creating another package that users must discover, version, and combine.

## Community extension boundary

The public contract remains extensible so experiments and independently maintained integrations are not blocked. An external driver should:

- depend only on documented exports from `universal-label-core`;
- implement `IPrinterDriver` without owning discovery or platform permissions;
- declare accurate name, service, model, media, colour, and resolution capabilities;
- accept `UniversalPage` data and keep protocol encoding inside the driver package;
- include protocol, raster, matching, cancellation, and error-path tests;
- carry an explicit licence and third-party provenance record; and
- avoid registering itself as a side effect of import.

Applications remain in control of composition:

```ts
import { PrintManager } from 'universal-label-core';
import { MyPrinterDriver } from '<driver-package>';

const manager = new PrintManager();
manager.registerDriver(new MyPrinterDriver());
```

## Repository policy

Drivers offered as part of BleWebler2 live under `packages/core/src/drivers` and are released at the core package's version. Runtime-specific BLE, USB, and serial bindings remain optional peer dependencies behind transport subpath exports; this keeps one driver package without forcing browser consumers to install Node native modules.

An independent driver package is an escape hatch for a separate maintainer, experimental protocol, or incompatible release cadence—not the default project structure. The default application must not require a separately released first-party driver, so a normal clone remains buildable and reproducible.

An external driver's licence need not be MIT, but it must permit its intended distribution and must not impose incompatible terms on the core application. See [Licensing](../LICENSING.md) before adding one to a release build.
