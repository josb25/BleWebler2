import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import * as Protocol from './m02-protocol';
import { encodeRotatedRaster } from './raster';

const SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';
const WRITE = '0000ff02-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ff03-0000-1000-8000-00805f9b34fb';

interface M02Model {
    model: string;
    headDots: number;
    dpmm: number;
    mediaWidthMm: number;
    bluetoothNames?: readonly string[];
}

const MODELS: readonly M02Model[] = [
    { model: 'M02', headDots: 384, dpmm: 8, mediaWidthMm: 48, bluetoothNames: ['M02C', 'Mr.in', 'Mr.in_M02'] },
    { model: 'M02S', headDots: 384, dpmm: 8, mediaWidthMm: 48, bluetoothNames: ['Mr.in_M02S'] },
    { model: 'M02X', headDots: 384, dpmm: 8, mediaWidthMm: 48, bluetoothNames: ['M02D', 'M02E', 'MR2', 'M02A', 'KP-Q1'] },
    { model: 'M02 Pro', headDots: 624, dpmm: 12, mediaWidthMm: 53, bluetoothNames: ['M02PRO', 'sandymaro'] }
];

function capabilities(model: M02Model): PrinterCapabilities {
    return {
        canvasHeightPx: model.headDots,
        dpmm: model.dpmm,
        maxDensity: 8,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: model.mediaWidthMm },
        mediaDefaults: { feedAfterMinPx: 0, feedAfterMaxPx: 100, feedAfterDefaultPx: 8 }
    };
}

export const PHOMEMO_M02_MODELS: PrinterModelProfile[] = MODELS.map(model => ({
    id: `phomemo_${model.model.toLowerCase().replace(/\s+/g, '_')}`,
    brand: 'Phomemo',
    model: model.model,
    aliases: model.bluetoothNames ? [...model.bluetoothNames] : undefined,
    family: 'M02 prefixed ESC/POS',
    supportLevel: 'Untested',
    capabilities: capabilities(model),
    notes: 'Experimental community support for the M02 wake-prefix and raw-raster command family.'
}));

export class PhomemoM02Driver implements IPrinterDriver {
    readonly name = 'Phomemo M02 family';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = {
        services: [SERVICE],
        namePrefixes: MODELS.flatMap(model => [model.model, ...(model.bluetoothNames ?? [])])
    };
    readonly supportedModels = PHOMEMO_M02_MODELS;

    private transport?: IDeviceTransport;
    private deviceName = '';

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return MODELS.some(model => this.matchesModelName(upper, model));
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        this.deviceName = transport.getDeviceName()?.toUpperCase() ?? '';
        if (transport.startNotifications) {
            try {
                await transport.startNotifications({ serviceUUID: SERVICE, notifyUUID: NOTIFY });
            } catch {
                // Printing does not depend on the optional status channel.
            }
        }
    }

    async unbindTransport(): Promise<void> {
        this.transport = undefined;
        this.deviceName = '';
    }

    getCapabilities(): PrinterCapabilities {
        return { ...capabilities(this.matchModel()), driverName: this.name };
    }

    async printInit(options: UniversalPrintOptions): Promise<void> {
        await this.send(Protocol.wake, 50);
        await this.send(Protocol.initialise, 100);
        await this.send(Protocol.heatSettings(options.density), 30);
    }

    async printPage(page: UniversalPage): Promise<void> {
        const raster = encodeRotatedRaster(singlePlane(page), this.getCapabilities().canvasHeightPx);
        await this.send(Protocol.rasterHeader(raster.widthBytes, raster.rows), 0);
        await this.sendChunked(raster.data);
    }

    async printEnd(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 300));
        await this.send(Protocol.finish, 500);
    }

    private matchModel(): M02Model {
        return MODELS.find(model => this.matchesModelName(this.deviceName, model)) ?? MODELS[0];
    }

    private matchesModelName(deviceName: string, model: M02Model): boolean {
        if ((model.bluetoothNames ?? []).some(name => deviceName === name.toUpperCase())) return true;
        const canonical = model.model.toUpperCase();
        return deviceName === canonical
            || deviceName.startsWith(`${canonical}-`)
            || deviceName.startsWith(`${canonical}_`);
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Phomemo M02 transport is not bound.');
        return this.transport;
    }

    private async send(data: Uint8Array, delayMs: number): Promise<void> {
        await this.requireTransport().write(data, { serviceUUID: SERVICE, writeUUID: WRITE, reliable: false });
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    private async sendChunked(data: Uint8Array): Promise<void> {
        const transport = this.requireTransport();
        for (let offset = 0; offset < data.length; offset += 128) {
            await transport.write(data.slice(offset, offset + 128), {
                serviceUUID: SERVICE,
                writeUUID: WRITE,
                reliable: false
            });
            if (offset + 128 < data.length) await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
}
