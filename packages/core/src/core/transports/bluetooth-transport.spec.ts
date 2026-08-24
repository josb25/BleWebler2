import { afterEach, describe, expect, it, vi } from 'vitest';
import { UniversalBluetoothTransport } from './bluetooth-transport';

describe('UniversalBluetoothTransport', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('reconnects once when initial GATT service discovery drops', async () => {
        let connected = false;
        const service = { uuid: '0000fee0-0000-1000-8000-00805f9b34fb' };
        const firstServer = {
            get connected() { return connected; },
            getPrimaryServices: vi.fn(async () => {
                connected = false;
                throw new DOMException('GATT Server is disconnected.', 'NetworkError');
            })
        };
        const secondServer = {
            get connected() { return connected; },
            getPrimaryServices: vi.fn(async () => [service])
        };
        const gatt = {
            get connected() { return connected; },
            connect: vi.fn(async () => {
                connected = true;
                return gatt.connect.mock.calls.length === 1 ? firstServer : secondServer;
            }),
            disconnect: vi.fn(() => { connected = false; })
        };
        const device = {
            name: 'NIIMBOT D11_H',
            gatt,
            addEventListener: vi.fn()
        };
        vi.stubGlobal('navigator', {
            bluetooth: { requestDevice: vi.fn(async () => device) }
        });

        const transport = new UniversalBluetoothTransport();
        await transport.connect([{ services: [service.uuid] }]);

        expect(gatt.connect).toHaveBeenCalledTimes(2);
        await expect(transport.getPrimaryServices()).resolves.toEqual([service.uuid]);
        expect(secondServer.getPrimaryServices).toHaveBeenCalledOnce();
    });

    it('does not hide a disconnected GATT server as an empty service list', async () => {
        let connected = true;
        const server = {
            get connected() { return connected; },
            getPrimaryServices: vi.fn(async () => [])
        };
        const gatt = {
            get connected() { return connected; },
            connect: vi.fn(async () => server),
            disconnect: vi.fn(() => { connected = false; })
        };
        vi.stubGlobal('navigator', {
            bluetooth: {
                requestDevice: vi.fn(async () => ({
                    name: 'NIIMBOT D11_H', gatt, addEventListener: vi.fn()
                }))
            }
        });

        const transport = new UniversalBluetoothTransport();
        await transport.connect();
        connected = false;

        await expect(transport.getPrimaryServices()).rejects.toMatchObject({ name: 'NetworkError' });
    });
});
