import { describe, it, expect } from "vitest";
import { ConstGpuVector, createConstGpuVector } from "./constGpuVector";
import { GEOMETRY_TYPE, SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import TopologyVector from "./topologyVector";
import { ConstSelectionVector } from "../filter/constSelectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";

describe("ConstGpuVector", () => {
    function createMockTopologyVector(): TopologyVector {
        return new TopologyVector(
            new Int32Array([0, 10, 20, 30]),
            new Int32Array([0, 5, 15, 25]),
            new Int32Array([0, 3, 8, 13, 18])
        );
    }

    it("createConstGpuVector should create vector with correct properties", () => {
        const vector = createConstGpuVector(
            3,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 10, 20, 30]),
            new Int32Array([0, 1, 2, 3, 4, 5]),
            new Int32Array([0, 0, 10, 10, 20, 20]),
            createMockTopologyVector()
        );

        expect(vector.numGeometries).toBe(3);
        expect(vector.geometryType(0)).toBe(GEOMETRY_TYPE.POLYGON);
    });

    it("geometryType should return the same type for all indices", () => {
        const vector = new ConstGpuVector(
            5,
            GEOMETRY_TYPE.LINESTRING,
            new Int32Array([0, 10, 20, 30, 40, 50]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        expect(vector.geometryType(0)).toBe(GEOMETRY_TYPE.LINESTRING);
        expect(vector.geometryType(2)).toBe(GEOMETRY_TYPE.LINESTRING);
        expect(vector.geometryType(4)).toBe(GEOMETRY_TYPE.LINESTRING);
    });

    it("numGeometries should return the correct count", () => {
        const vector = new ConstGpuVector(
            10,
            GEOMETRY_TYPE.POINT,
            new Int32Array([]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        expect(vector.numGeometries).toBe(10);
    });

    it("filter should return appropriate ConstSelectionVector based on match", () => {
        const vector = new ConstGpuVector(
            5,
            GEOMETRY_TYPE.MULTILINESTRING,
            new Int32Array([]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        const matchingResult = vector.filter(SINGLE_PART_GEOMETRY_TYPE.LINESTRING);
        expect(matchingResult).toBeInstanceOf(ConstSelectionVector);
        expect(matchingResult.limit).toBe(5);

        const nonMatchingResult = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POINT);
        expect(nonMatchingResult).toBeInstanceOf(ConstSelectionVector);
        expect(nonMatchingResult.limit).toBe(0);
    });

    it("filterSelected should modify selection limit based on geometry match", () => {
        const vector = new ConstGpuVector(
            5,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        const matchingSelection = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3, 4]));
        vector.filterSelected(SINGLE_PART_GEOMETRY_TYPE.POLYGON, matchingSelection);
        expect(matchingSelection.limit).toBe(5);

        const nonMatchingSelection = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3, 4]));
        vector.filterSelected(SINGLE_PART_GEOMETRY_TYPE.LINESTRING, nonMatchingSelection);
        expect(nonMatchingSelection.limit).toBe(0);
    });

    it("containsSingleGeometryType should always return true", () => {
        const vector = new ConstGpuVector(
            3,
            GEOMETRY_TYPE.POINT,
            new Int32Array([]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        expect(vector.containsSingleGeometryType()).toBe(true);
    });
});
