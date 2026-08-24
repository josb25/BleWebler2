import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventEmitter from 'eventemitter3';
import { PrintManager } from './print-manager';
import { UniversalPrintOptions, IPrinterDriver } from '../drivers/driver.interface';
import { monoPage, type UniversalPage } from '../types/ink';
import {
    IDeviceTransport,
    TransportEventMap,
    type BluetoothLEScanFilter
} from './transports/transport.interface';

class MockDriver implements IPrinterDriver {
    driverType: 'hardware' = 'hardware';
    connectionRequirements: { services: string[] };

    constructor(
        public mockNameMatch: string,
        service = "mock-service",
        public name = "MockDriver"
    ) {
        this.connectionRequirements = { services: [service] };
    }

    isCompatible(deviceName: string): boolean {
        return deviceName === this.mockNameMatch;
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {}
    async unbindTransport(): Promise<void> {}

    getCapabilities() {
        return {
            maxDensity: 10,
            canvasHeightPx: 100,
            supportsSpeedMode: false,
            colorSupport: { type: 'color' as const, shades: 256 },
            dpmm: 8
        };
    }

    async printInit(options: UniversalPrintOptions) {}
    async printPage(page: UniversalPage) {}
    async printEnd() {}
}

class FastMockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    type = "Mock";
    filterType?: 'bluetooth-le' | 'usb' | 'none';
    public isConn = false;
    constructor(public stubName: string, public stubServices: string[] = []) { super(); }
    async connect(_filters?: BluetoothLEScanFilter[]) { this.isConn = true; this.emit('connected'); }
    async disconnect() { this.isConn = false; this.emit('disconnected'); }
    isConnected() { return this.isConn; }
    getDeviceName() { return this.stubName; }
    getPrimaryServices() { return Promise.resolve(this.stubServices); }
    async write() {}
}

describe('PrintManager', () => {
    let printManager: PrintManager;

    beforeEach(() => {
        printManager = new PrintManager();
    });

    it('should register bundled drivers on initialization', () => {
        expect(printManager).toBeDefined();
    });

    it('should allow registering a new driver and routing to it based on exact name match', async () => {
        const mockDriver = new MockDriver("MySpoofedDevice");
        printManager.registerDriver(mockDriver);

        const transport = new FastMockTransport("MySpoofedDevice");
        const connectedEvent = vi.fn();
        printManager.on('connected', connectedEvent);

        await printManager.connect(transport);
        expect(connectedEvent).toHaveBeenCalledWith(mockDriver);
    });

    it('should throw an error if connected device does not match any driver', async () => {
        const transport = new FastMockTransport("UnknownJunkDevice");
        
        printManager.registerDriver(new MockDriver("ShouldNotMatchThis"));
        printManager.registerDriver(new MockDriver("ShouldNotMatchThisEither"));

        await expect(printManager.connect(transport)).rejects.toThrow(/no compatible driver/);
    });

    it('should fall back to service-based matching if name does not match', async () => {
        const mockDriver = new MockDriver("NameWillNotMatch");
        printManager.registerDriver(mockDriver);

        // Name doesn't match, but service matches `mockDriver` connectionRequirements
        const transport = new FastMockTransport("WeirdName", ["mock-service"]);
        
        const connectedEvent = vi.fn();
        printManager.on('connected', connectedEvent);

        await printManager.connect(transport);
        expect(connectedEvent).toHaveBeenCalledWith(mockDriver);
    });

    it('uses the discovered service to resolve drivers sharing a device name', async () => {
        const first = new MockDriver('AmbiguousDevice', 'service-a', 'First protocol');
        const second = new MockDriver('AmbiguousDevice', 'service-b', 'Second protocol');
        printManager.registerDriver(first);
        printManager.registerDriver(second);

        const transport = new FastMockTransport('AmbiguousDevice', ['service-b']);
        const connectedEvent = vi.fn();
        printManager.on('connected', connectedEvent);

        await printManager.connect(transport);
        expect(connectedEvent).toHaveBeenCalledWith(second);
        expect(connectedEvent).not.toHaveBeenCalledWith(first);
    });

    it('refuses an ambiguous name when services cannot distinguish the protocol', async () => {
        printManager.registerDriver(new MockDriver('AmbiguousDevice', 'service-a', 'First protocol'));
        printManager.registerDriver(new MockDriver('AmbiguousDevice', 'service-b', 'Second protocol'));

        const transport = new FastMockTransport('AmbiguousDevice');
        await expect(printManager.connect(transport)).rejects.toThrow(/multiple drivers.*First protocol.*Second protocol/i);
    });

    it('refuses a shared service when the device name identifies no driver', async () => {
        printManager.registerDriver(new MockDriver('FirstName', 'shared-service', 'First protocol'));
        printManager.registerDriver(new MockDriver('SecondName', 'shared-service', 'Second protocol'));

        const transport = new FastMockTransport('UnrecognisedDevice', ['shared-service']);
        await expect(printManager.connect(transport)).rejects.toThrow(/multiple drivers.*First protocol.*Second protocol/i);
    });

    it('does not route a generic printer name to an unrelated protocol', async () => {
        const transport = new FastMockTransport(
            'Printer01',
            ['000018f0-0000-1000-8000-00805f9b34fb']
        );
        await expect(printManager.connect(transport)).rejects.toThrow(/no compatible driver/);
    });

    it('passes every registered service to the transport discovery request', async () => {
        const transport = new FastMockTransport('UnknownJunkDevice');
        const connectSpy = vi.spyOn(transport, 'connect');

        await expect(printManager.connect(transport)).rejects.toThrow(/no compatible driver/);
        const filters = connectSpy.mock.calls[0][0] ?? [];
        const services = new Set(filters.flatMap(filter => filter.services ?? []));
        expect(services).toContain('0000ff00-0000-1000-8000-00805f9b34fb');
        expect(services).toContain('0000fee0-0000-1000-8000-00805f9b34fb');
        expect(services).not.toContain('0000ae30-0000-1000-8000-00805f9b34fb');
    });

    it('does not pass Bluetooth discovery filters to WebUSB transports', async () => {
        const transport = new FastMockTransport('Unknown USB Device');
        transport.filterType = 'usb';
        const connectSpy = vi.spyOn(transport, 'connect');

        await expect(printManager.connect(transport)).rejects.toThrow(/no compatible driver/);
        expect(connectSpy).toHaveBeenCalledWith(undefined);
    });

    it('should execute print flow correctly', async () => {
        const mockDriver = new MockDriver("TestDevice");
        printManager.registerDriver(mockDriver);

        const transport = new FastMockTransport("TestDevice");
        await printManager.connect(transport);

        const printingEvent = vi.fn();
        const idleEvent = vi.fn();
        printManager.on('printing', printingEvent);
        printManager.on('idle', idleEvent);

        const initSpy = vi.spyOn(mockDriver, 'printInit').mockResolvedValue();
        const pageSpy = vi.spyOn(mockDriver, 'printPage').mockResolvedValue();
        const endSpy = vi.spyOn(mockDriver, 'printEnd').mockResolvedValue();

        const dummyPage = monoPage({ data: new Uint8Array([0, 0, 0, 255]), width: 384, height: 100 });
        const dummyOptions: UniversalPrintOptions = { density: 5, copies: 1, paper: { id: 'test', name: 'test', type: 'gap', tapeWidthMm: 15 } };

        await printManager.print(dummyPage, dummyOptions);

        expect(printingEvent).toHaveBeenCalled();
        expect(initSpy).toHaveBeenCalledWith(dummyOptions);
        expect(pageSpy).toHaveBeenCalledWith(dummyPage);
        expect(endSpy).toHaveBeenCalled();
        expect(idleEvent).toHaveBeenCalled();
    });
});
