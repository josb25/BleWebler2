import { describe, expect, it, vi } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';
import { challengeCrc } from './funny-lx-protocol';
import { FunnyLxDriver } from './funny-lx-driver';

const RANDOM = new Uint8Array([0xf7, 0xcf, 1, 2, 3, 4, 5, 6, 7, 8]);
const MAC = new Uint8Array([0xc0, 0, 0, 0, 0x04, 0x60]);

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'mock';
    writes: Uint8Array[] = [];
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
    isConnected = () => true;
    getDeviceName = () => 'LX-D02';
    startNotifications = vi.fn(async () => undefined);
    write = vi.fn(async (data: Uint8Array) => {
        this.writes.push(data);
        const crc = challengeCrc(RANDOM, MAC);
        if (data[0] === 0x5a && data[1] === 0x01) {
            queueMicrotask(() => this.emit('data', new Uint8Array([0x5a, 0x01, 0, 3, ...MAC])));
        } else if (data[0] === 0x5a && data[1] === 0x0a) {
            queueMicrotask(() => this.emit('data', new Uint8Array([0x5a, 0x0a, ...crc.low])));
        } else if (data[0] === 0x5a && data[1] === 0x0b) {
            queueMicrotask(() => this.emit('data', new Uint8Array([0x5a, 0x0b, 1])));
        } else if (data[0] === 0x55) {
            queueMicrotask(() => this.emit('data', new Uint8Array([0x5a, 0x06, 0])));
        } else if (data[0] === 0x5a && data[1] === 0x04 && data.length === 5) {
            queueMicrotask(() => this.emit('data', data));
        }
    });
}

describe('Funny Print LX driver', () => {
    it('matches only the documented LX-D names and BH-01 marketing name', () => {
        const driver = new FunnyLxDriver(() => RANDOM);
        expect(driver.isCompatible('LX-D02')).toBe(true);
        expect(driver.isCompatible('BH-01')).toBe(true);
        expect(driver.isCompatible('LX-D002')).toBe(false);
    });

    it('authenticates and completes one raster packet with acknowledgements', async () => {
        const driver = new FunnyLxDriver(() => RANDOM);
        const transport = new MockTransport();
        await driver.bindTransport(transport);
        await driver.printInit({ density: 5, copies: 1 });
        await driver.printPage(monoPage({
            data: new Uint8Array(2 * 384 * 4).fill(0xff),
            width: 2,
            height: 384
        }));
        await driver.printEnd();

        expect(transport.startNotifications).toHaveBeenCalledWith({
            serviceUUID: '0000ffe6-0000-1000-8000-00805f9b34fb',
            notifyUUID: '0000ffe2-0000-1000-8000-00805f9b34fb'
        });
        expect(transport.writes.map(packet => [...packet.slice(0, 2)])).toEqual([
            [0x5a, 0x01], [0x5a, 0x0a], [0x5a, 0x0b], [0x5a, 0x0c],
            [0x5a, 0x04], [0x55, 0x00], [0x5a, 0x04]
        ]);
        expect(transport.writes[3][2]).toBe(4);
    });
});
