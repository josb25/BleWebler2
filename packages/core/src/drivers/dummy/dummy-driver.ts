import { IPrinterDriver, PrinterCapabilities, UniversalPrintOptions, UniversalImageData } from "../driver.interface";
import { singlePlane, type UniversalPage } from "../../types/ink";
import { IDeviceTransport } from "../../core/transports/transport.interface";
import type {
    PrinterStatus, StatusField, BatteryStatus, LoadedMedia, PrinterFault
} from "../printer-status";
import { PrinterError } from "../printer-error";

/**
 * A virtual/dummy printer driver that acts as a physical printer but instead
 * prints the incoming byte buffer out to the browser console.
 * Very useful for debugging designer alignment, UI issues, and canvas mapping.
 */
export class DummyDriver implements IPrinterDriver {
    public readonly name = "Virtual-Dummy-Printer";
    public readonly driverType = 'virtual' as const;
    public readonly connectionRequirements = {
        services: [] as string[]
    };

    // Offline simulation profiles for generic printheads. Values are kept in
    // step with the live getCapabilities() below (head-to-cutter, feed range)
    // so simulated and connected caps agree.
    public readonly supportedModels = [
        {
            id: 'generic_12mm',
            brand: 'Generic',
            model: '12mm / 15mm Printer (96px)',
            capabilities: { canvasHeightPx: 96, dpmm: 8, maxDensity: 15, supportsSpeedMode: false, colorSupport: { type: 'monochrome' } as const, physical: {  } }
        },
        {
            id: 'generic_50mm',
            brand: 'Generic',
            model: '50mm Printer (384px)',
            capabilities: { canvasHeightPx: 384, dpmm: 8, maxDensity: 15, supportsSpeedMode: false, colorSupport: { type: 'monochrome' } as const, physical: {  } }
        },
        {
            id: 'generic_80mm',
            brand: 'Generic',
            model: '80mm Printer (576px)',
            capabilities: { canvasHeightPx: 576, dpmm: 8, maxDensity: 15, supportsSpeedMode: false, colorSupport: { type: 'monochrome' } as const, physical: {  } }
        }
    ];

    /**
     * The virtual printer reports everything, because its job is to stand in
     * for hardware nobody has on the desk. Without this there is no way to see
     * a battery gauge, a media row or a fault banner without owning the
     * specific printer that produces one — which means those paths only ever
     * get exercised by the people least able to debug them.
     */
    public readonly reports = [
        'battery', 'charging', 'deviceName', 'serialNumber',
        'firmwareVersion', 'hardwareVersion', 'media', 'faults'
    ] as const satisfies readonly StatusField[];

    private transport: IDeviceTransport | null = null;
    private options: UniversalPrintOptions | null = null;

    /**
     * Simulated readings. Mutable so a caller can stage a low battery, an empty
     * roll or an open cover and watch the interface react — the whole point of
     * a simulator being that failure states are reachable on demand rather than
     * only when real hardware happens to fail.
     */
    private simulated: { battery: BatteryStatus; media: LoadedMedia; faults: PrinterFault[] } = {
        battery: { level: 0.82, charging: false },
        media: { kind: 'gap', widthMm: 15, lengthMm: 30, remaining: 120, name: 'Virtual roll' },
        faults: []
    };

    /** Stage a state for the virtual printer to report. */
    public setSimulatedStatus(patch: Partial<typeof this.simulated>): void {
        this.simulated = { ...this.simulated, ...patch };
    }

    public async getStatus(): Promise<PrinterStatus> {
        if (!this.transport) {
            throw new PrinterError('not-connected', 'Virtual printer not connected.');
        }
        return {
            identity: {
                deviceName: this.transport.getDeviceName(),
                // Fixed, obviously fake values. A plausible-looking serial would
                // eventually be pasted into a bug report as if it were real.
                serialNumber: 'VIRTUAL-0000-0000',
                firmwareVersion: '0.0.0-virtual',
                hardwareVersion: 'virtual'
            },
            battery: { ...this.simulated.battery },
            media: { ...this.simulated.media },
            faults: this.simulated.faults.map(f => ({ ...f })),
            details: [
                { id: 'simulator', label: 'Driver detail', value: 'Virtual printer' }
            ],
            readAt: Date.now()
        };
    }

    public isCompatible(deviceName: string): boolean {
        // We'll let this trigger if the user pairs to a device named "Dummy" or "Virtual"
        const lower = deviceName.toLowerCase();
        return lower.includes("dummy") || lower.includes("virtual");
    }

    public async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        console.log(`[DummyDriver] Bound to virtual transport for ${transport.getDeviceName()}`);
    }

    private canvasHeightPx: number = 96;
    private maxDensity: number = 5;
    private dpmm: number = 8;
    private colorSupport: { type: 'color' | 'grayscale' | 'monochrome', shades?: number } = { type: 'color', shades: 16777216 };

    public setConfig(height: number, density: number, dpmm: number = 8, colorSupport: { type: 'color' | 'grayscale' | 'monochrome', shades?: number } = { type: 'color', shades: 16777216 }) {
        this.canvasHeightPx = height;
        this.maxDensity = density;
        this.dpmm = dpmm;
        this.colorSupport = colorSupport;
    }

    public getCapabilities(): PrinterCapabilities {
        return {
            maxDensity: this.maxDensity,
            canvasHeightPx: this.canvasHeightPx,
            colorSupport: this.colorSupport,
            supportsSpeedMode: false,
            dpmm: this.dpmm,
            driverName: this.name,
            physical: {

            },
            mediaDefaults: {
                feedBeforeMinPx: 0,
                feedBeforeMaxPx: 200,
                feedBeforeDefaultPx: 0,
                feedAfterMinPx: 0,
                feedAfterMaxPx: 200,
                feedAfterDefaultPx: 40
            }
        };
    }

    public async printInit(options: UniversalPrintOptions): Promise<void> {
        this.options = options;
        console.log(`[DummyDriver] Print Initialized. Options:`, options);
    }

    public async printPage(page: UniversalPage): Promise<void> {
        const image = singlePlane(page);
        const { data: imageData, width, height } = image;
        console.log(`[DummyDriver] Receiving Page Data... Width: ${width}px, Height: ${height}px`);
        console.log(`[DummyDriver] Payload Size: ${imageData.length} bytes`);

        // Generate an ASCII preview
        // We'll scale down to max 80 columns so it fits nicely in standard consoles
        const scaleDown = Math.max(1, Math.ceil(width / 80));
        const asciiCols = Math.floor(width / scaleDown);
        const asciiRows = Math.floor(height / scaleDown);
        let asciiArt = `--- ASCII Preview (${asciiCols}x${asciiRows}) ---\n`;
        
        for (let y = 0; y < asciiRows; y++) {
            let rowStr = '';
            for (let x = 0; x < asciiCols; x++) {
                // sample the center of the block
                const srcX = Math.floor((x + 0.5) * scaleDown);
                const srcY = Math.floor((y + 0.5) * scaleDown);
                const idx = (srcY * width + srcX) * 4;
                const r = imageData[idx];
                const g = imageData[idx + 1];
                const b = imageData[idx + 2];
                
                // If it's dark, print a block. If white, print a space.
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                rowStr += (lum < 128) ? '█' : '░';
            }
            asciiArt += rowStr + '\n';
        }
        asciiArt += `-------------------------------`;
        console.log(asciiArt);

        // For pixel-perfect preview, we can render the raw imageData to an offscreen canvas,
        // convert it to a data URI, and print it to the console using CSS backgrounds!
        let dataUrl: string | null = null;

        // This requires DOM access, so this visual feature only works in Browser environments
        if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // We wrap raw RGBA pixel data
                let imageDataObj: ImageData;
                if (typeof ImageData !== "undefined") {
                    imageDataObj = new ImageData(new Uint8ClampedArray(imageData), width, height);
                } else {
                    imageDataObj = { data: imageData, width, height, colorSpace: "srgb" } as any;
                }

                ctx.putImageData(imageDataObj, 0, 0);
                dataUrl = canvas.toDataURL();
            }
        }

        if (dataUrl) {
            const scale = 1;
            const style = [
                `display: block`,
                `font-size: 0px`,
                `line-height: 0px`,
                `color: transparent`,
                `padding: ${height * scale / 2}px ${width * scale / 2}px`,
                `background-image: url(${dataUrl})`,
                `background-size: ${width * scale}px ${height * scale}px`,
                `background-repeat: no-repeat`,
                // Add a border and shadow so it stands out from the console background
                `border: 1px solid #888`,
                `box-shadow: 0 4px 8px rgba(0,0,0,0.3)`
            ].join(';');

            console.log('%c ', style);
        } else {
            console.log("[DummyDriver] Image received; the raster is shown above as text.");
        }
    }

    public async printEnd(): Promise<void> {
        console.log(`[DummyDriver] Print Job Ended. Feeding and cutting.`);
    }

    public async unbindTransport(): Promise<void> {
        // No persistent handles to release for the dummy driver.
        this.transport = null;
    }
}
