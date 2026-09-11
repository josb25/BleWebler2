import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';
import { PhomemoM04Driver } from './phomemo-m04-driver';

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

function blank(width: number, height: number) {
    return monoPage({ width, height, data: new Uint8Array(width * height * 4).fill(255) });
}

describe('PhomemoM04Driver', () => {
    it('matches M04S/M04AS without swallowing unrelated model names', () => {
        const driver = new PhomemoM04Driver();
        expect(driver.isCompatible('M04AS_1234')).toBe(true);
        expect(driver.isCompatible('M04S-1')).toBe(true);
        expect(driver.isCompatible('M04')).toBe(false);
        expect(driver.isCompatible('M04PRO')).toBe(false);
    });

    it('advertises the maximum 300 dpi mechanism and model-specific media range', async () => {
        const m04as = new PhomemoM04Driver();
        await m04as.bindTransport(new MockTransport('M04AS'));
        expect(m04as.getCapabilities()).toMatchObject({
            canvasHeightPx: 1232,
            dpmm: 12,
            physical: { supportedMediaWidthsMm: { min: 15, max: 110 } }
        });

        const m04s = new PhomemoM04Driver();
        await m04s.bindTransport(new MockTransport('M04S'));
        expect(m04s.getCapabilities().physical?.supportedMediaWidthsMm).toEqual({ min: 53, max: 110 });
    });

    it('chooses the captured raster width from the selected paper', async () => {
        const driver = new PhomemoM04Driver();
        const transport = new MockTransport('M04AS');
        await driver.bindTransport(transport);
        await driver.printInit({
            density: 4,
            copies: 1,
            paper: { id: '80mm', name: '80 mm', type: 'continuous', tapeWidthMm: 80 }
        });
        await driver.printPage(blank(1, 896));

        expect([...transport.writes[0]]).toEqual([0x1f, 0x11, 0x02, 8]);
        expect([...transport.writes[4]]).toEqual([0x1d, 0x76, 0x30, 0, 112, 0, 1, 0]);
        expect(transport.writes[5]).toHaveLength(112);
    });
});

