import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';
import { PhomemoDqDriver } from './phomemo-dq-driver';

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

describe('PhomemoDqDriver', () => {
    it('matches only explicit family names', () => {
        const driver = new PhomemoDqDriver();
        expect(driver.isCompatible('Q30S-1234')).toBe(true);
        expect(driver.isCompatible('D110_01')).toBe(true);
        expect(driver.isCompatible('D11')).toBe(false);
        expect(driver.isCompatible('Printer')).toBe(false);
    });

    it('uses the model-specific printhead width', async () => {
        const driver = new PhomemoDqDriver();
        await driver.bindTransport(new MockTransport('D50'));
        expect(driver.getCapabilities().canvasHeightPx).toBe(192);
    });

    it('emits setup, raster and end packets in order', async () => {
        const driver = new PhomemoDqDriver();
        const transport = new MockTransport('Q30');
        await driver.bindTransport(transport);
        await driver.printInit({
            density: 6,
            copies: 1,
            paper: { id: 'gap', name: 'Gap', type: 'gap', tapeWidthMm: 12 }
        });
        await driver.printPage(monoPage({ width: 1, height: 96, data: new Uint8Array(96 * 4).fill(255) }));
        await driver.printEnd();

        expect([...transport.writes[0]]).toEqual([0x1b, 0x37, 0x07, 140, 0x02]);
        expect([...transport.writes[1]]).toEqual([0x1f, 0x11, 0x0a]);
        expect([...transport.writes[2]]).toEqual([0x1b, 0x40, 0x1d, 0x76, 0x30, 0, 12, 0, 1, 0]);
        expect(transport.writes[3]).toEqual(new Uint8Array(12));
        expect([...transport.writes[4]]).toEqual([0x1b, 0x64, 0x00]);
    });
});
