import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { PhomemoP12Driver } from './phomemo-p12-driver';

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'Mock BLE';
    readonly writes: Uint8Array[] = [];
    constructor(private readonly deviceName: string) { super(); }
    async connect() {}
    async disconnect() {}
    async startNotifications() {}
    isConnected() { return true; }
    getDeviceName() { return this.deviceName; }
    async write(data: Uint8Array) {
        this.writes.push(new Uint8Array(data));
        queueMicrotask(() => this.emit('data', new Uint8Array([1])));
    }
}

describe('PhomemoP12Driver', () => {
    it('matches the exact tape family without swallowing unrelated names', () => {
        const driver = new PhomemoP12Driver();
        expect(driver.isCompatible('P12PRO-1')).toBe(true);
        expect(driver.isCompatible('A30')).toBe(true);
        expect(driver.isCompatible('P120')).toBe(false);
    });

    it('uses 120 dots for A30 and 96 for P12', async () => {
        const a30 = new PhomemoP12Driver();
        await a30.bindTransport(new MockTransport('A30'));
        expect(a30.getCapabilities().canvasHeightPx).toBe(120);

        const p12 = new PhomemoP12Driver();
        await p12.bindTransport(new MockTransport('P12'));
        expect(p12.getCapabilities().canvasHeightPx).toBe(96);
    });

    it('waits through all six setup exchanges', async () => {
        const driver = new PhomemoP12Driver();
        const transport = new MockTransport('P12');
        await driver.bindTransport(transport);
        await driver.printInit({ density: 1, copies: 1 });
        expect(transport.writes).toHaveLength(6);
        expect([...transport.writes[0]]).toEqual([0x1f, 0x11, 0x38]);
    });
});

