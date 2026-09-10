import { IPrinterDriver, PrinterCapabilities, UniversalPrintOptions, UniversalImageData } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import { IDeviceTransport } from '../../core/transports/transport.interface';
import * as Protocol from './protocol';
import { encodeRaster, encodeRasterGsV0 } from './raster';
import { MarklifeFlowControl } from "./marklife-flow-control";
import type { PrinterStatus, StatusField, PrinterFault } from '../printer-status';
import { PrinterError, toPrinterError } from '../printer-error';

export interface DeviceProfile {
    prefixes: string[];
    canvasHeightPx: number;
}

export const MARKLIFE_PROFILES: DeviceProfile[] = [
    { prefixes: ['P80', 'P80S', 'L80'], canvasHeightPx: 576 },
    { prefixes: ['P50', 'P50S', 'D50', 'M57', 'S8', 'L50', 'X2', 'S2', 'SB_S2', 'Jammuk_S2', 'LPW40'], canvasHeightPx: 384 },
    { prefixes: ['P11', 'P12', 'P15', 'P7', 'L13', 'LP15', 'iSPACE-LP15', 'LP90'], canvasHeightPx: 96 },
    { prefixes: ['LuckP_D1', 'D210', 'IP_D80', '210', 'DP_D80', 'DP_8028', 'HM-24-28', 'T3', 'ET-Z0535', 'ET-Z0537', 'X4', 'L100'], canvasHeightPx: 384 } // Assumed wide for unknown labels
];

const buildFamily = (
    brand: string,
    family: string,
    models: string[],
    baseSpec: any
) => {
    return models.map(model => ({
        id: `${brand.toLowerCase().replace(/[^a-z0-9]/g, '')}_${model.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        brand,
        model,
        family,
        ...baseSpec
    }));
};

const marklife15mm = buildFamily('Marklife', 'Marklife 15mm Series', ['P11', 'P12', 'P15', 'P7', 'L13', 'LP15', 'iSPACE-LP15', 'LP90'], {
    capabilities: {
        canvasHeightPx: 96,
        dpmm: 8,
        maxDensity: 15,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: 15 }
    },
    supportLevel: 'Untested',
});

const p12 = marklife15mm.find(m => m.model === 'P12');
if (p12) {
    p12.manualUrl = 'https://fcc.report/FCC-ID/2A2AI-P12/5793950.pdf';
    p12.capabilities = { ...p12.capabilities, physical: { ...p12.capabilities.physical, headToCutterPx: 66 } };
    p12.supportLevel = 'Tested';
    p12.notes = `- **OEM**: Shenzhen Yinxiaoqian Technology Co., Ltd.
- **MCU**: YC3121-d
- **FCC ID**: [2A2AI-P12](https://fcc.report/FCC-ID/2A2AI-P12/)
- **Battery**: 1200mAh (18650) via Type-C
- **Print Speed**: 20mm/s
- **Dimensions**: 90 × 74 × 35 mm
- **Weight**: 250g`;
}

const p15 = marklife15mm.find(m => m.model === 'P15');
if (p15) {
    p15.manualUrl = 'https://fcc.report/FCC-ID/2A2AI-P15/7600816.pdf';
}

const lp90 = marklife15mm.find(m => m.model === 'LP90');
if (lp90) {
    // Korean-market 15 mm unit. The manufacturer's own app files it with the
    // P12 everywhere that matters — same 96-dot head, same label sizes, same
    // density table — but drives it through its older "L11" command path
    // (see LEGACY_L11_PREFIXES below) rather than the P12's 1F job control.
    lp90.notes = `Sold in Korea; the manufacturer's app treats it as a P12-class 96-dot printer.

Driven with the manufacturer's legacy job framing (\`10 FF F1 02\` … \`10 FF F1 45\`)
and an uncompressed \`GS v 0\` raster, which is exactly what the official app sends
to this model.`;
}

const l13 = marklife15mm.find(m => m.model === 'L13');
if (l13) {
    // Rebadged 15 mm unit sold under several house brands and identified by the
    // `L13_..._BLE` device name.
    l13.manualUrl = 'https://manuals.plus/munbyn/l13-label-printer-manual';
    // Confirmed working against a real unit: prints correctly and behaves
    // essentially as a P12 does.
    l13.supportLevel = 'Tested';
    // Marklife appears to be the OEM's own brand, but they do not sell an L13
    // under it — every unit reaches buyers rebadged. It sits in this driver
    // because it speaks this driver's protocol, not because it is a Marklife
    // product.
    l13.rebadgeOnly = true;
    // The retail names, in full, exactly as they appear on the products. Listed
    // here rather than only in the prose below so the table can find this
    // printer by any of them — and full names cost nothing for search, since
    // matching is on substrings: "munbyn", "silvercrest" and "l13" all hit.
    //
    // Note the Lidl one carries no model number at retail; `L13` is what the
    // firmware answers, which is why the row is filed under it.
    l13.aliases = [
        'Silvercrest Thermo Label Printer',
        'MUNBYN L13 Label Printer',
        'Luckjingle L13 Mini Label Maker'
    ];
    l13.notes = `One printer sold under several names, none of them Marklife's own.
If a label maker is 15 mm, 203 dpi and answers to \`L13\`, it is very likely this
machine whatever the box says.

The Silvercrest version is Lidl's house brand and carries no model number on the
packaging; \`DP-L13\` is what the firmware reports.

> **No cutter**, despite the product photography. Listings for every brand show
> a cutter lever, and the shipped hardware does not have one — tear the label
> against the edge instead.

**Hardware**
- **MCU**: YiChip YC3121-D
- **Resolution**: 203 dpi (8 dots/mm), 96 px print width
- **Media**: 15 mm max tape; 14 × 30 mm labels typical
- **Battery**: 1200 mAh Li-Ion, USB-C
- **Print speed**: 20 mm/s
- **LEDs**: green — charged / normal; blue — charging or Bluetooth connected;
  red — cover open, out of paper, or charging; red flashing — low power

**Certification** — two FCC ids appear against Silvercrest-branded units and
this has not been reconciled; both are recorded rather than one guessed at:
- [2A6FW-L13](https://fcc.report/FCC-ID/2A6FW-L13/) (Xiamen Print Future Technology Co., Ltd.)
- [2BHE2-KS4732](https://fcc.report/FCC-ID/2BHE2-KS4732/) (KARSTEN INTERNATIONAL BV)

**Protocol** — the same as the P12: fully supported, including battery and
paper-out reporting.`;
}

const marklife48mm = buildFamily('Marklife', 'Marklife 48mm Series', ['P50', 'P50S', 'D50', 'M57', 'S8', 'L50', 'X2', 'S2', 'SB_S2', 'Jammuk_S2', 'LPW40'], {
    capabilities: { canvasHeightPx: 384, dpmm: 8, maxDensity: 15, supportsSpeedMode: true, colorSupport: { type: 'monochrome' }, physical: { supportedMediaWidthsMm: { min: 20, max: 50 } } },
    supportLevel: 'Untested'
});

const marklife72mm = buildFamily('Marklife', 'Marklife 72mm Series', ['P80', 'P80S', 'L80'], {
    capabilities: {
        canvasHeightPx: 576,
        dpmm: 8,
        maxDensity: 15,
        supportsSpeedMode: true,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: { min: 20, max: 80 } }
    },
    supportLevel: 'Untested'
});

const marklifeOEM = buildFamily('Marklife', 'Marklife OEM / Unknown', ['LuckP_D1', 'D210', 'IP_D80', '210', 'DP_D80', 'DP_8028', 'HM-24-28', 'T3', 'ET-Z0535', 'ET-Z0537', 'X4', 'L100', 'M1', 'P1S', 'A50', 'D200', 'LPC74', 'D100'], {
    capabilities: {
        canvasHeightPx: 384,
        dpmm: 8,
        maxDensity: 15,
        supportsSpeedMode: true,
        colorSupport: { type: 'monochrome' },
        physical: {  }
    },
    supportLevel: 'Untested'
});

export const MARKLIFE_HARDWARE_MODELS = [
    ...marklife15mm,
    ...marklife48mm,
    ...marklife72mm,
    ...marklifeOEM
];

// Models with dedicated schematic artwork are registered by the artwork module;
// the UI uses its neutral fallback for all other models.

/**
 * Models the manufacturer's app drives through its older "L11" path instead of
 * the `1F` job framing: a 15-byte wake-up, `10 FF F1 02` to open the job, an
 * uncompressed `GS v 0` raster, `1D 0C` (gap) or `1B 4A n` (continuous) to
 * position the label, and `10 FF F1 45` to close. None of the `1F 80`, `1F C0`,
 * `1F 11` or `1F 70` commands are sent to these models by the official app.
 *
 * Matched on the advertised name prefix, the same way the official app does.
 */
const LEGACY_L11_PREFIXES = ['LP90'];

/**
 * Marklife's `0x1F` protocol, and the `10 FF` INFO command family beside it.
 *
 * The INFO commands are not specific to one model — the same bytes answer on a
 * P12 and on an L13, which is sold under half a dozen brand names and behaves
 * essentially identically. Nothing guarantees that holds for the next printer,
 * so a model that ignores one of these is behaving normally, and every query
 * here tolerates silence rather than treating it as a fault.
 *
 *     10 FF 20 EF   hardware version
 *     10 FF 20 F0   model / name
 *     10 FF 20 F1   firmware version
 *     10 FF 20 F2   serial number
 *     10 FF 50 F1   battery, percentage in the second byte
 *     10 FF 40      paper, 0x00 present / 0x04 absent
 *     10 FF 10 00 n print density  (0 light, 1 medium, 2 thick)
 *     10 FF 12 00 n auto-shutdown timeout, minutes
 *
 * The last two are not wired up: this driver sets density through the `0x1F`
 * print path already, and nothing in the app has a reason to change a
 * printer's power-saving setting.
 */
export class MarklifeDriver implements IPrinterDriver {
    public readonly name = "Marklife-Protocol-0x1F";
    public readonly driverType = 'hardware' as const;

    // The Universal Print Manager will request these services
    public readonly connectionRequirements = {
        services: [
            '0000ff00-0000-1000-8000-00805f9b34fb',
            '49535343-fe7d-4ae5-8fa9-9fafd205e455' // INFO_SERVICE
        ],
        namePrefixes: [
            ...MARKLIFE_PROFILES.flatMap(p => p.prefixes),
            'Marklife', 'P12_'
        ]
    };

    // Offline simulation profiles. Values mirror the live getCapabilities() of
    // this driver so the disconnected/simulated caps and the connected caps
    // agree (density range, head-to-cutter distance, etc.).
    public readonly supportedModels = MARKLIFE_HARDWARE_MODELS;

    /**
     * No `'media'`: nothing in this protocol says what stock is loaded, only
     * whether *any* is. Claiming it would leave a permanently empty row.
     */
    public readonly reports = [
        'battery', 'faults', 'deviceName', 'serialNumber',
        'firmwareVersion', 'hardwareVersion'
    ] as const satisfies readonly StatusField[];

    private transport: IDeviceTransport | null = null;
    private flowControl = new MarklifeFlowControl();
    private writeCharacteristicId: string | null = null;
    private hasFlowControl = false;
    private lastOptions: UniversalPrintOptions | null = null;

    /** Convert a millimetre feed distance to printer dots (8 dpmm). */
    private mmToDots(mm: number): number {
        return Math.max(0, Math.round(mm * 8));
    }

    /** True for models on the manufacturer's legacy "L11" command path. */
    private usesLegacyL11(): boolean {
        const name = (this.transport?.getDeviceName() ?? '').toUpperCase();
        return LEGACY_L11_PREFIXES.some(prefix => name.startsWith(prefix));
    }

    /** Concatenate command fragments into one job buffer. */
    private static concat(...parts: Uint8Array[]): Uint8Array {
        const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let offset = 0;
        for (const part of parts) { out.set(part, offset); offset += part.length; }
        return out;
    }
    private dataListener: ((data: Uint8Array, characteristicId?: string) => void) | null = null;

    // ... (rest of outer class content, skipping constructors for briefness)

    public isCompatible(deviceName: string): boolean {
        const lower = deviceName.toLowerCase();

        if (lower.includes('marklife') || lower.startsWith('p12_')) {
            return true;
        }

        // Match any of the known prefixes
        for (const profile of MARKLIFE_PROFILES) {
            for (const prefix of profile.prefixes) {
                if (lower.includes(prefix.toLowerCase())) {
                    return true;
                }
            }
        }

        return false;
    }

    public async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;

        // Store listener reference so we can remove it on unbind
        this.dataListener = (data: Uint8Array, characteristicId?: string) => {
            // Check if it's the Flow Control characteristic 'ff03', or if missing (like on USB)
            if (!characteristicId || characteristicId.toLowerCase().includes('ff03')) {
                this.flowControl.handleNotification(data);
            }
        };
        this.transport.on('data', this.dataListener);

        // The Transport abstraction might not give us direct list of characteristics,
        // so we assume standard IDs for Marklife
        this.writeCharacteristicId = '0000ff02-0000-1000-8000-00805f9b34fb';
        const notifyCharacteristicId = '0000ff03-0000-1000-8000-00805f9b34fb';

        if (this.transport.startNotifications) {
            await this.transport.startNotifications({
                serviceUUID: this.connectionRequirements.services[0],
                notifyUUID: notifyCharacteristicId
            });
            this.hasFlowControl = true;
        } else {
            this.hasFlowControl = false;
        }

        this.flowControl.reset();
    }

    public async unbindTransport(): Promise<void> {
        if (this.transport && this.dataListener) {
            this.transport.off('data', this.dataListener);
        }
        this.dataListener = null;
        this.transport = null;
        this.writeCharacteristicId = null;
        this.hasFlowControl = false;
        this.flowControl.reset();
    }

    public getCapabilities(): PrinterCapabilities {
        const deviceName = this.transport?.getDeviceName()?.toLowerCase() || "";

        // Default to P12 size (96) if no profile matches
        let canvasHeightPx = 96;

        for (const profile of MARKLIFE_PROFILES) {
            if (profile.prefixes.some(prefix => deviceName.includes(prefix.toLowerCase()))) {
                canvasHeightPx = profile.canvasHeightPx;
                break;
            }
        }

        // The head-to-cutter distance is a fact about a specific model, and the
        // model list already records it — 66 px on a P12, 100 on the 48 mm
        // family, and absent on the cutter-less L13. Reading it from the matched
        // model keeps connected and offline profiles consistent.
        const matched = MARKLIFE_HARDWARE_MODELS.find(
            m => deviceName.includes(m.model.toLowerCase())
        );

        return {
            maxDensity: 15,
            canvasHeightPx,
            supportsSpeedMode: true,
            colorSupport: { type: 'monochrome' },
            dpmm: 8,
            driverName: "Marklife (Protocol 0x1F)",
            // `?? {}` rather than a default offset: an unrecognised printer has
            // an unknown cutter distance, and inventing one puts the tear in
            // the wrong place on every label it prints.
            physical: matched?.capabilities.physical ?? {},
            mediaDefaults: {
                feedBeforeMinPx: 0,
                feedBeforeMaxPx: 100, // or whatever makes sense, say 200
                feedBeforeDefaultPx: 0,
                feedAfterMinPx: 0,
                feedAfterMaxPx: 200, // User can override up to a larger amount
                feedAfterDefaultPx: 40
            }
        };
    }

    private async sendCommand(cmd: Uint8Array): Promise<void> {
        if (!this.transport || !this.writeCharacteristicId) throw new Error("Transport not bound");
        await this.transport.write(cmd, {
            serviceUUID: this.connectionRequirements.services[0],
            writeUUID: this.writeCharacteristicId,
            reliable: true // Commands MUST be reliable
        });
        // Small delay to ensure command is processed by firmware
        await new Promise(r => setTimeout(r, 60));
    }

    /**
     * Battery, paper, identity and versions, read over the vendor INFO service.
     *
     * **One question at a time.** The replies arrive as unsolicited
     * notifications carrying no tag saying which question they answer, so the
     * only thing tying an answer to its query is that nothing else was in
     * flight. Queries therefore run sequentially with an individual timeout,
     * so a dropped reply cannot shift later values onto the wrong fields.
     */
    private async askInfo(packet: number[], timeoutMs = 300): Promise<Uint8Array | undefined> {
        const INFO_SERVICE = "49535343-fe7d-4ae5-8fa9-9fafd205e455";
        const WRITE_CHAR = "49535343-8841-43f4-a8d4-ecbe34729bb3";
        const NOTIFY_CHAR = "49535343-1e4d-4bd9-ba61-23c647249616";
        const transport = this.transport;
        if (!transport) throw new PrinterError('not-connected', 'Printer not connected.');

        return new Promise<Uint8Array | undefined>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout>;
            const onData = (data: Uint8Array, charId?: string) => {
                const id = charId?.toLowerCase();
                const mine = !id
                    || id === NOTIFY_CHAR.replace(/-/g, '').toLowerCase()
                    || id.includes('1e4d'); // shortened/normalised UUID forms
                if (!mine) return;
                clearTimeout(timer);
                transport.off('data', onData);
                resolve(new Uint8Array(data));
            };
            timer = setTimeout(() => {
                transport.off('data', onData);
                // Undefined, not a rejection: a printer that does not implement
                // a query is normal, and one unanswered question must not throw
                // away the answers to the other five.
                resolve(undefined);
            }, timeoutMs);
            transport.on('data', onData);
            transport.write(new Uint8Array(packet), {
                serviceUUID: INFO_SERVICE,
                writeUUID: WRITE_CHAR,
                reliable: true
            }).catch(err => {
                clearTimeout(timer);
                transport.off('data', onData);
                reject(toPrinterError(err, 'transport'));
            });
        });
    }

    public async getStatus(): Promise<PrinterStatus> {
        if (!this.transport) {
            throw new PrinterError('not-connected', 'Printer not connected.');
        }

        try {
            if (this.transport.startNotifications) {
                await this.transport.startNotifications({
                    serviceUUID: "49535343-fe7d-4ae5-8fa9-9fafd205e455",
                    notifyUUID: "49535343-1e4d-4bd9-ba61-23c647249616"
                });
            }
        } catch (err) {
            throw toPrinterError(err, 'transport');
        }

        // See the class doc for the command set.
        const battery = await this.askInfo([0x10, 0xff, 0x50, 0xf1]);
        const paper = await this.askInfo([0x10, 0xff, 0x40]);
        const hardware = await this.askInfo([0x10, 0xff, 0x20, 0xef]);
        const name = await this.askInfo([0x10, 0xff, 0x20, 0xf0]);
        const firmware = await this.askInfo([0x10, 0xff, 0x20, 0xf1]);
        const serial = await this.askInfo([0x10, 0xff, 0x20, 0xf2]);

        const decoder = new TextDecoder('utf-8');
        const text = (buf?: Uint8Array): string | undefined => {
            if (!buf) return undefined;
            const s = decoder.decode(buf).trim().replace(/\0/g, '');
            // An empty string is not a serial number. Undefined says "not
            // reported", which is what a UI needs to show a dash rather than a
            // blank that looks like a rendering bug.
            return s.length ? s : undefined;
        };

        const faults: PrinterFault[] = [];
        const status: PrinterStatus = {
            identity: {
                hardwareVersion: text(hardware),
                deviceName: text(name),
                firmwareVersion: text(firmware),
                serialNumber: text(serial)
            },
            readAt: Date.now()
        };

        if (battery && battery.length >= 2) {
            const percent = battery[1];
            // Firmware occasionally answers before it has a reading; >100 is
            // that, not a full battery.
            if (percent <= 100) {
                status.battery = { level: percent / 100 };
                if (percent <= 10) {
                    faults.push({
                        code: 'battery-critical',
                        // Printing still works down to the cut-off; warning it
                        // is. Blocking here would stop a job the printer is
                        // perfectly willing to run.
                        blocking: false,
                        message: `Battery at ${percent}%.`
                    });
                }
            }
        }

        if (paper && paper.length >= 2) {
            // 0x00 present, 0x04 absent. Only those two values are documented,
            // so anything else is left unreported rather than guessed at — an
            // invented "out of paper" would block a print that would have
            // worked.
            const flag = paper[1];
            if (flag === 0x04) {
                faults.push({ code: 'paper-out', blocking: true, raw: `10ff40=${flag}` });
            } else if (flag !== 0x00) {
                faults.push({
                    code: 'unknown',
                    blocking: false,
                    raw: `10ff40=${flag}`,
                    message: 'Printer reported an unrecognised paper state.'
                });
            }
        }

        // Only claimed when the printer actually answered the paper query: an
        // empty array means "checked, healthy", which would be a lie about a
        // model that never replied.
        if (paper || faults.length) status.faults = faults;

        return status;
    }

    public async printInit(options: UniversalPrintOptions): Promise<void> {
        this.lastOptions = options;

        if (this.usesLegacyL11()) {
            // The official app sends no 1F-family setup to these models. Density
            // travels on the module dialect, as one of three gears.
            if (options.density) {
                await this.sendCommand(Protocol.setLegacyDensity(Protocol.legacyDensityGear(options.density)));
            }
            return;
        }
        // Anything that is not explicitly gapped is treated as continuous:
        // hunting for a gap that is not there makes the printer feed forever,
        // which is a far worse failure than printing across one.
        const media = options.paper?.type === 'gap'
            ? Protocol.MediaType.Gap
            : Protocol.MediaType.Continuous;

        await this.sendCommand(Protocol.setMediaType(media));
        await this.sendCommand(Protocol.startJob());

        // Ensure we are at the start of the label (skip if continuous and explicitly requested 0 feed)
        const feedBeforeMm = options.feedOverrides?.feedBeforeMm;
        const skipAutoAlignStart = options.paper?.type === "continuous" && feedBeforeMm === 0;

        if (!skipAutoAlignStart) {
            await this.sendCommand(Protocol.alignAuto(0x51));
            await new Promise(r => setTimeout(r, 100)); // wait for move
        }

        // Optional leading feed (continuous only): push blank tape before printing.
        if (options.paper?.type === "continuous" && typeof feedBeforeMm === "number" && feedBeforeMm > 0) {
            await this.sendCommand(Protocol.feedDots(this.mmToDots(feedBeforeMm)));
        }

        // Set Density
        if (options.density) {
            await this.sendCommand(Protocol.setDensity(options.density));
        }

        // Set Speed
        if (options.speed !== undefined) {
            await this.sendCommand(Protocol.setSpeed(options.speed));
        }
    }

    public async printPage(page: UniversalPage): Promise<void> {
        const image = singlePlane(page);
        if (!this.transport || !this.writeCharacteristicId) throw new Error("Transport not bound");

        const { data: imageData, width, height } = image;

        const targetBufferWidth = this.getCapabilities().canvasHeightPx; // Hardware width (e.g. 96)

        // Ensure the input image is padded to match the target printhead width (Y-axis of the horizontal image)
        let finalData = imageData;
        let finalHeight = height;

        if (height !== targetBufferWidth) {
            finalHeight = targetBufferWidth;
            finalData = new Uint8Array(width * targetBufferWidth * 4);
            finalData.fill(255); // Fill with white background

            // Center the image vertically
            const yOffset = Math.floor((targetBufferWidth - height) / 2);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const srcIdx = (y * width + x) * 4;
                    const destIdx = ((y + yOffset) * width + x) * 4;
                    finalData[destIdx] = imageData[srcIdx];
                    finalData[destIdx + 1] = imageData[srcIdx + 1];
                    finalData[destIdx + 2] = imageData[srcIdx + 2];
                    finalData[destIdx + 3] = imageData[srcIdx + 3];
                }
            }
        }

        // Now we must rotate the horizontal image (Width=tape_length, Height=printhead)
        // into a vertical buffer (Width=printhead, Height=tape_length) for the hardware protocol.
        // We want columns to be printed left to right.
        // Tape feeds out: The left edge of the horizontal image (x=0) should be printed first (y=0 in hardware).
        // Therefore, hardware row Y maps to image column X.
        const hardwareWidth = finalHeight; // e.g. 96
        const hardwareHeight = width; // e.g. 227
        const hardwareData = new Uint8Array(hardwareWidth * hardwareHeight * 4);

        for (let imgY = 0; imgY < finalHeight; imgY++) {
            for (let imgX = 0; imgX < width; imgX++) {
                const srcIdx = (imgY * width + imgX) * 4;

                // Rotation mapping:
                // Hardware Y (row to print) = imgX (column of image, left to right)
                const hwY = imgX;
                // Hardware X (dot on printhead) = hardwareWidth - 1 - imgY (flip top to bottom)
                const hwX = hardwareWidth - 1 - imgY;

                const destIdx = (hwY * hardwareWidth + hwX) * 4;

                hardwareData[destIdx] = finalData[srcIdx];
                hardwareData[destIdx + 1] = finalData[srcIdx + 1];
                hardwareData[destIdx + 2] = finalData[srcIdx + 2];
                hardwareData[destIdx + 3] = finalData[srcIdx + 3];
            }
        }

        if (this.usesLegacyL11()) {
            // One buffer, framed exactly as the manufacturer's app frames it.
            const gap = this.lastOptions?.paper?.type === 'gap';
            const job = MarklifeDriver.concat(
                Protocol.legacyWakeup(),
                Protocol.legacyStartJob(),
                encodeRasterGsV0({ width: hardwareWidth, height: hardwareHeight, data: hardwareData }),
                gap ? Protocol.gapAlign() : Protocol.feedDots(100),
                Protocol.endJobAlternate()
            );
            await this.flowControl.sendData(
                job,
                this.transport,
                this.connectionRequirements.services[0],
                this.writeCharacteristicId,
                this.hasFlowControl
            );
            return;
        }

        const raster = encodeRaster({
            width: hardwareWidth,
            height: hardwareHeight,
            data: hardwareData
        });

        // Send with flow control tracking
        await this.flowControl.sendData(
            raster,
            this.transport,
            this.connectionRequirements.services[0],
            this.writeCharacteristicId,
            this.hasFlowControl
        );
    }

    public async printEnd(): Promise<void> {
        if (!this.transport || !this.writeCharacteristicId) throw new Error("Transport not bound");

        if (this.usesLegacyL11()) {
            // The job was closed inside printPage; just let the mechanism finish.
            await new Promise(r => setTimeout(r, 300));
            this.flowControl.reset();
            return;
        }

        // Wait a small moment for the last image buffers to settle in hardware
        await new Promise(r => setTimeout(r, 200));

        // Feed the tape out so it can be torn off. Honour a manual feed-after
        // override (mm) when supplied; otherwise use the default ~91-dot purge.
        const feedAfterMm = this.lastOptions?.feedOverrides?.feedAfterMm;
        const feedAfterDots = typeof feedAfterMm === "number" ? this.mmToDots(feedAfterMm) : 91;
        if (feedAfterDots > 0) {
            await this.sendCommand(Protocol.feedDots(feedAfterDots));
        }

        // Protocol 0x1F Stop Sequence
        await this.sendCommand(Protocol.endJob());

        // Alternate stop sequence required by this printer family.
        await this.sendCommand(Protocol.endJobAlternate());

        // Auto-align feed / cut (Modern)
        const skipAutoAlignEnd = this.lastOptions?.paper?.type === "continuous" && feedAfterMm === 0;
        if (!skipAutoAlignEnd) {
            await this.sendCommand(Protocol.alignAuto(0x50));
        }

        // Final delay to ensure feed finishes before next job or disconnect
        await new Promise(r => setTimeout(r, 300));

        this.flowControl.reset();
    }
}
