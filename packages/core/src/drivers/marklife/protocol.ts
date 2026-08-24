/**
 * The Marklife command set.
 *
 * These are *facts about the hardware*: the byte sequences a Marklife printer
 * responds to. They were established by observing the protocol, and they are
 * written here in this project's own terms — grouped by what you would want to
 * do, not by the shape of any other implementation.
 *
 * ## Two command dialects, and why both exist
 *
 * The family speaks two prefixes, and which one answers depends on the model:
 *
 *  - **`1F …` — the printer.** Anything about putting ink on paper: density,
 *    speed, media type, calibration, starting and stopping a job.
 *  - **`10 FF …` — the module.** Anything about the *device*: battery, serial
 *    number, firmware, MAC, auto-off. These are the queries shared across the
 *    P12/L13 generation, and their replies are untagged — the answer carries no
 *    echo of the question — so only one may be in flight at a time.
 *
 * There is also one lone ESC/POS survivor, `1B 4A n` (feed n dots), which these
 * printers honour because the firmware lineage passed through a receipt printer.
 *
 * ## Reading replies
 *
 * Every getter here is a *request*. The reply arrives on the notify
 * characteristic, unsolicited and unlabelled, so the driver is responsible for
 * knowing what it asked for. See {@link MarklifeDriver}.
 */

/** Byte sequences are easier to check against a capture when written flat. */
const cmd = (...bytes: number[]): Uint8Array => new Uint8Array(bytes);

/** Big-endian 16-bit split, which is what every multi-byte field here uses. */
const be16 = (v: number): [number, number] => [(v >> 8) & 0xff, v & 0xff];

// ---- print jobs ---------------------------------------------------------

/** Open a print job. Must precede raster data. */
export const startJob = (): Uint8Array => cmd(0x1f, 0xc0, 0x01, 0x00);

/** Close a print job cleanly. */
export const endJob = (): Uint8Array => cmd(0x1f, 0xc0, 0x01, 0x01);

/**
 * The older end-of-job sequence.
 *
 * Some firmware in this family ignores {@link endJob} and only settles on this
 * one. Sending both costs a few bytes and avoids a printer that never releases
 * the job, so the driver does exactly that.
 */
export const endJobAlternate = (): Uint8Array => cmd(0x10, 0xff, 0xf1, 0x45);

/** Feed `dots` of blank media. ESC/POS `ESC J`, honoured by this family. */
export const feedDots = (dots: number): Uint8Array =>
    cmd(0x1b, 0x4a, Math.max(0, Math.min(255, Math.round(dots))));

// ---- print quality ------------------------------------------------------

/**
 * Darkness, 1–15.
 *
 * Clamped rather than rejected: an out-of-range value is a caller's bug, but
 * refusing to print is a worse answer than printing at the nearest legal
 * darkness. Values above ~5 scorch most media.
 */
export const setDensity = (level: number): Uint8Array =>
    cmd(0x1f, 0x70, 0x01, Math.max(1, Math.min(15, Math.round(level))));

export const getDensity = (): Uint8Array => cmd(0x1f, 0x70, 0x00);

/** Head speed. Lower is slower and darker. */
export const setSpeed = (level: number): Uint8Array =>
    cmd(0x1f, 0x60, 0x01, level & 0xff);

export const getSpeed = (): Uint8Array => cmd(0x1f, 0x60, 0x00);

// ---- media --------------------------------------------------------------

/**
 * What is loaded, so the printer knows whether to look for gaps.
 *
 * Getting this wrong is the usual cause of a printer feeding forever: told to
 * expect gapped labels on continuous tape, it hunts for a gap that never comes.
 */
export const setMediaType = (type: MediaType): Uint8Array =>
    cmd(0x1f, 0x80, 0x01, type);

export const getMediaType = (): Uint8Array => cmd(0x1f, 0x80, 0x00);

/**
 * Only the two values this family is known to accept.
 *
 * Deliberately not a guess at a fuller enumeration: black-mark media plausibly
 * has a code, but no observation confirms one, and inventing `0x30` here would
 * put a value on the wire that no printer was ever seen to acknowledge.
 */
export enum MediaType {
    Continuous = 0x10,
    Gap = 0x20
}

/** Run the gap/mark sensor calibration. Takes several seconds and feeds media. */
export const calibrateMedia = (): Uint8Array => cmd(0x1f, 0x30, 0x60);

/** Raw sensor reading, for diagnosing calibration that will not settle. */
export const getSensorValue = (sensor: number): Uint8Array =>
    cmd(0x1f, 0x30, sensor & 0xff);

/**
 * Nudge the print origin.
 *
 * `auto` lets the printer choose the offset from its own calibration; the
 * explicit form states a distance in dots.
 */
export const alignAuto = (mode: number): Uint8Array => cmd(0x1f, 0x11, mode & 0xff);

export const align = (mode: number, distanceDots: number): Uint8Array => {
    const [hi, lo] = be16(Math.max(0, Math.round(distanceDots)));
    return cmd(0x1f, 0x11, mode & 0xff, hi, lo);
};

/** Advance to the next label position. */
export const feedToNextLabel = (mode: number): Uint8Array =>
    cmd(0x1f, 0x12, mode & 0xff, 0x00);

/** ESC/POS form feed — the same thing, on firmware that prefers it. */
export const formFeed = (): Uint8Array => cmd(0x0c);

// ---- device queries (`10 FF`) -------------------------------------------
//
// Replies are untagged. Ask one at a time.

export const getStatus = (): Uint8Array => cmd(0x1f, 0x20, 0x00);
export const getBatteryVoltage = (): Uint8Array => cmd(0x10, 0xff, 0x50, 0xf1);
export const getFirmwareVersion = (): Uint8Array => cmd(0x10, 0xff, 0x20, 0xf1);
export const getSerialNumber = (): Uint8Array => cmd(0x10, 0xff, 0x20, 0xf2);
export const getModelName = (): Uint8Array => cmd(0x10, 0xff, 0x20, 0xf0);
export const getMacAddress = (): Uint8Array => cmd(0x10, 0xff, 0x30, 0x11);

/** Minutes of idleness before the printer powers itself off. */
export const setAutoOffMinutes = (minutes: number): Uint8Array => {
    const [hi, lo] = be16(Math.max(0, Math.round(minutes)));
    return cmd(0x10, 0xff, 0x12, hi, lo);
};

export const getAutoOffMinutes = (): Uint8Array => cmd(0x10, 0xff, 0x13);

// ---- maintenance --------------------------------------------------------

/** Print the firmware's own test page. */
export const selfTest = (): Uint8Array => cmd(0x1f, 0x40);

/** Restore factory settings. The trailing `BE` is the confirmation byte. */
export const factoryReset = (): Uint8Array => cmd(0x1f, 0x50, 0xbe);

/**
 * Enter firmware-update mode.
 *
 * Exported for completeness and **not used by this driver**. A printer in boot
 * mode cannot print and only leaves via a firmware upload, so bricking it is
 * one mistaken write away. Firmware updates are deliberately out of scope —
 * that risk belongs with the manufacturer's own tool.
 */
export const enterBootloader = (): Uint8Array => cmd(0x1f, 0xa0, 0xbe, 0x66, 0x88);

/** Bluetooth mode select, on models that expose both classic and LE. */
export const setBluetoothType = (): Uint8Array => cmd(0x1f, 0xb2, 0x00);
