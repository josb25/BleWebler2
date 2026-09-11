import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { PhomemoMSeriesDriver } from './phomemo-m-series-driver';

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'Mock BLE';
    readonly writes: Uint8Array[] = [];
    constructor(private readonly deviceName: string) { super(); }
    async connect() {}
    async disconnect() {}
    async startNotifications() {}
    isConnected() { return true; }
    getDeviceName() { return this.deviceName; }
    async write(data: Uint8Array) { this.writes.push(new Uint8Array(data)); }
}

describe('PhomemoMSeriesDriver', () => {
    it('keeps M220 on its captured M110-family driver', () => {
        const driver = new PhomemoMSeriesDriver();
        expect(driver.isCompatible('M200-1')).toBe(true);
        expect(driver.isCompatible('T02')).toBe(true);
        expect(driver.isCompatible('M220')).toBe(false);
    });

    it('uses model-specific public raster widths', async () => {
        const driver = new PhomemoMSeriesDriver();
        await driver.bindTransport(new MockTransport('M200'));
        expect(driver.getCapabilities().canvasHeightPx).toBe(608);
    });
});

