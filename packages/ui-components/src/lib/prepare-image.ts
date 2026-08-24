/**
 * Turning a photo off someone's phone into something safe to embed and share.
 *
 * Three jobs, and only one of them is about size:
 *
 * 1. **Strip the metadata.** A photo of a label on a kitchen shelf carries the
 *    GPS coordinates of that kitchen, plus the camera's serial number and the
 *    time it was taken. Redrawing through a canvas keeps nothing but pixels, so
 *    the original bytes never reach storage — which is the whole reason this
 *    re-encodes even when the file is already small enough.
 * 2. **Downscale.** The saved library shares one localStorage key with a few
 *    megabytes for everything; two untouched photos would fill it and break
 *    saving for every label the user has.
 * 3. **Re-encode to something small.** WebP where the browser has it, JPEG
 *    otherwise, stepping the quality down until it fits rather than failing.
 */
import { IMAGE_LIMITS } from 'universal-label-renderer';

export interface PreparedImage {
    /** A `data:` URL, ready to embed. */
    src: string;
    width: number;
    height: number;
    bytes: number;
}

export class ImageTooLargeError extends Error {}

/** Longest edge after downscaling. Big enough to fill a card, small enough to share. */
const MAX_EDGE = 900;
/** Tried in order until one lands under the byte cap. */
const QUALITY_STEPS = [0.78, 0.66, 0.54, 0.42];

/** Rough byte count of a base64 data URL, without decoding it. */
function byteLength(dataUrl: string): number {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return 0;
    return Math.floor((dataUrl.length - comma - 1) * 0.75);
}

async function decode(file: Blob): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
    } finally {
        // Revoked once decoded; the pixels are in the element from here on.
        URL.revokeObjectURL(url);
    }
}

/**
 * Prepare a picked file for embedding.
 *
 * Throws {@link ImageTooLargeError} only when even the lowest quality step
 * cannot get under the cap — which in practice means an enormous image, and is
 * worth telling the user about rather than silently storing something unusable.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
    const img = await decode(file);

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable — cannot prepare the image.');
    // White underneath: a transparent PNG re-encoded to JPEG would otherwise
    // composite onto black and come back as a photo of a dark rectangle.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const type = canvas.toDataURL('image/webp', 0.8).startsWith('data:image/webp')
        ? 'image/webp'
        : 'image/jpeg';

    let best = '';
    for (const q of QUALITY_STEPS) {
        best = canvas.toDataURL(type, q);
        if (byteLength(best) <= IMAGE_LIMITS.maxBytes) {
            return { src: best, width, height, bytes: byteLength(best) };
        }
    }

    throw new ImageTooLargeError(
        `That picture is still ${Math.round(byteLength(best) / 1024)} KB after resizing — ` +
        `the limit is ${Math.round(IMAGE_LIMITS.maxBytes / 1024)} KB. Try cropping it first.`
    );
}
