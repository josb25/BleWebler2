import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import * as Protocol from './m110-protocol';
import { encodeRotatedRaster } from './raster';

const SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';
const WRITE = '0000ff02-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ff03-0000-1000-8000-00805f9b34fb';

interface M110Model {
    model: string;
    headDots: number;
    mediaWidthMm: number;
    bluetoothPrefixes?: string[];
}

const MODELS: readonly M110Model[] = [
    { model: 'M110', headDots: 344, mediaWidthMm: 48 },
    { model: 'M110S', headDots: 384, mediaWidthMm: 48, bluetoothPrefixes: ['Q199E'] },
    { model: 'M120', headDots: 344, mediaWidthMm: 48 },
    { model: 'M220', headDots: 576, mediaWidthMm: 72 }
];

function capabilities(model: M110Model): PrinterCapabilities {
    return {
        canvasHeightPx: model.headDots,
        dpmm: 8,
        maxDensity: 15,
        supportsSpeedMode: true,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: model.mediaWidthMm }
    };
}

export const PHOMEMO_M110_MODELS: PrinterModelProfile[] = MODELS.map(model => ({
    id: `phomemo_${model.model.toLowerCase()}`,
    brand: 'Phomemo',
    model: model.model,
    family: 'M110/M120/M220 ESC/POS-derived',
    supportLevel: 'Untested',
    capabilities: capabilities(model),
    notes: 'Experimental community support. Model widths conflict across public sources and need hardware reports.'
}));

export class PhomemoM110Driver implements IPrinterDriver {
    readonly name = 'Phomemo M110/M120/M220';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = {
        services: [SERVICE],
        namePrefixes: MODELS.flatMap(model => [model.model, ...(model.bluetoothPrefixes ?? [])])
    };
    readonly supportedModels = PHOMEMO_M110_MODELS;

    private transport?: IDeviceTransport;
    private deviceName = '';

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return this.names().some(({ name, barePrefix }) => upper === name
            || (barePrefix && upper.startsWith(name))
            || upper.startsWith(`${name}-`)
            || upper.startsWith(`${name}_`));
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        this.deviceName = transport.getDeviceName()?.toUpperCase() ?? '';
        if (transport.startNotifications) {
            try {
                await transport.startNotifications({ serviceUUID: SERVICE, notifyUUID: NOTIFY });
            } catch {
                // This protocol can print without notifications.
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
        const media = options.paper?.type === 'continuous'
            ? 'continuous'
            : options.paper?.type === 'black-mark' ? 'mark' : 'gap';
        await this.send(Protocol.speed(options.speed ?? 5));
        await this.send(Protocol.density(options.density));
        await this.send(Protocol.mediaType(media));
    }

    async printPage(page: UniversalPage): Promise<void> {
        const raster = encodeRotatedRaster(singlePlane(page), this.getCapabilities().canvasHeightPx);
        await this.send(Protocol.rasterHeader(raster.widthBytes, raster.rows));
        await this.sendChunked(raster.data);
    }

    async printEnd(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 300));
        await this.send(Protocol.endJob);
    }

    private names(): Array<{ name: string; barePrefix: boolean }> {
        return MODELS.flatMap(model => [
            { name: model.model.toUpperCase(), barePrefix: false },
            ...(model.bluetoothPrefixes ?? []).map(name => ({ name: name.toUpperCase(), barePrefix: true }))
        ]).sort((a, b) => b.name.length - a.name.length);
    }

    private matchModel(): M110Model {
        return [...MODELS]
            .sort((a, b) => b.model.length - a.model.length)
            .find(model => [model.model, ...(model.bluetoothPrefixes ?? [])].some(name => {
                const upper = name.toUpperCase();
                return this.deviceName === upper
                    || ((model.bluetoothPrefixes ?? []).includes(name) && this.deviceName.startsWith(upper))
                    || this.deviceName.startsWith(`${upper}-`)
                    || this.deviceName.startsWith(`${upper}_`);
            })) ?? MODELS[0];
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Phomemo M110 transport is not bound.');
        return this.transport;
    }

    private async send(data: Uint8Array): Promise<void> {
        await this.requireTransport().write(data, { serviceUUID: SERVICE, writeUUID: WRITE, reliable: false });
        await new Promise(resolve => setTimeout(resolve, 30));
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
