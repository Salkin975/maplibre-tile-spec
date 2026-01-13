import { describe, it, expect } from "vitest";
import { GEOMETRY_TYPE, SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import {
    filterByTypeConst,
    filterSelectedConst,
    filterByTypeFlat,
    filterSelectedFlat,
    containsPolygonGeometryConst,
    containsPolygonGeometryFlat
} from "./geometryVectorFilterUtils";
import { createConstGeometryVector } from "./constGeometryVector";
import { createFlatGeometryVector } from "./flatGeometryVector";
import TopologyVector from "./topologyVector";

function createSimpleTopology(numGeometries: number): TopologyVector {
    const offsets = new Int32Array(numGeometries + 1);
    for (let i = 0; i <= numGeometries; i++) {
        offsets[i] = i;
    }
    return new TopologyVector(offsets, offsets, offsets);
}

function createConstVector(numGeometries: number, geometryType: number) {
    return createConstGeometryVector(
        numGeometries,
        geometryType,
        createSimpleTopology(numGeometries),
        new Int32Array([]),
        new Int32Array([])
    );
}

function createFlatVector(geometryTypes: Int32Array) {
    return createFlatGeometryVector(
        geometryTypes,
        createSimpleTopology(geometryTypes.length),
        new Int32Array([]),
        new Int32Array([])
    );
}

describe("GeometryVectorFilterUtils", () => {
    describe("filterByTypeConst", () => {
        it("should return full selection for exact match", () => {
            const vector = createConstVector(10, GEOMETRY_TYPE.POINT);
            const result = filterByTypeConst(SINGLE_PART_GEOMETRY_TYPE.POINT, vector);
            expect(result.limit).toBe(10);
            expect(result.capacity).toBe(10);
        });

        it("should return full selection for multi-type match", () => {
            const vector = createConstVector(5, GEOMETRY_TYPE.MULTIPOINT);
            const result = filterByTypeConst(SINGLE_PART_GEOMETRY_TYPE.POINT, vector);
            expect(result.limit).toBe(5);
            expect(result.capacity).toBe(5);
        });

        it("should return empty selection for no match", () => {
            const vector = createConstVector(10, GEOMETRY_TYPE.LINESTRING);
            const result = filterByTypeConst(SINGLE_PART_GEOMETRY_TYPE.POINT, vector);
            expect(result.limit).toBe(0);
            expect(result.capacity).toBe(10);
        });
    });

    describe("filterSelectedConst", () => {
        it("should not modify limit for exact match", () => {
            const vector = createConstVector(5, GEOMETRY_TYPE.POINT);
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3, 4]));
            filterSelectedConst(SINGLE_PART_GEOMETRY_TYPE.POINT, vector, selectionVector);
            expect(selectionVector.limit).toBe(5);
        });

        it("should not modify limit for multi-type match", () => {
            const vector = createConstVector(3, GEOMETRY_TYPE.MULTIPOINT);
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            filterSelectedConst(SINGLE_PART_GEOMETRY_TYPE.POINT, vector, selectionVector);
            expect(selectionVector.limit).toBe(3);
        });

        it("should set limit to 0 for no match", () => {
            const vector = createConstVector(4, GEOMETRY_TYPE.LINESTRING);
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
            filterSelectedConst(SINGLE_PART_GEOMETRY_TYPE.POINT, vector, selectionVector);
            expect(selectionVector.limit).toBe(0);
        });
    });

    describe("filterByTypeFlat", () => {
        it("should return ConstSelectionVector.full when all match exactly", () => {
            const vector = createFlatVector(new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POINT]));
            const result = filterByTypeFlat(SINGLE_PART_GEOMETRY_TYPE.POINT, vector);
            expect(result.limit).toBe(3);
            expect(result.capacity).toBe(3);
        });

        it("should return ConstSelectionVector.full when all match with multi-types", () => {
            const vector = createFlatVector(new Int32Array([GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.MULTIPOINT]));
            const result = filterByTypeFlat(SINGLE_PART_GEOMETRY_TYPE.POINT, vector);
            expect(result.limit).toBe(2);
        });

        it("should return ConstSelectionVector.full when all match with mixed exact and multi-type", () => {
            const vector = createFlatVector(new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.POINT]));
            const result = filterByTypeFlat(SINGLE_PART_GEOMETRY_TYPE.POINT, vector);
            expect(result.limit).toBe(3);
        });

        it("should return ConstSelectionVector.empty when none match", () => {
            const vector = createFlatVector(new Int32Array([GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.MULTILINESTRING]));
            const result = filterByTypeFlat(SINGLE_PART_GEOMETRY_TYPE.POINT, vector);
            expect(result.limit).toBe(0);
            expect(result.capacity).toBe(3);
        });

        it("should return FlatSelectionVector with correct indices for partial match", () => {
            const vector = createFlatVector(new Int32Array([
                GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING,
                GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.POINT
            ]));
            const result = filterByTypeFlat(SINGLE_PART_GEOMETRY_TYPE.POINT, vector);
            expect(result.limit).toBe(3);
            expect(result.getIndex(0)).toBe(0);
            expect(result.getIndex(1)).toBe(2);
            expect(result.getIndex(2)).toBe(4);
        });
    });

    describe("filterSelectedFlat", () => {
        it("should filter selection vector correctly with all matching", () => {
            const vector = createFlatVector(new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POLYGON]));
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 2]));

            filterSelectedFlat(SINGLE_PART_GEOMETRY_TYPE.POINT, vector, selectionVector);

            expect(selectionVector.limit).toBe(2);
            expect(selectionVector.getIndex(0)).toBe(0);
            expect(selectionVector.getIndex(1)).toBe(2);
        });

        it("should filter selection vector correctly with partial matching", () => {
            const vector = createFlatVector(new Int32Array([
                GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING,
                GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.POINT
            ]));
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3, 4]));

            filterSelectedFlat(SINGLE_PART_GEOMETRY_TYPE.POINT, vector, selectionVector);

            expect(selectionVector.limit).toBe(3);
            expect(selectionVector.getIndex(0)).toBe(0);
            expect(selectionVector.getIndex(1)).toBe(2);
            expect(selectionVector.getIndex(2)).toBe(4);
        });

        it("should set limit to 0 when no geometries match", () => {
            const vector = createFlatVector(new Int32Array([GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.MULTILINESTRING]));
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2]));

            filterSelectedFlat(SINGLE_PART_GEOMETRY_TYPE.POINT, vector, selectionVector);

            expect(selectionVector.limit).toBe(0);
        });

        it("should handle multi-type matches", () => {
            const vector = createFlatVector(new Int32Array([GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POINT]));
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2]));

            filterSelectedFlat(SINGLE_PART_GEOMETRY_TYPE.POINT, vector, selectionVector);

            expect(selectionVector.limit).toBe(2);
            expect(selectionVector.getIndex(0)).toBe(0);
            expect(selectionVector.getIndex(1)).toBe(2);
        });

        it("should respect selectionVector", () => {
            const vector = createFlatVector(new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.MULTILINESTRING]));
            const selectionVector = new FlatSelectionVector(new Uint32Array([1, 2]));

            filterSelectedFlat(SINGLE_PART_GEOMETRY_TYPE.LINESTRING, vector, selectionVector);

            expect(selectionVector.limit).toBe(1);
            expect(selectionVector.getIndex(0)).toBe(1);
        });
    });

    describe("containsPolygonGeometryConst", () => {
        it("should return true for POLYGON", () => {
            expect(containsPolygonGeometryConst(GEOMETRY_TYPE.POLYGON)).toBe(true);
        });

        it("should return true for MULTIPOLYGON", () => {
            expect(containsPolygonGeometryConst(GEOMETRY_TYPE.MULTIPOLYGON)).toBe(true);
        });

        it("should return false for POINT", () => {
            expect(containsPolygonGeometryConst(GEOMETRY_TYPE.POINT)).toBe(false);
        });

        it("should return false for MULTIPOINT", () => {
            expect(containsPolygonGeometryConst(GEOMETRY_TYPE.MULTIPOINT)).toBe(false);
        });

        it("should return false for LINESTRING", () => {
            expect(containsPolygonGeometryConst(GEOMETRY_TYPE.LINESTRING)).toBe(false);
        });

        it("should return false for MULTILINESTRING", () => {
            expect(containsPolygonGeometryConst(GEOMETRY_TYPE.MULTILINESTRING)).toBe(false);
        });
    });

    describe("containsPolygonGeometryFlat", () => {
        it("should return true when array contains POLYGON or MULTIPOLYGON", () => {
            const geometryTypes1 = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.LINESTRING]);
            const geometryTypes2 = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.MULTIPOLYGON, GEOMETRY_TYPE.LINESTRING]);

            expect(containsPolygonGeometryFlat(geometryTypes1)).toBe(true);
            expect(containsPolygonGeometryFlat(geometryTypes2)).toBe(true);
        });

        it("should return true when array contains both POLYGON and MULTIPOLYGON", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.MULTIPOLYGON]);
            expect(containsPolygonGeometryFlat(geometryTypes)).toBe(true);
        });

        it("should return false when array contains no polygons", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.MULTILINESTRING]);
            expect(containsPolygonGeometryFlat(geometryTypes)).toBe(false);
        });

        it("should return false for empty array", () => {
            const geometryTypes = new Int32Array([]);
            expect(containsPolygonGeometryFlat(geometryTypes)).toBe(false);
        });
    });
});
