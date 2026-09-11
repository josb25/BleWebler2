import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import * as Protocol from './p12-protocol';
import { encodeRotatedRaster } from './raster';

const SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';
const WRITE = '0000ff02-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ff03-0000-1000-8000-00805f9b34fb';

interface P12Model { model: string; headDots: number; media: number | { min: number; max: number }; }
const MODELS: readonly P12Model[] = [
    { model: 'P12', headDots: 96, media: 12 },
    { model: 'P12 Pro', headDots: 96, media: 12 },
    { model: 'A30', headDots: 120, media: { min: 12, max: 15 } }
];

function capabilities(model: P12Model): PrinterCapabilities {
    return {
        canvasHeightPx: model.headDots,
        dpmm: 8,
        maxDensity: 1,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: model.media }
    };
}

export const PHOMEMO_P12_MODELS: PrinterModelProfile[] = MODELS.map(model => ({
    id: `phomemo_${model.model.toLowerCase().replace(/\s+/g, '_')}`,
    brand: 'Phomemo',
    model: model.model,
    family: 'P12/A30 tape protocol',
    supportLevel: 'Untested',
    capabilities: capabilities(model),
    notes: 'Experimental support. Select this family manually when a P12 name is ambiguous with Marklife hardware.'
}));

export class PhomemoP12Driver implements IPrinterDriver {
    readonly name = 'Phomemo P12/A30';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = { services: [SERVICE], namePrefixes: ['P12 PRO', 'P12PRO', 'P12', 'A30'] };
    readonly supportedModels = PHOMEMO_P12_MODELS;

    private transport?: IDeviceTransport;
    private deviceName = '';
    private notificationsAvailable = false;

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return ['P12 PRO', 'P12PRO', 'P12', 'A30'].some(name => upper === name
            || upper.startsWith(`${name}-`)
            || upper.startsWith(`${name}_`));
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        this.deviceName = transport.getDeviceName()?.toUpperCase() ?? '';
        this.notificationsAvailable = false;
        if (transport.startNotifications) {
            try {
                await transport.startNotifications({ serviceUUID: SERVICE, notifyUUID: NOTIFY });
                this.notificationsAvailable = true;
            } catch {
                // Fixed pacing below is the fallback for devices without notify.
            }
        }
    }

    async unbindTransport(): Promise<void> {
        this.transport = undefined;
        this.deviceName = '';
        this.notificationsAvailable = false;
    }

    getCapabilities(): PrinterCapabilities {
        return { ...capabilities(this.matchModel()), driverName: this.name };
    }

    async printInit(_options: UniversalPrintOptions): Promise<void> {
        for (const packet of Protocol.initialise) await this.sendAndAwaitReply(packet);
    }

    async printPage(page: UniversalPage): Promise<void> {
        const raster = encodeRotatedRaster(singlePlane(page), this.getCapabilities().canvasHeightPx);
        await this.write(Protocol.rasterHeader(raster.widthBytes, raster.rows));
        await this.sendChunked(raster.data);
    }

    async printEnd(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.write(Protocol.feed);
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.write(Protocol.feed);
    }

    private matchModel(): P12Model {
        if (this.deviceName.startsWith('A30')) return MODELS[2];
        if (this.deviceName.startsWith('P12 PRO') || this.deviceName.startsWith('P12PRO')) return MODELS[1];
        return MODELS[0];
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Phomemo P12 transport is not bound.');
        return this.transport;
    }

    private async write(data: Uint8Array): Promise<void> {
        await this.requireTransport().write(data, { serviceUUID: SERVICE, writeUUID: WRITE, reliable: false });
    }

    private async sendAndAwaitReply(data: Uint8Array): Promise<void> {
        if (!this.notificationsAvailable) {
            await this.write(data);
            await new Promise(resolve => setTimeout(resolve, 100));
            return;
        }
        const transport = this.requireTransport();
        await new Promise<void>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout>;
            const finish = () => {
                clearTimeout(timer);
                transport.off('data', onData);
                resolve();
            };
            const onData = () => finish();
            timer = setTimeout(finish, 500);
            transport.on('data', onData);
            this.write(data).catch(error => {
                clearTimeout(timer);
                transport.off('data', onData);
                reject(error);
            });
        });
    }

    private async sendChunked(data: Uint8Array): Promise<void> {
        for (let offset = 0; offset < data.length; offset += 128) {
            await this.write(data.slice(offset, offset + 128));
            if (offset + 128 < data.length) await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
}

