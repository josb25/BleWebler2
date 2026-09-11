import EventEmitter from 'eventemitter3';
import { describe, expect, it } from 'vitest';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';
import { OrgstaS001Driver } from './orgsta-s001-driver';

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'Mock serial';
    readonly writes: Uint8Array[] = [];
    async connect() {}
    async disconnect() {}
    isConnected() { return true; }
    getDeviceName() { return 'S001'; }
    async write(data: Uint8Array) { this.writes.push(new Uint8Array(data)); }
}

describe('OrgstaS001Driver', () => {
    it('matches only the captured Bluetooth name', () => {
        const driver = new OrgstaS001Driver(0);
        expect(driver.isCompatible('S001')).toBe(true);
        expect(driver.isCompatible('s001')).toBe(true);
        expect(driver.isCompatible('S001-extra')).toBe(false);
    });

    it('emits the captured tag-label command order and sequence numbers', async () => {
        const transport = new MockTransport();
        const driver = new OrgstaS001Driver(0);
        await driver.bindTransport(transport);
        await driver.printInit({ density: 3, copies: 1 });
        await driver.printPage(monoPage({ width: 4, height: 90, data: new Uint8Array(4 * 90 * 4).fill(255) }));
        await driver.printEnd();

        expect(transport.writes.map(packet => packet[1])).toEqual([0x0a, 0x09, 0x28, 0x03, 0x02, 0x00, 0x03]);
        expect(transport.writes.map(packet => packet[2])).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect([...transport.writes[0].slice(5, -5)]).toEqual([25]);
        expect([...transport.writes[1].slice(5, -5)]).toEqual([9]);
        expect([...transport.writes[2].slice(5, -5)]).toEqual([1, 1]);
        expect([...transport.writes[3].slice(5, -5)]).toEqual([2, 0x20, 0x03]);
        expect([...transport.writes[4].slice(5, -5)]).toEqual([2, 0]);
        expect(transport.writes[5].slice(5, -5)).toEqual(new Uint8Array(48));
        expect([...transport.writes[6].slice(5, -5)]).toEqual([1, 0x20, 0x03]);
    });

    it('rejects BLE until an S001 GATT endpoint is verified', async () => {
        const transport = new MockTransport() as MockTransport & { filterType: 'bluetooth-le' };
        transport.filterType = 'bluetooth-le';
        await expect(new OrgstaS001Driver(0).bindTransport(transport)).rejects.toThrow('Bluetooth Classic/SPP');
    });
});
