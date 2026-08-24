import { WebUsbTransport } from "./web-usb-transport";

/** WebUSB-compatible bulk transport backed by the Node.js `usb` package. */
export class NodeUsbTransport extends WebUsbTransport {
    public override readonly type = "USB-Node";

    constructor() {
        super(false);
    }

    protected override async getUsbApi(): Promise<USB> {
        const { webusb } = await import("usb");
        return webusb as unknown as USB;
    }
}
