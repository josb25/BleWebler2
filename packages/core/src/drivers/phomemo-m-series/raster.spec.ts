import { describe, expect, it } from "vitest";
import { encodeRotatedRaster } from "./raster";

describe("local rotated raster", () => {
    it("packs the top canvas pixel at the far end of the MSB-first printhead row", () => {
        const data = new Uint8Array(8 * 4).fill(255);
        data[0] = 0;
        data[1] = 0;
        data[2] = 0;
        const raster = encodeRotatedRaster({ data, width: 1, height: 8 }, 8);
        expect(raster).toEqual({ data: new Uint8Array([0x01]), widthBytes: 1, rows: 1 });
    });

    it("centres a narrower design and treats transparent black as blank", () => {
        const data = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255]);
        const raster = encodeRotatedRaster({ data, width: 1, height: 2 }, 8);
        expect([...raster.data]).toEqual([0x10]);
    });
});
