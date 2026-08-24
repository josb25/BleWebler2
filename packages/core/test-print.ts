/**
 * test-print.ts
 *
 * Standalone test script for universal-label-core.
 * Imports ONLY from the compiled library ("." → ./dist/index.js).
 * Registers all available drivers and lets PrintManager auto-match
 * whichever printer connects via BLE.
 *
 * Build the library first, then run:
 *   npm run build
 *   npx ts-node --project tsconfig.test.json test-print.ts
 *
 * Or add it to package.json scripts:
 *   "test:print": "npm run build && npx ts-node --project tsconfig.test.json test-print.ts"
 */

import {
    PrintManager,
    monoPage,
} from ".";   // resolves to ./dist/index.js via package.json "main"

import { NodeBleTransport } from "./dist/core/transports/node-ble-transport"; // transport/node subpath (local, pre-built)

import type { PrinterCapabilities, UniversalPrintOptions } from ".";

// ---------------------------------------------------------------------------
// PRINT OPTIONS  (edit these to taste)
// ---------------------------------------------------------------------------

/** Label length in mm. Converted to px via the printer's dpmm at runtime. */
const LABEL_LENGTH_MM = 25;

const PRINT_OPTIONS: UniversalPrintOptions = {
    labelType: "continuous",
    density: 8,
    copies: 1,
    speed: 2,
};

// ---------------------------------------------------------------------------
// BITMAP GENERATION HELPERS
// ---------------------------------------------------------------------------

function createCanvas(w: number, h: number): Uint8Array {
    const buf = new Uint8Array(w * h * 4);
    for (let i = 0; i < buf.length; i += 4) {
        buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255;
    }
    return buf;
}

function setPixel(buf: Uint8Array, w: number, x: number, y: number, r: number, g: number, b: number) {
    if (x < 0 || y < 0 || x >= w) return;
    const i = (y * w + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
}

function fillRect(buf: Uint8Array, bw: number, bh: number, x: number, y: number, rw: number, rh: number, r: number, g: number, b: number) {
    for (let py = y; py < Math.min(y + rh, bh); py++)
        for (let px = x; px < Math.min(x + rw, bw); px++)
            setPixel(buf, bw, px, py, r, g, b);
}

function strokeRect(buf: Uint8Array, bw: number, bh: number, x: number, y: number, rw: number, rh: number, t: number, r: number, g: number, b: number) {
    fillRect(buf, bw, bh, x,       y,          rw, t,  r, g, b);
    fillRect(buf, bw, bh, x,       y + rh - t, rw, t,  r, g, b);
    fillRect(buf, bw, bh, x,       y,          t,  rh, r, g, b);
    fillRect(buf, bw, bh, x+rw-t,  y,          t,  rh, r, g, b);
}

// 5×7 pixel font glyphs (row-major, MSB = leftmost column)
const FONT_5X7: Record<string, number[]> = {
    "A": [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    "B": [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
    "C": [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
    "D": [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
    "E": [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
    "F": [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
    "G": [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
    "H": [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    "I": [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    "K": [0b10010, 0b10100, 0b11000, 0b10000, 0b11000, 0b10100, 0b10010],
    "L": [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
    "M": [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
    "N": [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
    "O": [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    "P": [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
    "R": [0b11110, 0b10001, 0b10001, 0b11110, 0b11000, 0b10100, 0b10010],
    "S": [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
    "T": [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
    "U": [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    "X": [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
    "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
    " ": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
};

function textWidth(text: string, scale: number): number {
    return text.toUpperCase().split("").reduce((acc, ch) =>
        acc + (FONT_5X7[ch] ? 6 : 6) * scale, 0) - scale;
}

function drawText(buf: Uint8Array, bw: number, text: string, startX: number, startY: number, scale: number, r: number, g: number, b: number) {
    let cx = startX;
    for (const ch of text.toUpperCase()) {
        const glyph = FONT_5X7[ch] ?? FONT_5X7[" "];
        for (let row = 0; row < 7; row++)
            for (let col = 0; col < 5; col++)
                if ((glyph[row] >> (4 - col)) & 1)
                    for (let sy = 0; sy < scale; sy++)
                        for (let sx = 0; sx < scale; sx++)
                            setPixel(buf, bw, cx + col * scale + sx, startY + row * scale + sy, r, g, b);
        cx += 6 * scale;
    }
}

// ---------------------------------------------------------------------------
// BUILD TEST LABEL — adapts to any printer's printWidthPx
// ---------------------------------------------------------------------------

function buildTestLabel(caps: PrinterCapabilities): { data: Uint8Array; width: number; height: number } {
    // Display-space:
    //   W = label length (horizontal scroll direction)
    //   H = printWidthPx (physical tape width = printhead dots)
    const H = caps.printWidthPx;
    const W = Math.round(LABEL_LENGTH_MM * caps.dpmm);

    const buf = createCanvas(W, H);

    // Border
    strokeRect(buf, W, H, 0, 0, W, H, 2, 0, 0, 0);

    // Dashed centre line
    for (let x = 6; x < W - 6; x += 8)
        fillRect(buf, W, H, x, Math.floor(H / 2) - 1, 4, 2, 180, 180, 180);

    // "TEST PRINT" centred
    const scale = Math.max(1, Math.floor(H / 28));
    const label  = "TEST PRINT";
    const tw     = textWidth(label, scale);
    const tx     = Math.max(4, Math.floor((W - tw) / 2));
    const ty     = Math.floor((H - 7 * scale) / 2);
    drawText(buf, W, label, tx, ty, scale, 0, 0, 0);

    // Checkerboard corner markers
    const cell = Math.max(3, Math.floor(H / 20));
    for (let cy = 0; cy < 2; cy++)
        for (let cx = 0; cx < 2; cx++)
            if ((cx + cy) % 2 === 0) {
                fillRect(buf, W, H, 3 + cx * cell, 3 + cy * cell, cell, cell, 0, 0, 0);
                fillRect(buf, W, H, W - 3 - (cx + 1) * cell, H - 3 - (cy + 1) * cell, cell, cell, 0, 0, 0);
            }

    console.log(`[TestPrint] Bitmap: ${W}×${H} px  (~${LABEL_LENGTH_MM}mm × ${(H / caps.dpmm).toFixed(1)}mm)`);
    return { data: buf, width: W, height: H };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
    console.log("=================================================");
    console.log("  universal-label-core — Universal Test Print");
    console.log("=================================================\n");

    // PrintManager now registers all bundled drivers automatically in its constructor.
    const manager = new PrintManager();

    console.log("[TestPrint] Registered drivers: Marklife, Niimbot, Dummy");

    const transport = new NodeBleTransport();

    let connectedCaps: PrinterCapabilities | null = null;

    manager.on("connected", (driver) => {
        connectedCaps = driver.getCapabilities();
        console.log(`\n[PrintManager] ✓ Driver matched  : ${driver.name}`);
        console.log(`[PrintManager]   printWidthPx    : ${connectedCaps.printWidthPx} px`);
        console.log(`[PrintManager]   dpmm            : ${connectedCaps.dpmm}`);
        console.log(`[PrintManager]   maxDensity      : ${connectedCaps.maxDensity}`);
    });

    manager.on("printing", () => console.log("\n[PrintManager] → Sending job to printer…"));
    manager.on("idle",     () => console.log("[PrintManager] ✓ Print job complete."));
    manager.on("error",    (e) => console.error("[PrintManager] ✗ Error:", e.message));

    console.log("[TestPrint] Scanning via Bluetooth… (10 s timeout)");
    console.log("[TestPrint] Power on a supported printer and keep it close.\n");

    try {
        await manager.connect(transport);

        if (!connectedCaps) throw new Error("Driver connected but capabilities are missing.");
        // Snapshot into const so TypeScript can narrow the type (closure assignment caveat)
        const caps: PrinterCapabilities = connectedCaps;

        const options: UniversalPrintOptions = {
            ...PRINT_OPTIONS,
            paper: { id: 'test', name: 'test', type: 'gap', tapeWidthMm: 15 },
            density: Math.min(PRINT_OPTIONS.density, caps.maxDensity),
        };

        const labelImage = buildTestLabel(caps);
        await manager.print(monoPage(labelImage), options);

        console.log("\n[TestPrint] Done! Disconnecting…");
    } finally {
        await manager.disconnect();
        await new Promise(r => setTimeout(r, 800));
        process.exit(0);
    }
}

main().catch(err => {
    console.error("[TestPrint] Fatal:", err);
    process.exit(1);
});
