import { describe, expect, it } from "vitest";
import { GEOMETRY_TYPE, SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { createConstGpuVector } from "./constGpuVector";
import { createFlatGpuVector } from "./flatGpuVector";

describe("GpuVector.filter", () => {
    it("resolves in O(1) for const GPU vectors", () => {
        const vector = createConstGpuVector(
            4,
            GEOMETRY_TYPE.LINESTRING,
            new Uint32Array(0),
            new Uint32Array(0),
            new Int32Array(0),
        );
        expect(vector.filter(SINGLE_PART_GEOMETRY_TYPE.LINESTRING).limit).toBe(4);
        expect(vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON).limit).toBe(0);
    });

    it("scans mixed-type flat GPU vectors", () => {
        const vector = createFlatGpuVector(
            new Uint32Array([GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.LINESTRING]),
            new Uint32Array(0),
            new Uint32Array(0),
            new Int32Array(0),
        );
        expect(Array.from(vector.filter(SINGLE_PART_GEOMETRY_TYPE.LINESTRING).selectionValues())).toEqual([0, 2]);
    });
});
