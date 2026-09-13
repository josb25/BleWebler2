import { describe, it, expect, vi } from 'vitest';
import EventEmitter from 'eventemitter3';
import { PeriPageDriver } from './peripage-driver';
import {
    PERIPAGE_A6_PLUS_PROFILE,
    PERIPAGE_A6_PROFILE,
    PERIPAGE_BLE_ENDPOINTS,
    PERIPAGE_MODELS,
    PERIPAGE_P21_HD_PROFILE,
    PERIPAGE_P21_PROFILE,
    rasterHeader,
} from './peripage-protocol';
import * as rasterModule from '../phomemo/raster';
import { monoPage } from '../../types/ink';
import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { TransportEventMap } from '../../core/transports/transport.interface';
import type { PrinterModelProfile } from '../driver.interface';

interface CapturedWrite {
    data: Uint8Array;
    options?: {
        serviceUUID?: string;
        writeUUID?: string;
        reliable?: boolean;
    };
}

class MockDeviceTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'Mock BLE';
    readonly writtenPackets: Uint8Array[] = [];
    readonly capturedWrites: CapturedWrite[] = [];
    readonly startedNotifications: Array<{ serviceUUID?: string; notifyUUID?: string }> = [];
    private deviceName: string;
    private connected = true;

    constructor(deviceName: string = 'PeriPage_A6') {
        super();
        this.deviceName = deviceName;
    }

    getDeviceName(): string {
        return this.deviceName;
    }

    setDeviceName(name: string): void {
        this.deviceName = name;
    }

    isConnected(): boolean {
        return this.connected;
    }

    async connect(): Promise<void> {
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    async write(
        data: Uint8Array,
        options?: { serviceUUID?: string; writeUUID?: string; reliable?: boolean }
    ): Promise<void> {
        this.writtenPackets.push(new Uint8Array(data));
        this.capturedWrites.push({ data: new Uint8Array(data), options });
    }

    async startNotifications(options?: { serviceUUID?: string; notifyUUID?: string }): Promise<void> {
        if (options) {
            this.startedNotifications.push(options);
        }
    }
}

describe('PeriPageDriver', () => {
    it('implements IPrinterDriver interface with PeriPage raw GS v 0 name and hardware type', () => {
        const driver = new PeriPageDriver();
        expect(driver.name).toBe('PeriPage raw GS v 0');
        expect(driver.driverType).toBe('hardware');
        expect(driver.supportedModels).toBe(PERIPAGE_MODELS);
        expect(driver.connectionRequirements.services).toContain(PERIPAGE_BLE_ENDPOINTS.service);
        expect(driver.connectionRequirements.namePrefixes).toEqual(['PeriPage', 'PPG']);
    });

    it('starts optional notifications on bind and captures characteristic arguments', async () => {
        const driver = new PeriPageDriver();
        const transport = new MockDeviceTransport('PeriPage_A6');
        await driver.bindTransport(transport);

        expect(transport.startedNotifications).toHaveLength(1);
        expect(transport.startedNotifications[0]).toEqual({
            serviceUUID: PERIPAGE_BLE_ENDPOINTS.service,
            notifyUUID: PERIPAGE_BLE_ENDPOINTS.notify,
        });
    });

    it('handles transports lacking startNotifications gracefully during bind', async () => {
        const driver = new PeriPageDriver();
        const transport = new MockDeviceTransport('PeriPage_A6');
        delete (transport as Partial<MockDeviceTransport>).startNotifications;

        await expect(driver.bindTransport(transport)).resolves.not.toThrow();
    });

    it('automatically updates profile from transport device name on bind', async () => {
        const driver = new PeriPageDriver();
        expect(driver.getCapabilities().canvasHeightPx).toBe(384);
        expect(driver.getCapabilities().dpmm).toBe(8);

        // A6+ BLE form
        const transportA6Plus = new MockDeviceTransport('PeriPage+9B34');
        await driver.bindTransport(transportA6Plus);
        expect(driver.getProfile()).toBe(PERIPAGE_A6_PLUS_PROFILE);
        expect(driver.getCapabilities().canvasHeightPx).toBe(576);
        expect(driver.getCapabilities().dpmm).toBe(12);

        // P21 HD 304dpi form
        const transportP21HD = new MockDeviceTransport('PPG_P21_HD');
        await driver.bindTransport(transportP21HD);
        expect(driver.getProfile()).toBe(PERIPAGE_P21_HD_PROFILE);
        expect(driver.getCapabilities().canvasHeightPx).toBe(384);
        expect(driver.getCapabilities().dpmm).toBe(12);

        await driver.unbindTransport();
    });

    it('supports manual profile selection and rejects profiles outside PERIPAGE_MODELS', () => {
        const driver = new PeriPageDriver(PERIPAGE_P21_PROFILE);
        expect(driver.getProfile()).toBe(PERIPAGE_P21_PROFILE);
        expect(driver.getCapabilities().canvasHeightPx).toBe(384);
        expect(driver.getCapabilities().dpmm).toBe(8);

        driver.setProfile(PERIPAGE_A6_PLUS_PROFILE);
        expect(driver.getProfile()).toBe(PERIPAGE_A6_PLUS_PROFILE);
        expect(driver.getCapabilities().canvasHeightPx).toBe(576);

        const foreignProfile = {
            id: 'phomemo_m02',
            brand: 'Phomemo',
            model: 'M02',
            family: 'Phomemo',
            supportLevel: 'Untested',
            capabilities: {
                maxDensity: 2,
                canvasHeightPx: 384,
                supportsSpeedMode: false,
                colorSupport: { type: 'monochrome', channels: 1 },
                dpmm: 8,
                driverName: 'Phomemo M02',
            },
        } as PrinterModelProfile;

        expect(() => driver.setProfile(foreignProfile)).toThrow(
            /not supported by PeriPage raw GS v 0 driver/
        );
    });

    it('delegates raster encoding and header creation without reimplementing', async () => {
        const rasterSpy = vi.spyOn(rasterModule, 'encodeRotatedRaster');
        const headerSpy = vi.spyOn(rasterModule, 'rasterHeader');
        const driver = new PeriPageDriver(PERIPAGE_A6_PROFILE);
        const transport = new MockDeviceTransport('PeriPage_A6');
        await driver.bindTransport(transport);

        const image = { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4).fill(255) };
        const page = monoPage(image);

        await driver.printInit({ density: 2, copies: 1 });
        await driver.printPage(page);
        await driver.printEnd();

        expect(rasterSpy).toHaveBeenCalled();
        expect(headerSpy).toHaveBeenCalledWith(48, 4);

        rasterSpy.mockRestore();
        headerSpy.mockRestore();
    });

    it('executes the full printing sequence with exact packet order, one header, and row packets', async () => {
        const driver = new PeriPageDriver(PERIPAGE_A6_PROFILE);
        const transport = new MockDeviceTransport('PeriPage_A6');
        await driver.bindTransport(transport);

        // 2x2 monoPage results in 2 raster rows (each 384 dots / 8 = 48 bytes)
        const page = monoPage({ width: 2, height: 2, data: new Uint8Array(2 * 2 * 4).fill(255) });

        await driver.printInit({ density: 2, copies: 1 });
        await driver.printPage(page);
        await driver.printEnd();

        // Exact packet sequence:
        // 0: enable (10 FF FE 01)
        // 1: wake (12 zero bytes)
        // 2: density (10 FF 10 00 02)
        // 3: position (1D 0C)
        // 4: ONE shared rasterHeader (1D 76 30 00 30 00 02 00)
        // 5: row 0 raw data (48 bytes, NOT wrapped in GS v 0)
        // 6: row 1 raw data (48 bytes, NOT wrapped in GS v 0)
        // 7: feed (1B 4A 48)
        // 8: stop (10 FF FE 45)
        expect(transport.writtenPackets).toHaveLength(9);

        // 0. enable
        expect(transport.writtenPackets[0]).toEqual(new Uint8Array([0x10, 0xff, 0xfe, 0x01]));

        // 1. wake
        expect(transport.writtenPackets[1]).toEqual(new Uint8Array(12));

        // 2. density
        expect(transport.writtenPackets[2]).toEqual(new Uint8Array([0x10, 0xff, 0x10, 0x00, 0x02]));

        // 3. position
        expect(transport.writtenPackets[3]).toEqual(new Uint8Array([0x1d, 0x0c]));

        // 4. ONE shared raster header (width = 48 bytes, rows = 2)
        expect(transport.writtenPackets[4]).toEqual(rasterHeader(48, 2));
        expect(transport.writtenPackets[4]).toEqual(new Uint8Array([0x1d, 0x76, 0x30, 0x00, 0x30, 0x00, 0x02, 0x00]));

        // 5 & 6. raw row data writes (48 bytes each, without GS v 0 header)
        expect(transport.writtenPackets[5].length).toBe(48);
        expect(transport.writtenPackets[6].length).toBe(48);
        expect(transport.writtenPackets[5].subarray(0, 3)).not.toEqual(new Uint8Array([0x1d, 0x76, 0x30]));
        expect(transport.writtenPackets[6].subarray(0, 3)).not.toEqual(new Uint8Array([0x1d, 0x76, 0x30]));

        // 7. feed
        expect(transport.writtenPackets[7]).toEqual(new Uint8Array([0x1b, 0x4a, 0x48]));

        // 8. stop
        expect(transport.writtenPackets[8]).toEqual(new Uint8Array([0x10, 0xff, 0xfe, 0x45]));

        // Verify characteristic args on EVERY write: { serviceUUID, writeUUID, reliable: false }
        expect(transport.capturedWrites).toHaveLength(9);
        for (const write of transport.capturedWrites) {
            expect(write.options).toEqual({
                serviceUUID: PERIPAGE_BLE_ENDPOINTS.service,
                writeUUID: PERIPAGE_BLE_ENDPOINTS.write,
                reliable: false,
            });
        }
    });

    it('clamps density to 0..2', async () => {
        const driver = new PeriPageDriver(PERIPAGE_A6_PROFILE);
        const transport = new MockDeviceTransport('PeriPage_A6');
        await driver.bindTransport(transport);

        // Density 10 clamped to 2
        await driver.printInit({ density: 10, copies: 1 });
        expect(transport.writtenPackets[2]).toEqual(new Uint8Array([0x10, 0xff, 0x10, 0x00, 0x02]));

        // Clear and test density -5 clamped to 0
        transport.writtenPackets.length = 0;
        await driver.printInit({ density: -5, copies: 1 });
        expect(transport.writtenPackets[2]).toEqual(new Uint8Array([0x10, 0xff, 0x10, 0x00, 0x00]));
    });

    it('clamps feed distance to 0..255 and respects feed overrides', async () => {
        const driver = new PeriPageDriver(PERIPAGE_A6_PROFILE);
        const transport = new MockDeviceTransport('PeriPage_A6');
        await driver.bindTransport(transport);

        const page = monoPage({ width: 1, height: 1, data: new Uint8Array(4).fill(255) });

        // 10mm at 8 dpmm = 80 dots
        await driver.printInit({
            density: 1,
            copies: 1,
            feedOverrides: { feedAfterMm: 10 },
        });
        await driver.printPage(page);
        await driver.printEnd();

        const feedPacket = transport.writtenPackets[transport.writtenPackets.length - 2];
        expect(feedPacket).toEqual(new Uint8Array([0x1b, 0x4a, 80]));

        // Large override 100mm at 8 dpmm = 800 dots -> clamped to 255 (0xFF)
        transport.writtenPackets.length = 0;
        await driver.printInit({
            density: 1,
            copies: 1,
            feedOverrides: { feedAfterMm: 100 },
        });
        await driver.printPage(page);
        await driver.printEnd();

        const clampedFeedPacket = transport.writtenPackets[transport.writtenPackets.length - 2];
        expect(clampedFeedPacket).toEqual(new Uint8Array([0x1b, 0x4a, 0xff]));
    });
});
