import { describe, it, expect } from "vitest";
import { FlatGpuVector, createFlatGpuVector } from "./flatGpuVector";
import { GEOMETRY_TYPE, SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import TopologyVector from "./topologyVector";
import { ConstSelectionVector } from "../filter/constSelectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";

describe("FlatGpuVector", () => {
    function createMockTopologyVector(): TopologyVector {
        return new TopologyVector(
            new Int32Array([0, 10, 20, 30]),
            new Int32Array([0, 5, 15, 25]),
            new Int32Array([0, 3, 8, 13, 18])
        );
    }

    it("createFlatGpuVector should create vector with correct properties", () => {
        const geometryTypes = new Int32Array([
            GEOMETRY_TYPE.POLYGON,
            GEOMETRY_TYPE.POLYGON,
            GEOMETRY_TYPE.POLYGON,
        ]);
        const vector = createFlatGpuVector(
            geometryTypes,
            new Int32Array([0, 10, 20, 30]),
            new Int32Array([0, 1, 2, 3, 4, 5]),
            new Int32Array([0, 0, 10, 10, 20, 20]),
            createMockTopologyVector()
        );

        expect(vector.numGeometries).toBe(3);
        expect(vector.geometryType(0)).toBe(GEOMETRY_TYPE.POLYGON);
    });

    it("geometryType should return different types for different indices", () => {
        const geometryTypes = new Int32Array([
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.LINESTRING,
            GEOMETRY_TYPE.POLYGON,
            GEOMETRY_TYPE.MULTIPOLYGON,
        ]);
        const vector = new FlatGpuVector(
            geometryTypes,
            new Int32Array([0, 10, 20, 30, 40]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        expect(vector.geometryType(0)).toBe(GEOMETRY_TYPE.POINT);
        expect(vector.geometryType(1)).toBe(GEOMETRY_TYPE.LINESTRING);
        expect(vector.geometryType(2)).toBe(GEOMETRY_TYPE.POLYGON);
        expect(vector.geometryType(3)).toBe(GEOMETRY_TYPE.MULTIPOLYGON);
    });

    it("numGeometries should return the correct count", () => {
        const geometryTypes = new Int32Array([
            GEOMETRY_TYPE.POLYGON,
            GEOMETRY_TYPE.POLYGON,
            GEOMETRY_TYPE.POLYGON,
        ]);
        const vector = new FlatGpuVector(
            geometryTypes,
            new Int32Array([]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        expect(vector.numGeometries).toBe(3);
    });

    it("filter should return appropriate SelectionVector based on geometry matches", () => {
        const geometryTypes = new Int32Array([
            GEOMETRY_TYPE.POLYGON,
            GEOMETRY_TYPE.LINESTRING,
            GEOMETRY_TYPE.POLYGON,
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.MULTIPOLYGON,
        ]);
        const vector = new FlatGpuVector(
            geometryTypes,
            new Int32Array([]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        const polygonResult = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON);
        expect(polygonResult).toBeInstanceOf(FlatSelectionVector);
        expect(polygonResult.limit).toBe(3);
        expect(polygonResult.getIndex(0)).toBe(0);
        expect(polygonResult.getIndex(1)).toBe(2);
        expect(polygonResult.getIndex(2)).toBe(4);

        const allPolygons = new FlatGpuVector(
            new Int32Array([GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.POLYGON]),
            new Int32Array([]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );
        const fullResult = allPolygons.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON);
        expect(fullResult).toBeInstanceOf(ConstSelectionVector);
        expect(fullResult.limit).toBe(2);

        const emptyResult = new FlatGpuVector(
            new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING]),
            new Int32Array([]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );
        const noMatch = emptyResult.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON);
        expect(noMatch).toBeInstanceOf(ConstSelectionVector);
        expect(noMatch.limit).toBe(0);
    });

    it("filterSelected should modify selection based on geometry matches", () => {
        const geometryTypes = new Int32Array([
            GEOMETRY_TYPE.LINESTRING,
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.LINESTRING,
            GEOMETRY_TYPE.POLYGON,
            GEOMETRY_TYPE.MULTILINESTRING,
        ]);
        const vector = new FlatGpuVector(
            geometryTypes,
            new Int32Array([]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        const selection = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3, 4]));
        vector.filterSelected(SINGLE_PART_GEOMETRY_TYPE.LINESTRING, selection);
        expect(selection.limit).toBe(3);
        expect(selection.getIndex(0)).toBe(0);
        expect(selection.getIndex(1)).toBe(2);
        expect(selection.getIndex(2)).toBe(4);
    });

    it("containsSingleGeometryType should return false", () => {
        const vector = new FlatGpuVector(
            new Int32Array([GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.LINESTRING]),
            new Int32Array([]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        expect(vector.containsSingleGeometryType()).toBe(false);
    });
});
