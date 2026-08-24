import { describe, expect, it, vi } from "vitest";
import { WebSerialTransport } from "./web-serial-transport";

describe("WebSerialTransport", () => {
    it("opens, writes, and forwards incoming bytes", async () => {
        const written: Uint8Array[] = [];
        let incoming: ReadableStreamDefaultController<Uint8Array>;
        const readable = new ReadableStream<Uint8Array>({
            start(controller) { incoming = controller; }
        });
        const writable = new WritableStream<Uint8Array>({
            write(chunk) { written.push(chunk); }
        });
        const port = {
            readable,
            writable,
            open: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
            getInfo: () => ({})
        };
        const serial = { requestPort: vi.fn().mockResolvedValue(port) };
        const transport = new WebSerialTransport({ serial, baudRate: 9600 });
        const received = vi.fn();
        transport.on("data", received);

        await transport.connect();
        await transport.write(new Uint8Array([0x10, 0x20]));
        await transport.startNotifications();
        incoming!.enqueue(new Uint8Array([0x30, 0x40]));
        await vi.waitFor(() => expect(received).toHaveBeenCalled());

        expect(port.open).toHaveBeenCalledWith({ baudRate: 9600 });
        expect(written).toEqual([new Uint8Array([0x10, 0x20])]);
        expect(received).toHaveBeenCalledWith(new Uint8Array([0x30, 0x40]));
        await transport.disconnect();
        expect(port.close).toHaveBeenCalled();
    });
});
