import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import * as Protocol from './protocol';
import { rotateToPrintRows } from './raster';

const SERVICE = '0000ae30-0000-1000-8000-00805f9b34fb';
const WRITE = '0000ae01-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ae02-0000-1000-8000-00805f9b34fb';

const STANDARD_MODELS = [
    'GB01', 'GB02', 'GB03', 'GB04', 'GB05', 'GT01', 'GT02', 'GT04', 'GT08', 'GT09',
    'LY01', 'LY02', 'LY03', 'LY05', 'MX05', 'MX06', 'MX08', 'MX09', 'MX10', 'MX11',
    'MX12', 'MX13', 'MXTP', 'YT01', 'YT02'
] as const;
const PREFIXED_MODELS = ['JXM800', 'LP100', 'LY10', 'LY11'] as const;
const STANDARD_REBRANDS = [
    'MX01', 'MXTP-100', 'AZ-P2108X', 'PD01', 'URBANWORXKIDSCAMERA', 'CYLOBTPRINTER',
    'XOPOPPY', 'BQ01', 'BQ05', 'BQ06', 'BQ06B', 'BQ07', 'BQ7A', 'BQ7B', 'BQ08',
    'BQ95', 'BQ95B', 'BQ95C', 'BQ96', 'MXW009', 'MXW010', 'KP-IM606', 'GV-MA211', 'X6', 'K06'
] as const;

const profile = (model: string, dialect: Protocol.CatPrinterDialect): PrinterModelProfile => ({
    id: `catprinter_${model.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    brand: 'Generic Cat Printer',
    model,
    family: dialect === 'prefixed' ? 'Tiny 0x12/0x51/0x78' : 'Tiny 0x51/0x78',
    supportLevel: 'Untested',
    capabilities: {
        canvasHeightPx: 384,
        dpmm: 8,
        maxDensity: 5,
        supportsSpeedMode: true,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: 58 },
        mediaDefaults: { feedAfterMinPx: 0, feedAfterMaxPx: 500, feedAfterDefaultPx: 25 }
    },
    notes: 'Experimental community support for the common 384-dot Catprinter/Tiny BLE protocol.'
});

export const CATPRINTER_MODELS: PrinterModelProfile[] = [
    ...STANDARD_MODELS.map(model => profile(model, 'standard')),
    ...PREFIXED_MODELS.map(model => profile(model, 'prefixed'))
];

export class CatPrinterDriver implements IPrinterDriver {
    readonly name: string;
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements: { services: string[]; namePrefixes: string[] };
    readonly supportedModels: PrinterModelProfile[];

    private transport?: IDeviceTransport;
    private paused = false;
    private resumeWaiters: Array<() => void> = [];
    private lastOptions?: UniversalPrintOptions;

    constructor(private readonly dialect: Protocol.CatPrinterDialect = 'standard') {
        const names = dialect === 'prefixed'
            ? [...PREFIXED_MODELS]
            : [...STANDARD_MODELS, ...STANDARD_REBRANDS];
        this.name = dialect === 'prefixed'
            ? 'Catprinter (Tiny prefixed 0x12/0x51/0x78)'
            : 'Catprinter (Tiny 0x51/0x78)';
        this.connectionRequirements = { services: [SERVICE], namePrefixes: names };
        this.supportedModels = CATPRINTER_MODELS.filter(model =>
            dialect === 'prefixed' ? model.family?.includes('0x12/') : !model.family?.includes('0x12/'));
    }

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return this.connectionRequirements.namePrefixes
            .some(name => upper === name || upper.startsWith(`${name}-`) || upper.startsWith(`${name}_`));
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        transport.on('data', this.handleData);
        if (transport.startNotifications) {
            try {
                await transport.startNotifications({ serviceUUID: SERVICE, notifyUUID: NOTIFY });
            } catch {
                // Several compatible units are effectively write-only.
            }
        }
    }

    async unbindTransport(): Promise<void> {
        this.transport?.off('data', this.handleData);
        this.transport = undefined;
        this.paused = false;
        this.releaseResumeWaiters();
    }

    getCapabilities(): PrinterCapabilities {
        return {
            canvasHeightPx: 384,
            dpmm: 8,
            maxDensity: 5,
            supportsSpeedMode: true,
            colorSupport: { type: 'monochrome' },
            physical: { supportedMediaWidthsMm: 58 },
            mediaDefaults: { feedAfterMinPx: 0, feedAfterMaxPx: 500, feedAfterDefaultPx: 25 },
            driverName: this.name
        };
    }

    async printInit(options: UniversalPrintOptions): Promise<void> {
        this.requireTransport();
        this.lastOptions = options;
        const density = Math.max(1, Math.min(5, Math.round(options.density || 3)));
        const energy = Math.round(0x2000 + ((density - 1) / 4) * (0xffff - 0x2000));
        await this.sendStream(Protocol.concat(
            Protocol.deviceState(this.dialect),
            Protocol.setQuality(density, this.dialect),
            Protocol.setEnergy(energy, this.dialect),
            Protocol.setPrintMode(false, this.dialect),
            Protocol.setSpeed(options.speed ?? 10, this.dialect),
            Protocol.startLattice(this.dialect)
        ));
    }

    async printPage(page: UniversalPage): Promise<void> {
        const rows = rotateToPrintRows(singlePlane(page), 384);
        const packets: Uint8Array[] = [];
        const speed = this.lastOptions?.speed ?? 10;
        rows.forEach((row, index) => {
            packets.push(Protocol.printLine(row, this.dialect));
            if ((index + 1) % 200 === 0) packets.push(Protocol.setSpeed(speed, this.dialect));
        });
        await this.sendStream(Protocol.concat(...packets));
    }

    async printEnd(): Promise<void> {
        const overrideMm = this.lastOptions?.feedOverrides?.feedAfterMm;
        const feedDots = typeof overrideMm === 'number' ? Math.round(overrideMm * 8) : 25;
        await this.sendStream(Protocol.concat(
            Protocol.feed(feedDots, this.dialect),
            Protocol.setPaper(this.dialect), Protocol.setPaper(this.dialect), Protocol.setPaper(this.dialect),
            Protocol.endLattice(this.dialect),
            Protocol.deviceState(this.dialect)
        ));
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Catprinter transport is not bound.');
        return this.transport;
    }

    private async sendStream(data: Uint8Array): Promise<void> {
        const transport = this.requireTransport();
        for (let offset = 0; offset < data.length; offset += 100) {
            await this.waitUntilResumed();
            await transport.write(data.slice(offset, offset + 100), { serviceUUID: SERVICE, writeUUID: WRITE, reliable: false });
            if (offset + 100 < data.length) await new Promise(resolve => setTimeout(resolve, 5));
        }
    }

    private handleData = (data: Uint8Array): void => {
        const hex = [...data].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (hex.includes('5178ae0101001070ff')) this.paused = true;
        else if (hex.includes('5178ae0101000000ff')) {
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
                reject(new Error('Catprinter flow control remained paused for 10 seconds.'));
            }, 10_000);
            this.resumeWaiters.push(done);
        });
    }

    private releaseResumeWaiters(): void {
        for (const resolve of this.resumeWaiters.splice(0)) resolve();
    }
}
