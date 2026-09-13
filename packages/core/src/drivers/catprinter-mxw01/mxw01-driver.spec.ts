import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';
import { makeControlPacket } from './mxw01-protocol';
import { CatPrinterMxw01Driver } from './mxw01-driver';

type WriteOptions = Parameters<IDeviceTransport['write']>[1];

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'Mock BLE';
    readonly writes: Array<{ data: Uint8Array; options?: WriteOptions }> = [];
    async connect() {}
    async disconnect() {}
    async startNotifications() {}
    isConnected() { return true; }
    getDeviceName() { return 'MXW01'; }
    async write(data: Uint8Array, options?: WriteOptions) {
        this.writes.push({ data: new Uint8Array(data), options });
        if (data[2] === 0xa9) queueMicrotask(() => this.emit('data', makeControlPacket(0xa9, new Uint8Array([0]))));
    }
}

describe('CatPrinterMxw01Driver', () => {
    it('recognises the documented family and clone names', () => {
        const driver = new CatPrinterMxw01Driver();
        expect(driver.isCompatible('MXW01-1')).toBe(true);
        expect(driver.isCompatible('AC695X_PRINT')).toBe(true);
        expect(driver.isCompatible('PORTABLEPRINTER_123')).toBe(true);
        expect(driver.isCompatible('MXW010')).toBe(false);
    });

    it('sends control and bulk raster over separate characteristics', async () => {
        const driver = new CatPrinterMxw01Driver();
        const transport = new MockTransport();
        await driver.bindTransport(transport);
        await driver.printInit({ density: 4, copies: 1 });
        await driver.printPage(monoPage({ width: 1, height: 384, data: new Uint8Array(384 * 4).fill(255) }));
        await driver.printEnd();

        expect(transport.writes[0].data[2]).toBe(0xa2);
        expect([...transport.writes[1].data.slice(0, 10)]).toEqual([0x22, 0x21, 0xa9, 0, 4, 0, 90, 0, 0x30, 0]);
        expect(transport.writes[1].options?.writeUUID).toContain('ae01');
        expect(transport.writes[2].data).toHaveLength(48);
        expect(transport.writes[2].options?.writeUUID).toContain('ae03');
        expect(transport.writes.at(-1)?.data[2]).toBe(0xad);
    });
});
