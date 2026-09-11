import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';
import { PhomemoM02Driver } from './phomemo-m02-driver';

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

describe('PhomemoM02Driver', () => {
    it('matches explicit models and the documented Mr.in advertising name', () => {
        const driver = new PhomemoM02Driver();
        expect(driver.isCompatible('M02X-1234')).toBe(true);
        expect(driver.isCompatible('Mr.in_M02')).toBe(true);
        expect(driver.isCompatible('M03')).toBe(false);
    });

    it('keeps the 300 dpi Pro raster width separate', async () => {
        const driver = new PhomemoM02Driver();
        await driver.bindTransport(new MockTransport('M02PRO'));
        expect(driver.getCapabilities().canvasHeightPx).toBe(624);
        expect(driver.getCapabilities().dpmm).toBe(12);
    });

    it('emits wake, setup, raster and minimal feed in order', async () => {
        const driver = new PhomemoM02Driver();
        const transport = new MockTransport('M02');
        await driver.bindTransport(transport);
        await driver.printInit({ density: 6, copies: 1 });
        await driver.printPage(monoPage({ width: 1, height: 384, data: new Uint8Array(384 * 4).fill(255) }));
        await driver.printEnd();

        expect([...transport.writes[0]]).toEqual([0x10, 0xff, 0xfe, 0x01]);
        expect([...transport.writes[1]]).toEqual([0x1b, 0x40]);
        expect([...transport.writes[3]]).toEqual([0x1d, 0x76, 0x30, 0, 48, 0, 1, 0]);
        expect(transport.writes[4]).toEqual(new Uint8Array(48));
        expect([...transport.writes[5]]).toEqual([0x1b, 0x4a, 0x08]);
    });
});

