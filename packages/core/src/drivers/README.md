# Adding a New Printer Driver

Adding a new printer involves creating a class in this directory that implements the strictly enforced `IPrinterDriver` type contract. The `PrintManager` acts as the central orchestrator, and all bundled drivers must be registered there.

## Implementing `IPrinterDriver`

A basic structure for a new driver looks like this:

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

## Registering the Driver

Once your driver is implemented, you must register it in the `PrintManager` so that it can be automatically detected when a user connects via Bluetooth.

Edit `src/core/print-manager.ts` and add your driver to the constructor:

```typescript
import { CustomDriver } from "../drivers/custom/custom-driver";

constructor() {
    super();
    // Monolithic bundling: auto-register bundled drivers
    this.registerDriver(new MarklifeDriver());
    this.registerDriver(new NiimbotDriver());
    this.registerDriver(new CustomDriver()); // <-- Add your driver here
    this.registerDriver(new DummyDriver());
}
```
