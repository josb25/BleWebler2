# Driver folder contract

Every immediate subfolder in this directory is one independently portable wire-protocol driver. A folder contains everything specific to that protocol: driver classes, model and rebrand profiles, packet builders, raster conversion, tests, and an `index.ts` entry point.

A driver folder may import the shared core contracts, universal page and media types, transports, and dependencies declared by `packages/core/package.json`. It must never import implementation code from another driver folder. Small encoding routines are intentionally kept local so that copying or removing one driver cannot silently change another.

Models and rebrands that use the same wire protocol belong in the same folder as profiles or aliases. A different marketing name alone is not a reason to duplicate a driver.

For example:

```text
drivers/peripage/
  index.ts
  peripage-driver.ts
  peripage-protocol.ts
  peripage-raster.ts
  *.spec.ts
```

The repository-wide boundary test rejects sibling-driver imports and missing folder entry points.

## Implementing `IPrinterDriver`

A basic driver class looks like this. Consumers import it through the folder's `index.ts`, not its private files.

```typescript
import { IPrinterDriver, IDeviceTransport } from "universal-label-core";

export class CustomDriver implements IPrinterDriver {
  readonly name = "Generic-Label-100";
  readonly driverType = 'hardware'; // 'hardware' | 'virtual'

  readonly connectionRequirements = {
    // The Bluetooth Service UUIDs required to discover this printer
    services: ["0000ffff-0000-1000-8000-00805f9b34fb"]
  };

  isCompatible(deviceName: string): boolean {
    return deviceName.startsWith("GL100");
  }

  async bindTransport(transport: IDeviceTransport): Promise<void> {
      // Setup notifications listeners, store transport pointers
  }

  async unbindTransport(): Promise<void> {
      // REQUIRED cleanup phase to release BLE event hook references 
  }

  getCapabilities() {
    return {
      maxDensity: 5,
      printWidthPx: 384,
      supportsSpeedMode: false,
      colorSupport: { type: 'grayscale', shades: 2 },
      dpi: 203,
      driverName: this.name
    };
  }

  async printInit(options: UniversalPrintOptions) { 
      /* handshake initialization bytes */ 
  }
  
  async printPage(image: UniversalImageData) { 
      /* transmit payload */ 
  }
  
  async printEnd() { 
      /* final job feeds */ 
  }
}
```

The folder entry point should expose only its supported public surface:

```typescript
export { CustomDriver, CUSTOM_MODELS } from './custom-driver';
```

## Bundling the Driver

The folder works without any other driver folder. To include it in BleWebler2's built-in catalogue, register it in `PrintManager`. The list is explicit because this core runs in browsers, Node.js, Capacitor, and Electron, where runtime filesystem discovery is not portable.

Edit `src/core/print-manager.ts` and add your driver to the constructor:

```typescript
import { CustomDriver } from "../drivers/custom";

constructor() {
    super();
    // Monolithic bundling: auto-register bundled drivers
    this.registerDriver(new MarklifeDriver());
    this.registerDriver(new NiimbotDriver());
    this.registerDriver(new CustomDriver()); // <-- Add your driver here
    this.registerDriver(new DummyDriver());
}
```
