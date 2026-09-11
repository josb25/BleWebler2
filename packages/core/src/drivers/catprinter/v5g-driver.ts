import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import { rotateToPrintRows } from './raster';
import * as Protocol from './v5g-protocol';

const SERVICE = '0000ae30-0000-1000-8000-00805f9b34fb';
const WRITE = '0000ae01-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ae02-0000-1000-8000-00805f9b34fb';

/** Advertised names associated with V5G by the public TiMini-Print catalogue. */
const MODELS = [
    'YT01', 'YT02', 'MX01', 'MX05', 'MX06', 'MX08', 'MX09', 'MX10', 'MX11',
    'MX12', 'MX13', 'MXTP-100', 'MXPC-100', 'AZ-P2108X', 'PD01',
    'URBANWORXKIDSCAMERA', 'CYLOBTPRINTER', 'XOPOPPY', 'BQ01', 'BQ02', 'BQ03',
    'BQ05', 'BQ06', 'BQ06B', 'BQ07', 'BQ7A', 'BQ7B', 'BQ08', 'BQ17', 'BQ95',
    'BQ95B', 'BQ95C', 'BQ96', 'MXW009', 'MXW010', 'EWTTOET-Z0499',
    'EWTTOET-N3689', 'EWTTOET-N3687', 'KP-IM606', 'GV-MA211', 'X6', 'K06',
    'MINIPRINTER', 'JL-BR22'
] as const;

function capabilities(): PrinterCapabilities {
    return {
        canvasHeightPx: Protocol.PRINTHEAD_DOTS,
        dpmm: 8,
        maxDensity: 8,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: 58 }
    };
}

export const CATPRINTER_V5G_MODELS: PrinterModelProfile[] = MODELS.map(model => ({
    id: `catprinter_v5g_${model.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    brand: 'Generic Cat Printer',
    model,
    family: 'V5G 0x51/0x78 dot raster',
    supportLevel: 'Untested',
    capabilities: capabilities(),
    notes: 'Experimental V5G support. This advertised name may also appear on incompatible Tiny or V5X hardware; select the driver family manually if detection is ambiguous.'
}));

export class CatPrinterV5gDriver implements IPrinterDriver {
    readonly name = 'Catprinter (V5G 0x51/0x78 dot raster)';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = { services: [SERVICE], namePrefixes: [...MODELS] };
    readonly supportedModels = CATPRINTER_V5G_MODELS;

    private transport?: IDeviceTransport;

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return MODELS.some(model => upper === model
            || upper.startsWith(`${model}-`)
            || upper.startsWith(`${model}_`));
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        if (transport.startNotifications) {
            try {
                await transport.startNotifications({ serviceUUID: SERVICE, notifyUUID: NOTIFY });
            } catch {
                // Printing does not require a notification channel on all V5G firmware.
            }
        }
    }

    async unbindTransport(): Promise<void> {
        this.transport = undefined;
    }

    getCapabilities(): PrinterCapabilities {
        return { ...capabilities(), driverName: this.name };
    }

    async printInit(options: UniversalPrintOptions): Promise<void> {
        const level = Math.max(1, Math.min(8, Math.round(options.density || 4)));
        const wireDensity = Math.round(60 + ((level - 1) / 7) * 120);
        const blackening = Math.ceil(level * 5 / 8);
        const energy = Math.round(10_000 + ((level - 1) / 7) * 5_000);
        await this.sendPackets(Protocol.initSequence(wireDensity, blackening, energy));
    }

    async printPage(page: UniversalPage): Promise<void> {
        const rows = rotateToPrintRows(singlePlane(page), Protocol.PRINTHEAD_DOTS);
        await this.sendPackets(rows.map(row => Protocol.printLine(row)));
    }

    async printEnd(): Promise<void> {
        await this.sendPackets(Protocol.endSequence());
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Catprinter V5G transport is not bound.');
        return this.transport;
    }

    private async sendPackets(packets: readonly Uint8Array[]): Promise<void> {
        const transport = this.requireTransport();
        for (let index = 0; index < packets.length; index += 1) {
            await transport.write(packets[index], {
                serviceUUID: SERVICE,
                writeUUID: WRITE,
                reliable: false
            });
            if (index + 1 < packets.length) await new Promise(resolve => setTimeout(resolve, 6));
        }
    }
}
