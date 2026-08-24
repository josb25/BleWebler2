import { describe, expect, it, vi } from 'vitest';
import { CapacitorClassicTransport } from './capacitor-classic-transport';

const handle = () => ({ remove: vi.fn(async () => undefined) });

describe('CapacitorClassicTransport', () => {
    it('matches one paired printer and preserves arbitrary bytes', async () => {
        let written = '';
        const api = {
            requestPermissions: vi.fn(async () => undefined),
            listDevices: vi.fn(async () => ({ devices: [
                { name: 'Speaker', address: '00:00' },
                { name: 'P12', address: '11:22' }
            ] })),
            connect: vi.fn(async () => undefined),
            disconnect: vi.fn(async () => undefined),
            write: vi.fn(async ({ data }: { data: string }) => { written = data; }),
            addListener: vi.fn(async () => handle())
        };
        const transport = new CapacitorClassicTransport({}, api as never);

        await transport.connect([{ namePrefix: 'P' }]);
        await transport.write(Uint8Array.of(0, 127, 128, 255));

        expect(api.connect).toHaveBeenCalledWith({ address: '11:22', insecure: undefined });
        expect(Array.from(Uint8Array.from(atob(written), char => char.charCodeAt(0)))).toEqual([0, 127, 128, 255]);
    });

    it('refuses an ambiguous paired-device selection', async () => {
        const api = {
            requestPermissions: async () => undefined,
            listDevices: async () => ({ devices: [
                { name: 'P12', address: '11' },
                { name: 'P15', address: '22' }
            ] })
        };
        const transport = new CapacitorClassicTransport({}, api as never);
        await expect(transport.connect([{ namePrefix: 'P' }])).rejects.toThrow('More than one');
    });
});
