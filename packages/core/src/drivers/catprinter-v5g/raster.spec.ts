import { describe, expect, it } from "vitest";
import { rotateToPrintRows } from "./raster";

describe("local row rotation", () => {
    it("rotates the top canvas pixel to the far end of the printhead row", () => {
        const data = new Uint8Array(8 * 4).fill(255);
        data[0] = 0;
        data[1] = 0;
        data[2] = 0;
        const rows = rotateToPrintRows({ data, width: 1, height: 8 }, 8);
        expect([...rows[0]]).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    });

    it("centres a narrower design and treats transparent black as blank", () => {
        const data = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255]);
        const rows = rotateToPrintRows({ data, width: 1, height: 2 }, 8);
        expect([...rows[0]]).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);
    });
});
