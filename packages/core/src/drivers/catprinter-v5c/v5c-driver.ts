import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import { rotateToPrintRows } from './raster';
import * as Protocol from './v5c-protocol';

const SERVICE = '0000ae30-0000-1000-8000-00805f9b34fb';
const WRITE = '0000ae01-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ae02-0000-1000-8000-00805f9b34fb';
const MODELS = ['YTB01'] as const;

function capabilities(): PrinterCapabilities {
    return {
        canvasHeightPx: Protocol.PRINTHEAD_DOTS,
        dpmm: 8,
        maxDensity: 3,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: 58 }
    };
}

export const CATPRINTER_V5C_MODELS: PrinterModelProfile[] = MODELS.map(model => ({
    id: `catprinter_v5c_${model.toLowerCase()}`,
    brand: 'Generic Cat Printer',
    model,
    family: 'V5C 0x56/0x88 row raster',
    supportLevel: 'Untested',
    capabilities: capabilities(),
    notes: 'Experimental community support for the V5C protocol used by YTB01.'
}));

export class CatPrinterV5cDriver implements IPrinterDriver {
    readonly name = 'Catprinter (V5C 0x56/0x88 row raster)';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = { services: [SERVICE], namePrefixes: [...MODELS] };
    readonly supportedModels = CATPRINTER_V5C_MODELS;

    private transport?: IDeviceTransport;
    private paused = false;
    private resumeWaiters: Array<() => void> = [];

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return MODELS.some(model => upper === model
            || upper.startsWith(`${model}-`)
            || upper.startsWith(`${model}_`));
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        transport.on('data', this.handleData);
        if (transport.startNotifications) {
            try {
                await transport.startNotifications({ serviceUUID: SERVICE, notifyUUID: NOTIFY });
            } catch {
                // Some transports expose only the write characteristic.
            }
        }
        await new Promise(resolve => setTimeout(resolve, 600));
        await this.writePacket(Protocol.connectInit);
    }

    async unbindTransport(): Promise<void> {
        this.transport?.off('data', this.handleData);
        this.transport = undefined;
        this.paused = false;
        this.releaseResumeWaiters();
    }

    getCapabilities(): PrinterCapabilities {
        return { ...capabilities(), driverName: this.name };
    }

    async printInit(options: UniversalPrintOptions): Promise<void> {
        const density = Math.max(1, Math.min(3, Math.round(options.density || 2)));
        await this.writePacket(Protocol.settings(density));
        await this.writePacket(Protocol.beginPrint);
    }

    async printPage(page: UniversalPage): Promise<void> {
        const rows = rotateToPrintRows(singlePlane(page), Protocol.PRINTHEAD_DOTS);
        for (const row of rows) await this.writePacket(Protocol.printLine(row));
    }

    async printEnd(): Promise<void> {
        await this.writePacket(Protocol.endPrint);
        await this.writePacket(Protocol.queryStatus);
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Catprinter V5C transport is not bound.');
        return this.transport;
    }

    private async writePacket(packet: Uint8Array): Promise<void> {
        await this.waitUntilResumed();
        await this.requireTransport().write(packet, {
            serviceUUID: SERVICE,
            writeUUID: WRITE,
            reliable: false
        });
        await new Promise(resolve => setTimeout(resolve, 4));
    }

    private handleData = (data: Uint8Array): void => {
        if (Protocol.packetsEqual(data, Protocol.pauseNotification)) {
            this.paused = true;
        } else if (Protocol.packetsEqual(data, Protocol.resumeNotification)) {
            this.paused = false;
            this.releaseResumeWaiters();
        }
    };

    private async waitUntilResumed(): Promise<void> {
        if (!this.paused) return;
        await new Promise<void>((resolve, reject) => {
            const done = () => { clearTimeout(timeout); resolve(); };
            const timeout = setTimeout(() => {
                const index = this.resumeWaiters.indexOf(done);
                if (index >= 0) this.resumeWaiters.splice(index, 1);
                reject(new Error('Catprinter V5C flow control remained paused for 10 seconds.'));
            }, 10_000);
            this.resumeWaiters.push(done);
        });
    }

    private releaseResumeWaiters(): void {
        for (const resolve of this.resumeWaiters.splice(0)) resolve();
    }
}
