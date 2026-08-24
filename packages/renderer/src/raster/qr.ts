/**
 * QR matrix generation — thin wrapper around `qrcode-generator` (pure JS,
 * no DOM) returning a boolean module matrix for integer-pixel rendering.
 */
import qrcode from 'qrcode-generator';

export type QrEcLevel = 'L' | 'M' | 'Q' | 'H';

export class QrError extends Error {}

/** Returns rows of modules (true = dark). Type number is auto-selected. */
export function encodeQr(data: string, ecLevel: QrEcLevel): boolean[][] {
    if (data.length === 0) throw new QrError('QR data is empty.');
    try {
        const qr = qrcode(0, ecLevel);
        qr.addData(data);
        qr.make();
        const n = qr.getModuleCount();
        const rows: boolean[][] = [];
        for (let r = 0; r < n; r++) {
            const row: boolean[] = [];
            for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
            rows.push(row);
        }
        return rows;
    } catch (err) {
        throw new QrError(err instanceof Error ? err.message : 'QR encoding failed.');
    }
}
