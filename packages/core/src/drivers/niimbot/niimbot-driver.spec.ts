import { describe, expect, it, vi } from "vitest";
import { LabelType, PrinterModel } from "@mmote/niimbluelib";
import { encodeNiimbotImage, loadedMediaFromRfid, NiimbotDriver } from "./niimbot-driver";

describe("NiimbotDriver", () => {
    it("uses the NiimBlue alpha.42 model catalogue", () => {
        expect(PrinterModel.B21_L2B).toBe("B21_L2B");
    });

    it("matches supported Niimbot device names without claiming unrelated printers", () => {
        const driver = new NiimbotDriver();
        expect(driver.isCompatible("NIIMBOT B21")).toBe(true);
        expect(driver.isCompatible("D110")).toBe(true);
        expect(driver.isCompatible("Marklife P12")).toBe(false);
    });

    it("exposes a conservative disconnected capability profile", () => {
        const capabilities = new NiimbotDriver().getCapabilities();
        expect(capabilities).toMatchObject({
            canvasHeightPx: 96,
            maxDensity: 3,
            dpmm: 8,
            driverName: "Niimbot Generic Printer"
        });
    });

    it("uses the driver model profile when D11_H firmware has no library metadata", () => {
        const driver = new NiimbotDriver();
        (driver as any).connectedDeviceName = 'NIIMBOT D11_H';
        (driver as any).client = { getModelMetadata: () => undefined };

        const capabilities = driver.getCapabilities();
        expect(capabilities.canvasHeightPx).toBe(142);
        expect(capabilities.dpmm).toBeCloseTo(300 / 25.4, 6);
    });

    it("maps the complete NIIMBOT NFC response into typed loaded media", () => {
        expect(loadedMediaFromRfid({
            tagPresent: true,
            uuid: "001122AABB",
            barCode: "T15X30-WHITE",
            serialNumber: "ROLL-123",
            allPaper: 160,
            usedPaper: 41,
            consumablesType: LabelType.WithGaps,
            capacity: 200
        })).toEqual({
            kind: 'gap',
            id: '001122AABB',
            name: 'NIIMBOT NFC roll T15X30-WHITE',
            identification: {
                technology: 'nfc',
                uid: '001122AABB',
                barcode: 'T15X30-WHITE',
                serialNumber: 'ROLL-123'
            },
            total: 160,
            used: 41,
            remaining: 119,
            capacity: 200
        });
    });

    it("does not claim media when the RFID reader reports no tag", () => {
        expect(loadedMediaFromRfid({
            tagPresent: false,
            uuid: "",
            barCode: "",
            serialNumber: "",
            allPaper: -1,
            usedPaper: -1,
            consumablesType: LabelType.Invalid
        })).toBeUndefined();
    });

    it("resolves an opaque NFC catalogue key locally without a network request", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        try {
            const resolved = await new NiimbotDriver().resolveMedia({
                kind: 'gap',
                identification: { technology: 'nfc', barcode: '01222281' }
            });

            expect(resolved).toMatchObject({
                name: 'NIIMBOT 12 × 40 mm',
                kind: 'gap',
                widthMm: 12,
                lengthMm: 40
            });
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("does not infer dimensions from unknown or descriptive identifiers", async () => {
        const driver = new NiimbotDriver();
        const descriptive = {
            kind: 'gap' as const,
            identification: { technology: 'nfc' as const, barcode: 'T12*40-155WHITE' }
        };
        const unknown = {
            kind: 'gap' as const,
            identification: { technology: 'nfc' as const, barcode: '6977031210613' }
        };

        await expect(driver.resolveMedia(descriptive)).resolves.toBe(descriptive);
        await expect(driver.resolveMedia(unknown)).resolves.toBe(unknown);
    });

    it("byte-pads the D11_H raster without changing its 142-dot logical width", () => {
        const data = new Uint8ClampedArray(8 * 142 * 4);
        data.fill(255);
        data[0] = 0;
        data[1] = 0;
        data[2] = 0;
        data[3] = 255;

        const encoded = encodeNiimbotImage({ data, width: 8, height: 142 }, 142);

        expect(encoded).toMatchObject({ cols: 142, rows: 8 });
        const pixels = encoded.rowsData.find(row => row.dataType === 'pixels');
        expect(pixels?.rowData).toHaveLength(18);
        expect(pixels?.rowData?.[17]).toBe(0x04);
    });

    it("refreshes live battery state and independently recovers missing identity fields", async () => {
        const driver = new NiimbotDriver();
        const info: Record<string, unknown> = {};
        const api = {
            getPrinterModel: vi.fn(async () => 512),
            getPrinterSerialNumber: vi.fn(async () => 'PRINTER-123'),
            getSoftwareVersion: vi.fn(async () => '5.12'),
            getHardwareVersion: vi.fn(async () => '2.01'),
            getBatteryChargeLevel: vi.fn(async () => 3),
            rfidInfo: vi.fn(async () => ({ tagPresent: false })),
            getPrinterBluetoothMacAddress: vi.fn(async () => 'AA:BB:CC:DD:EE:FF'),
            getAutoShutDownTime: vi.fn(async () => 2),
            getLabelType: vi.fn(async () => LabelType.WithGaps),
            getPrinterStatusData: vi.fn(async () => ({ protocolVersion: 3, supportColor: 0 }))
        };
        (driver as any).client = {
            abstraction: api,
            getPrinterInfo: () => info,
            getModelMetadata: () => ({ model: 'B21' })
        };

        await expect(driver.getStatus()).resolves.toMatchObject({
            identity: {
                deviceName: 'B21',
                serialNumber: 'PRINTER-123',
                firmwareVersion: '5.12',
                hardwareVersion: '2.01'
            },
            battery: { level: 0.75 },
            details: expect.arrayContaining([
                { id: 'model-id', label: 'Model ID', value: '512', monospace: true },
                { id: 'protocol', label: 'Protocol', value: '3', monospace: true },
                { id: 'bluetooth-address', label: 'Bluetooth', value: 'AA:BB:CC:DD:EE:FF', monospace: true },
                { id: 'auto-off', label: 'Auto-off', value: 'Preset 2', monospace: false },
                { id: 'label-mode', label: 'Paper mode', value: 'gap', monospace: false }
            ])
        });
        expect(api.getBatteryChargeLevel).toHaveBeenCalledOnce();
        expect(info).toMatchObject({
            modelId: 512,
            serial: 'PRINTER-123',
            softwareVersion: '5.12',
            hardwareVersion: '2.01',
            charge: 3
        });
    });
});
