# Driver packages

BleWebler2 separates label rendering, device transport, and printer protocol handling. A driver implements the exported `IPrinterDriver` contract from `universal-label-core`; an application registers it with `PrintManager.registerDriver()`.

Marklife and Niimbot are built into the core package and tested through the same print pipeline as the application.

## External driver boundary

A separately maintained driver should:

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

New drivers can begin in this monorepo while their API is changing. A driver is a good candidate for an independent repository when it has a separate maintainer or release cadence, usable hardware tests, and no imports from core internals. The main repository should consume released packages rather than Git submodules for drivers required by the default application, so a normal clone remains buildable and reproducible.

An external driver's licence need not be MIT, but it must permit its intended distribution and must not impose incompatible terms on the core application. See [Licensing](../LICENSING.md) before adding one to a release build.
