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
        expect(driver.isCompatible('T02E')).toBe(true);
        expect(driver.isCompatible('q02e')).toBe(true);
        expect(driver.isCompatible('C02E')).toBe(true);
        expect(driver.isCompatible('T02E-ABCD')).toBe(false);
        expect(driver.isCompatible('GT02-ABCD')).toBe(false);
        expect(driver.isCompatible('YT02')).toBe(false);
        expect(driver.isCompatible('M220')).toBe(false);
    });

    it('uses model-specific public raster widths', async () => {
        const driver = new PhomemoMSeriesDriver();
        await driver.bindTransport(new MockTransport('M200'));
        expect(driver.getCapabilities().canvasHeightPx).toBe(608);
    });

    it('maps T02 aliases to the T02 dimensions', async () => {
        const driver = new PhomemoMSeriesDriver();
        await driver.bindTransport(new MockTransport('Q02E'));
        expect(driver.getCapabilities().canvasHeightPx).toBe(384);
        expect(driver.getCapabilities().physical?.supportedMediaWidthsMm).toBe(48);
    });
});
