import { describe, it, expect } from "vitest";
import { GeometryVectorFilterUtils } from "./geometryVectorFilterUtils";
import { GEOMETRY_TYPE, SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import { ConstSelectionVector } from "../filter/constSelectionVector";
import { ConstGeometryVector } from "./constGeometryVector";

describe("GeometryFilterUtils", () => {
    describe("filterConst", () => {
        it("should return full selection for exact match", () => {
            const result = GeometryVectorFilterUtils.filterConst(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                GEOMETRY_TYPE.POINT,
                10
            );
            expect(result.limit).toBe(10);
            expect(result.capacity).toBe(10);
        });

        it("should return full selection for multi-type match", () => {
            const result = GeometryVectorFilterUtils.filterConst(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                GEOMETRY_TYPE.MULTIPOINT,
                5
            );
            expect(result.limit).toBe(5);
            expect(result.capacity).toBe(5);
        });

        it("should return empty selection for no match", () => {
            const result = GeometryVectorFilterUtils.filterConst(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                GEOMETRY_TYPE.LINESTRING,
                10
            );
            expect(result.limit).toBe(0);
            expect(result.capacity).toBe(10);
        });
    });

    describe("filterSelectedConst", () => {
        it("should not modify limit for exact match", () => {
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3, 4]));
            GeometryVectorFilterUtils.filterSelectedConst(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                GEOMETRY_TYPE.POINT,
                selectionVector
            );
            expect(selectionVector.limit).toBe(5);
        });

        it("should not modify limit for multi-type match", () => {
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            GeometryVectorFilterUtils.filterSelectedConst(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                GEOMETRY_TYPE.MULTIPOINT,
                selectionVector
            );
            expect(selectionVector.limit).toBe(3);
        });

        it("should set limit to 0 for no match", () => {
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
            GeometryVectorFilterUtils.filterSelectedConst(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                GEOMETRY_TYPE.LINESTRING,
                selectionVector
            );
            expect(selectionVector.limit).toBe(0);
        });
    });

    describe("filterFlat", () => {
        it("should return ConstSelectionVector.full when all match exactly", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POINT]);
            const result = GeometryVectorFilterUtils.filterFlat(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                geometryTypes,
                3
            );
            expect(result.limit).toBe(3);
            expect(result.capacity).toBe(3);
        });

        it("should return ConstSelectionVector.full when all match with multi-types", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.MULTIPOINT]);
            const result = GeometryVectorFilterUtils.filterFlat(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                geometryTypes,
                2
            );
            expect(result.limit).toBe(2);
        });

        it("should return ConstSelectionVector.full when all match with mixed exact and multi-type", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.POINT]);
            const result = GeometryVectorFilterUtils.filterFlat(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                geometryTypes,
                3
            );
            expect(result.limit).toBe(3);
        });

        it("should return ConstSelectionVector.empty when none match", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.MULTILINESTRING]);
            const result = GeometryVectorFilterUtils.filterFlat(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                geometryTypes,
                3
            );
            expect(result.limit).toBe(0);
            expect(result.capacity).toBe(3);
        });

        it("should return FlatSelectionVector with correct indices for partial match", () => {
            const geometryTypes = new Int32Array([
                GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING,
                GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.POINT]);
            const result = GeometryVectorFilterUtils.filterFlat(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                geometryTypes,
                5
            );
            expect(result.limit).toBe(3);
            expect(result.getIndex(0)).toBe(0);
            expect(result.getIndex(1)).toBe(2);
            expect(result.getIndex(2)).toBe(4);
        });
    });

    describe("filterSelectedFlat", () => {
        it("should filter selection vector correctly with all matching", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POLYGON]);
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 2]));

            GeometryVectorFilterUtils.filterSelectedFlat(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                geometryTypes,
                selectionVector
            );

            expect(selectionVector.limit).toBe(2);
            expect(selectionVector.getIndex(0)).toBe(0);
            expect(selectionVector.getIndex(1)).toBe(2);
        });

        it("should filter selection vector correctly with partial matching", () => {
            const geometryTypes = new Int32Array([
                GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING,
                GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.POINT]);
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3, 4]));

            GeometryVectorFilterUtils.filterSelectedFlat(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                geometryTypes,
                selectionVector
            );

            expect(selectionVector.limit).toBe(3);
            expect(selectionVector.getIndex(0)).toBe(0);
            expect(selectionVector.getIndex(1)).toBe(2);
            expect(selectionVector.getIndex(2)).toBe(4);
        });

        it("should set limit to 0 when no geometries match", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.MULTILINESTRING]);
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2]));

            GeometryVectorFilterUtils.filterSelectedFlat(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                geometryTypes,
                selectionVector
            );

            expect(selectionVector.limit).toBe(0);
        });

        it("should handle multi-type matches", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.MULTIPOINT, GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POINT]);
            const selectionVector = new FlatSelectionVector(new Uint32Array([0, 1, 2]));

            GeometryVectorFilterUtils.filterSelectedFlat(
                SINGLE_PART_GEOMETRY_TYPE.POINT,
                geometryTypes,
                selectionVector
            );

            expect(selectionVector.limit).toBe(2);
            expect(selectionVector.getIndex(0)).toBe(0);
            expect(selectionVector.getIndex(1)).toBe(2);
        });

        it("should respect selectionSector", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.MULTILINESTRING]);
            const selectionVector = new FlatSelectionVector(new Uint32Array([1, 2]));

            GeometryVectorFilterUtils.filterSelectedFlat(
                SINGLE_PART_GEOMETRY_TYPE.LINESTRING,
                geometryTypes,
                selectionVector
            );

            expect(selectionVector.limit).toBe(1);
            expect(selectionVector.getIndex(0)).toBe(1);
        });
    });

    describe("containsPolygonGeometryConst", () => {
        it("should return true for POLYGON", () => {
            expect(GeometryVectorFilterUtils.containsPolygonGeometryConst(GEOMETRY_TYPE.POLYGON)).toBe(true);
        });

        it("should return true for MULTIPOLYGON", () => {
            expect(GeometryVectorFilterUtils.containsPolygonGeometryConst(GEOMETRY_TYPE.MULTIPOLYGON)).toBe(true);
        });

        it("should return false for POINT", () => {
            expect(GeometryVectorFilterUtils.containsPolygonGeometryConst(GEOMETRY_TYPE.POINT)).toBe(false);
        });

        it("should return false for MULTIPOINT", () => {
            expect(GeometryVectorFilterUtils.containsPolygonGeometryConst(GEOMETRY_TYPE.MULTIPOINT)).toBe(false);
        });

        it("should return false for LINESTRING", () => {
            expect(GeometryVectorFilterUtils.containsPolygonGeometryConst(GEOMETRY_TYPE.LINESTRING)).toBe(false);
        });

        it("should return false for MULTILINESTRING", () => {
            expect(GeometryVectorFilterUtils.containsPolygonGeometryConst(GEOMETRY_TYPE.MULTILINESTRING)).toBe(false);
        });
    });

    describe("containsPolygonGeometryFlat", () => {
        it("should return true when array contains POLYGON or MULTIPOLYGON", () => {
            const geometryTypes1 = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.LINESTRING]);
            const geometryTypes2 = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.MULTIPOLYGON, GEOMETRY_TYPE.LINESTRING]);

            expect(GeometryVectorFilterUtils.containsPolygonGeometryFlat(geometryTypes1)).toBe(true);
            expect(GeometryVectorFilterUtils.containsPolygonGeometryFlat(geometryTypes2)).toBe(true);
        });

        it("should return true when array contains both POLYGON and MULTIPOLYGON", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.MULTIPOLYGON]);
            expect(GeometryVectorFilterUtils.containsPolygonGeometryFlat(geometryTypes)).toBe(true);
        });

        it("should return false when array contains no polygons", () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT,GEOMETRY_TYPE.LINESTRING,GEOMETRY_TYPE.MULTIPOINT,GEOMETRY_TYPE.MULTILINESTRING]);
            expect(GeometryVectorFilterUtils.containsPolygonGeometryFlat(geometryTypes)).toBe(false);
        });

        it("should return false for empty array", () => {
            const geometryTypes = new Int32Array([]);
            expect(GeometryVectorFilterUtils.containsPolygonGeometryFlat(geometryTypes)).toBe(false);
        });
    });

    describe("containsSingleGeometryTypeConst", () => {
        it("should always return true", () => {
            expect(GeometryVectorFilterUtils.containsSingleGeometryTypeConst()).toBe(true);
        });
    });

    describe("containsSingleGeometryTypeFlat", () => {
        it("should always return false", () => {
            expect(GeometryVectorFilterUtils.containsSingleGeometryTypeFlat()).toBe(false);
        });
    });
});
