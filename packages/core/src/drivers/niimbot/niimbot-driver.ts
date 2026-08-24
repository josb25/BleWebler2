import { IPrinterDriver, PrinterCapabilities, UniversalPrintOptions, UniversalImageData } from "../driver.interface";
import type { LoadedMedia, MediaKind, PrinterStatus, PrinterStatusDetail, StatusField } from "../printer-status";
import {
    singlePlane,
    type UniversalPage
} from "../../types/ink";
import { IDeviceTransport } from "../../core/transports/transport.interface";
import {
    NiimbotAbstractClient,
    ConnectionInfo,
    ConnectResult,
    ImageEncoder,
    PrintTaskName,
    LabelType,
    type RfidInfo
} from "@mmote/niimbluelib";
import { lookupNiimbotMedia } from "./niimbot-media-catalog";

const mediaKind = (type: LabelType): MediaKind | undefined => {
    if (type === LabelType.Continuous) return 'continuous';
    if (type === LabelType.Transparent) return 'transparent';
    if (type === LabelType.Black) return 'black';
    if (type === LabelType.BlackMarkGap) return 'black-mark';
    if (type === LabelType.Perforated) return 'perforated';
    if (type === LabelType.PvcTag) return 'pvc';
    if (type === LabelType.HeatShrinkTube) return 'heat-shrink';
    if (type === LabelType.WithGaps) return 'gap';
    return undefined;
};

const labelTypeName = (type: LabelType | undefined): string | undefined => {
    if (type === undefined) return undefined;
    return mediaKind(type)?.replace(/-/g, ' ') ?? `Code ${type}`;
};

const autoShutdownName = (preset: number | undefined): string | undefined =>
    preset === undefined ? undefined : `Preset ${preset}`;

export function loadedMediaFromRfid(info: RfidInfo): LoadedMedia | undefined {
    if (!info.tagPresent) return undefined;
    const total = info.allPaper >= 0 ? info.allPaper : undefined;
    const used = info.usedPaper >= 0 ? info.usedPaper : undefined;
    return {
        kind: mediaKind(info.consumablesType),
        id: info.uuid || info.serialNumber || info.barCode || undefined,
        name: `NIIMBOT NFC roll${info.barCode ? ` ${info.barCode}` : ''}`,
        identification: {
            technology: 'nfc',
            uid: info.uuid || undefined,
            barcode: info.barCode || undefined,
            serialNumber: info.serialNumber || undefined
        },
        total,
        used,
        remaining: total !== undefined && used !== undefined ? Math.max(0, total - used) : undefined,
        capacity: info.capacity
    };
}

/**
 * An adapter bridging universal-label-core IDeviceTransport to niimbluelib's NiimbotAbstractClient.
 */
class UniversalTransportClient extends NiimbotAbstractClient {
    private transport: IDeviceTransport;
    private activeServiceUUID: string;
    private activeWriteUUID: string;

    constructor(
        transport: IDeviceTransport,
        activeServiceUUID: string,
        activeWriteUUID: string
    ) {
        super();
        this.transport = transport;
        this.activeServiceUUID = activeServiceUUID;
        this.activeWriteUUID = activeWriteUUID;

        // Pipe incoming data from the transport into niimbluelib's defragmentation queue
        this.transport.on('data', (data: Uint8Array) => {
            this.processRawPacket(data);
        });

        this.transport.on('disconnected', () => {
            this.emit('disconnect', {} as any);
        });
    }

    public async connect(): Promise<ConnectionInfo> {
        // Our universal core already handled the physical OS-level BLE connection.
        // We just need to trigger the initial negotiation that niimbluelib expects.
        try {
            await this.initialNegotiate();
            await this.fetchPrinterInfo();
        } catch (e) {
            console.error("Niimbot TransportClient negotiation failed:", e);
        }

        const result: ConnectionInfo = {
            deviceName: this.transport.getDeviceName() ?? "Unknown Niimbot",
            result: this.info.connectResult ?? ConnectResult.ConnectedNew,
        };

        this.emit("connect", { result } as any);
        return result;
    }

    public async disconnect(): Promise<void> {
        this.stopHeartbeat();
        await this.transport.disconnect();
    }

    public isConnected(): boolean {
        return !!(this.transport && this.transport.isConnected());
    }

    public async sendRaw(data: Uint8Array, force?: boolean): Promise<void> {
        const send = async () => {
            if (!this.isConnected()) {
                throw new Error("Transport is disconnected");
            }
            // Sleep the required interval to prevent BLE buffer overflow (D11 is strict about this)
            await new Promise(resolve => setTimeout(resolve, this.packetIntervalMs));

            await this.transport.write(data, {
                serviceUUID: this.activeServiceUUID,
                writeUUID: this.activeWriteUUID
            });
            this.emit("rawpacketsent", { packet: data } as any);
        };

        if (force) {
            await send();
        } else {
            await this.mutex.runExclusive(send);
        }
    }
}


export class NiimbotDriver implements IPrinterDriver {
    public readonly name = "Niimbot Generic Printer";
    public readonly driverType = 'hardware' as const;
    public readonly connectionRequirements = {
        services: [
            '0000fee0-0000-1000-8000-00805f9b34fb', // Classic D11 Series
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2'  // Modern B21/B1 Series
        ],
        namePrefixes: ['Niimbot', 'D11', 'B21', 'B1']
    };

    public readonly reports = [
        'battery', 'deviceName', 'serialNumber', 'firmwareVersion',
        'hardwareVersion', 'media'
    ] as const satisfies readonly StatusField[];

    private _buildFamily(brand: string, family: string, models: string[], baseSpec: any) {
        return models.map(model => ({
            id: `${brand.toLowerCase().replace(/[^a-z0-9]/g, '')}_${model.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            brand,
            model,
            family,
            ...baseSpec,
            capabilities: { ...baseSpec.capabilities, driverName: this.name }
        }));
    }

    public readonly supportedModels = [
        ...this._buildFamily('Niimbot', 'Niimbot D-Series (15mm)', ['D11', 'D110', 'D110M'], {
            capabilities: { canvasHeightPx: 96, dpmm: 8, maxDensity: 3, supportsSpeedMode: false, colorSupport: { type: 'monochrome' }, physical: {} },
            supportLevel: 'Untested'
        }),
        ...this._buildFamily('Niimbot', 'Niimbot D-Series (15mm) 300DPI', ['D11H'], {
            capabilities: { canvasHeightPx: 142, dpmm: 300 / 25.4, maxDensity: 3, supportsSpeedMode: false, colorSupport: { type: 'monochrome' }, physical: {} },
            supportLevel: 'Untested'
        }),
        ...this._buildFamily('Niimbot', 'Niimbot D-Series (25mm)', ['D101'], {
            capabilities: { canvasHeightPx: 200, dpmm: 8, maxDensity: 3, supportsSpeedMode: false, colorSupport: { type: 'monochrome' }, physical: {} },
            supportLevel: 'Untested'
        }),
        ...this._buildFamily('Niimbot', 'Niimbot B-Series (48mm)', ['B1', 'B1_PRO', 'B21', 'B21_PRO', 'B21_C2B', 'M2', 'N1'], {
            capabilities: { canvasHeightPx: 384, dpmm: 8, maxDensity: 3, supportsSpeedMode: false, colorSupport: { type: 'monochrome' }, physical: {} },
            supportLevel: 'Untested'
        }),
        ...this._buildFamily('Niimbot', 'Niimbot B-Series (72mm)', ['B3S', 'B3S_P'], {
            capabilities: { canvasHeightPx: 576, dpmm: 8, maxDensity: 3, supportsSpeedMode: false, colorSupport: { type: 'monochrome' }, physical: {} },
            supportLevel: 'Untested'
        })
    ];

    private client?: UniversalTransportClient;
    private printTask?: any;
    private connectedDeviceName?: string;

    isCompatible(deviceName: string): boolean {
        const name = deviceName.toLowerCase();
        return name.includes("niimbot") || name.startsWith("d11") || name.startsWith("b21") || name.startsWith("b1");
    }

    getCapabilities(): PrinterCapabilities {
        const meta = this.client?.getModelMetadata();
        const identifiers = [meta?.model, this.connectedDeviceName]
            .filter((value): value is string => Boolean(value))
            .map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
        // Some firmware identifies D11_H over BLE but is absent from the
        // protocol library's metadata table. Fall back to the driver's own
        // profiles; longest first prevents D11 from shadowing D11H or D110.
        const profile = [...this.supportedModels]
            .sort((a, b) => b.model.length - a.model.length)
            .find(candidate => {
                const model = candidate.model.toLowerCase().replace(/[^a-z0-9]/g, '');
                return identifiers.some(identifier => identifier.includes(model));
            });

        return {
            canvasHeightPx: meta?.printheadPixels || profile?.capabilities.canvasHeightPx || 96,
            maxDensity: meta?.densityMax || profile?.capabilities.maxDensity || 3,
            supportsSpeedMode: false,
            colorSupport: { type: 'monochrome' },
            dpmm: meta?.dpi ? meta.dpi / 25.4 : profile?.capabilities.dpmm ?? 8,
            driverName: this.name
        };
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.connectedDeviceName = transport.getDeviceName();
        let foundService = this.connectionRequirements.services[0];
        let foundWrite = '0000fee2-0000-1000-8000-00805f9b34fb';
        let foundNotify = '0000fee3-0000-1000-8000-00805f9b34fb';

        if (transport.getPrimaryServices) {
            const services = await transport.getPrimaryServices();
            const lowerServices = services.map(s => s.toLowerCase());

            if (lowerServices.includes('0000fee0-0000-1000-8000-00805f9b34fb')) {
                foundService = '0000fee0-0000-1000-8000-00805f9b34fb';
            } else if (lowerServices.includes('e7810a71-73ae-499d-8c15-faa9aef0c3f2')) {
                foundService = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
                foundWrite = 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'; // Standard modern TX array chunk
                foundNotify = 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'; // RX notifications
            }

            if (transport.getCharacteristics) {
                try {
                    const chars = await transport.getCharacteristics(foundService);
                    const writeChar = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
                    const notifyChar = chars.find(c => c.properties.notify);

                    if (writeChar) foundWrite = writeChar.uuid;
                    if (notifyChar) foundNotify = notifyChar.uuid;
                } catch (e) {
                    console.error("Error inspecting Niimbot characteristics:", e);
                }
            }
        }

        if (transport.startNotifications) {
            // Notifications carry every command response. Continuing after
            // this fails only turns the real GATT error into a later timeout.
            await transport.startNotifications({
                serviceUUID: foundService,
                notifyUUID: foundNotify
            });
        }

        this.client = new UniversalTransportClient(transport, foundService, foundWrite);

        // Let niimbluelib handle the handshake sequence!
        await this.client.connect();
    }

    async unbindTransport(): Promise<void> {
        if (this.client) {
            this.client.stopHeartbeat();
            this.client = undefined;
        }
        this.connectedDeviceName = undefined;
        this.printTask = undefined;
    }

    public async getStatus(): Promise<PrinterStatus> {
        if (!this.client) throw new Error('Not connected to Niimbot');
        const info = this.client.getPrinterInfo();
        const api = this.client.abstraction;
        // The library's initial fetch is sequential, so one unsupported info
        // command can leave every later field empty. Retry only missing static
        // fields independently, while battery and media are deliberately live.
        const [
            modelId, serial, firmwareVersion, hardwareVersion, charge, rfid,
            bluetoothAddress, autoShutdownTime, configuredLabelType, statusData
        ] = await Promise.all([
            info.modelId === undefined ? api.getPrinterModel().catch(() => undefined) : info.modelId,
            info.serial === undefined ? api.getPrinterSerialNumber().catch(() => undefined) : info.serial,
            info.softwareVersion === undefined ? api.getSoftwareVersion().catch(() => undefined) : info.softwareVersion,
            info.hardwareVersion === undefined ? api.getHardwareVersion().catch(() => undefined) : info.hardwareVersion,
            api.getBatteryChargeLevel().catch(() => info.charge),
            // RFID is not fitted (or not enabled) on every NIIMBOT model.
            api.rfidInfo().catch(() => undefined),
            info.mac === undefined ? api.getPrinterBluetoothMacAddress().catch(() => undefined) : info.mac,
            info.autoShutdownTime === undefined ? api.getAutoShutDownTime().catch(() => undefined) : info.autoShutdownTime,
            info.labelType === undefined ? api.getLabelType().catch(() => undefined) : info.labelType,
            api.getPrinterStatusData().catch(() => undefined)
        ]);
        if (modelId !== undefined) info.modelId = modelId;
        if (serial !== undefined) info.serial = serial;
        if (firmwareVersion !== undefined) info.softwareVersion = firmwareVersion;
        if (hardwareVersion !== undefined) info.hardwareVersion = hardwareVersion;
        if (charge !== undefined) info.charge = charge;
        if (bluetoothAddress !== undefined) info.mac = bluetoothAddress;
        if (autoShutdownTime !== undefined) info.autoShutdownTime = autoShutdownTime;
        if (configuredLabelType !== undefined) info.labelType = configuredLabelType;
        if (statusData?.protocolVersion !== undefined) info.protocolVersion = statusData.protocolVersion;
        const media = rfid ? loadedMediaFromRfid(rfid) : undefined;
        const metadata = this.client.getModelMetadata();
        const details: PrinterStatusDetail[] = [];
        const addDetail = (id: string, label: string, value: string | number | undefined, monospace = false): void => {
            if (value !== undefined && value !== '') details.push({ id, label, value: String(value), monospace });
        };
        addDetail('model-id', 'Model ID', modelId, true);
        addDetail('protocol', 'Protocol', statusData?.protocolVersion ?? info.protocolVersion, true);
        addDetail('bluetooth-address', 'Bluetooth', bluetoothAddress, true);
        addDetail('auto-off', 'Auto-off', autoShutdownName(autoShutdownTime));
        addDetail('label-mode', 'Paper mode', labelTypeName(configuredLabelType));
        addDetail('resolution', 'Resolution', metadata?.dpi === undefined ? undefined : `${metadata.dpi} dpi`);
        addDetail('printhead', 'Printhead', metadata?.printheadPixels === undefined ? undefined : `${metadata.printheadPixels} px`);
        addDetail(
            'density-range',
            'Density range',
            metadata ? `${metadata.densityMin}–${metadata.densityMax}` : undefined
        );
        addDetail(
            'paper-types',
            'Paper support',
            metadata?.paperTypes?.map(type => labelTypeName(type as LabelType)).filter(Boolean).join(', ')
        );
        addDetail('colour-code', 'Colour code', statusData?.supportColor, true);
        return {
            identity: {
                deviceName: this.client.getModelMetadata()?.model ?? this.connectedDeviceName,
                serialNumber: serial,
                firmwareVersion,
                hardwareVersion
            },
            battery: charge === undefined ? undefined : { level: Math.max(0, Math.min(1, charge / 4)) },
            media,
            details,
            readAt: Date.now()
        };
    }

    /** Resolve the printer's opaque roll identifier from the bundled catalogue. */
    public async resolveMedia(media: LoadedMedia): Promise<LoadedMedia> {
        const barcode = media.identification?.barcode;
        if (!barcode) return media;
        const catalogueEntry = lookupNiimbotMedia(barcode);
        return catalogueEntry ? { ...media, ...catalogueEntry } : media;
    }

    public async printInit(options: UniversalPrintOptions): Promise<void> {
        if (!this.client) throw new Error("Not connected to Niimbot");

        let labelType = 1; // 1: WithGaps, 2: Transparent, 3: Continuous
        if (options.paper?.type === "transparent") labelType = 2;
        if (options.paper?.type === "continuous") labelType = 3;

        const printTaskName = this.client.getPrintTaskType();
        if (!printTaskName) {
            throw new Error(`Unsupported printer model: ${this.client.getPrinterInfo().modelId}`);
        }

        this.printTask = this.client.abstraction.newPrintTask(printTaskName as PrintTaskName, {
            totalPages: 1,
            labelType: labelType,
            density: options.density || this.getCapabilities().maxDensity
        });

        await this.printTask.printInit();
    }

    async printPage(page: UniversalPage): Promise<void> {
        const image = singlePlane(page);
        if (!this.client || !this.printTask) throw new Error("Print task not initialized");
        const encodedImage = encodeNiimbotImage(image, this.getCapabilities().canvasHeightPx);

        // Tell niimbluelib to print the encoded image bytes
        await this.printTask.printPage(encodedImage, 1);
    }

    async printEnd(): Promise<void> {
        if (!this.client || !this.printTask) return;

        await this.printTask.waitForFinished();
        await this.client.abstraction.printEnd();
        this.printTask = undefined;
    }

    async setSpeed(speed: number): Promise<void> { }
    async setDensity(density: number): Promise<void> { }
}

/** Fit to the physical head, then byte-pad only the encoder's backing buffer. */
export function encodeNiimbotImage(
    image: { data: Uint8Array | Uint8ClampedArray; width: number; height: number },
    printheadPixels: number
): ReturnType<typeof ImageEncoder.encodeCanvas> {
    const logicalHeight = Math.max(1, Math.round(printheadPixels));
    const alignedHeight = Math.ceil(logicalHeight / 8) * 8;
    const aligned = new Uint8ClampedArray(image.width * alignedHeight * 4);
    aligned.fill(255);

    const copyHeight = Math.min(image.height, logicalHeight);
    const sourceY = Math.max(0, Math.floor((image.height - logicalHeight) / 2));
    // `left` encoding reads canvas rows bottom-to-top. Put byte padding before
    // the logical image so it becomes unused trailing bits after rotation,
    // rather than shifting the first printable dot or clipping the last one.
    const targetY = (alignedHeight - logicalHeight)
        + Math.max(0, Math.floor((logicalHeight - image.height) / 2));
    for (let y = 0; y < copyHeight; y += 1) {
        const sourceStart = ((sourceY + y) * image.width) * 4;
        const targetStart = ((targetY + y) * image.width) * 4;
        aligned.set(image.data.subarray(sourceStart, sourceStart + image.width * 4), targetStart);
    }

    const imageData = typeof ImageData !== 'undefined'
        ? new ImageData(aligned, image.width, alignedHeight)
        : { data: aligned, width: image.width, height: alignedHeight, colorSpace: 'srgb' } as ImageData;
    const canvas = {
        getContext: () => ({ getImageData: () => imageData }),
        width: image.width,
        height: alignedHeight
    } as unknown as HTMLCanvasElement;
    const encoded = ImageEncoder.encodeCanvas(canvas, 'left');
    // The extra bits complete the last byte; they are not additional printable
    // dots. D11_H is a real 142-dot head, for example, not a 144-dot one.
    return { ...encoded, cols: logicalHeight };
}
