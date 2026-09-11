import { describe, expect, it, vi } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';
import { CatPrinterV5cDriver } from './v5c-driver';
import { pauseNotification, resumeNotification } from './v5c-protocol';

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'mock';
    writes: Uint8Array[] = [];
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
    isConnected = () => true;
    getDeviceName = () => 'YTB01';
    write = vi.fn(async (data: Uint8Array) => { this.writes.push(data); });
    startNotifications = vi.fn(async () => undefined);
}

describe('Catprinter V5C driver', () => {
    it('recognises YTB01 names only', () => {
        const driver = new CatPrinterV5cDriver();
        expect(driver.isCompatible('YTB01')).toBe(true);
        expect(driver.isCompatible('YTB01_1234')).toBe(true);
        expect(driver.isCompatible('YT01')).toBe(false);
    });

    it('sends connect, print, row, end, and status packets', async () => {
        const driver = new CatPrinterV5cDriver();
        const transport = new MockTransport();
        await driver.bindTransport(transport);
        await driver.printInit({ density: 3, copies: 1 });
        await driver.printPage(monoPage({
            data: new Uint8Array(4 * 384).fill(0xff),
            width: 1,
            height: 384
        }));
        await driver.printEnd();

        expect(transport.writes.map(packet => packet[2])).toEqual([0xaa, 0xa2, 0xa3, 0xa4, 0xa6, 0xa1]);
        expect([...transport.writes[1].slice(6, 8)]).toEqual([3, 2]);
    });

    it('pauses writes until a resume notification arrives', async () => {
        const driver = new CatPrinterV5cDriver();
        const transport = new MockTransport();
        await driver.bindTransport(transport);
        transport.emit('data', pauseNotification);

        const pending = driver.printInit({ density: 2, copies: 1 });
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(transport.writes).toHaveLength(1);
        transport.emit('data', resumeNotification);
        await pending;
        expect(transport.writes).toHaveLength(3);
    });
});
