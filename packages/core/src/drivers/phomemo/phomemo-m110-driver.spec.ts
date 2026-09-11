import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';
import { PhomemoM110Driver } from './phomemo-m110-driver';

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

describe('PhomemoM110Driver', () => {
    it('recognises explicit model names and the M110S advertising alias', () => {
        const driver = new PhomemoM110Driver();
        expect(driver.isCompatible('M120-1234')).toBe(true);
        expect(driver.isCompatible('Q199E_ABCD')).toBe(true);
        expect(driver.isCompatible('M200')).toBe(false);
    });

    it('uses captured 43-byte rows for M110 and wide rows for M220', async () => {
        const narrow = new PhomemoM110Driver();
        await narrow.bindTransport(new MockTransport('M110'));
        expect(narrow.getCapabilities().canvasHeightPx).toBe(344);

        const wide = new PhomemoM110Driver();
        await wide.bindTransport(new MockTransport('M220'));
        expect(wide.getCapabilities().canvasHeightPx).toBe(576);
    });

    it('emits model setup, raster and the captured footer', async () => {
        const driver = new PhomemoM110Driver();
        const transport = new MockTransport('M110');
        await driver.bindTransport(transport);
        await driver.printInit({ density: 12, copies: 1, speed: 4 });
        await driver.printPage(monoPage({ width: 1, height: 344, data: new Uint8Array(344 * 4).fill(255) }));
        await driver.printEnd();

        expect([...transport.writes[0]]).toEqual([0x1b, 0x4e, 0x0d, 4]);
        expect([...transport.writes[1]]).toEqual([0x1b, 0x4e, 0x04, 12]);
        expect([...transport.writes[2]]).toEqual([0x1f, 0x11, 0x0a]);
        expect([...transport.writes[3]]).toEqual([0x1d, 0x76, 0x30, 0, 43, 0, 1, 0]);
        expect(transport.writes[4]).toEqual(new Uint8Array(43));
        expect([...transport.writes[5]]).toEqual([0x1f, 0xf0, 0x05, 0, 0x1f, 0xf0, 0x03, 0]);
    });
});

