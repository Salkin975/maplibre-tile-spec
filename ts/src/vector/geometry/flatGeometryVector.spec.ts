import { describe, it, expect } from "vitest";
import {
    FlatGeometryVector,
    createFlatGeometryVector,
    createFlatGeometryVectorMortonEncoded,
} from "./flatGeometryVector";
import { GEOMETRY_TYPE, SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import TopologyVector from "./topologyVector";
import { VertexBufferType } from "./vertexBufferType";
import { ConstSelectionVector } from "../filter/constSelectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";

describe("FlatGeometryVector", () => {
    function createMockTopologyVector(): TopologyVector {
        return new TopologyVector(
            new Int32Array([0, 10, 20, 30]),
            new Int32Array([0, 5, 15, 25]),
            new Int32Array([0, 3, 8, 13, 18])
        );
    }

    it("createFlatGeometryVector should create vector with VEC_2 buffer type", () => {
        const geometryTypes = new Int32Array([
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.LINESTRING,
            GEOMETRY_TYPE.POLYGON,
        ]);
        const vector = createFlatGeometryVector(
            geometryTypes,
            createMockTopologyVector(),
            new Int32Array([0, 10, 20, 30]),
            new Int32Array([0, 0, 10, 10])
        );

        expect(vector.numGeometries).toBe(3);
        expect(vector.geometryType(0)).toBe(GEOMETRY_TYPE.POINT);
        expect(vector.geometryType(1)).toBe(GEOMETRY_TYPE.LINESTRING);
    });

    it("createFlatGeometryVectorMortonEncoded should create vector with MORTON buffer type", () => {
        const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POINT]);
        const vector = createFlatGeometryVectorMortonEncoded(
            geometryTypes,
            createMockTopologyVector(),
            new Int32Array([0, 10, 20]),
            new Int32Array([0, 1, 2, 3]),
            { numBits: 15, coordinateShift: 0 }
        );

        expect(vector.numGeometries).toBe(2);
        expect(vector.geometryType(0)).toBe(GEOMETRY_TYPE.POINT);
    });

    it("geometryType should return different types for different indices", () => {
        const geometryTypes = new Int32Array([
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.LINESTRING,
            GEOMETRY_TYPE.POLYGON,
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.MULTIPOINT,
        ]);
        const vector = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            geometryTypes,
            createMockTopologyVector(),
            new Int32Array([0, 10, 20, 30, 40, 50]),
            new Int32Array([])
        );

        expect(vector.geometryType(0)).toBe(GEOMETRY_TYPE.POINT);
        expect(vector.geometryType(1)).toBe(GEOMETRY_TYPE.LINESTRING);
        expect(vector.geometryType(2)).toBe(GEOMETRY_TYPE.POLYGON);
        expect(vector.geometryType(4)).toBe(GEOMETRY_TYPE.MULTIPOINT);
    });

    it("numGeometries should return the correct count", () => {
        const geometryTypes = new Int32Array([
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.LINESTRING,
        ]);
        const vector = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            geometryTypes,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );

        expect(vector.numGeometries).toBe(3);
    });

    it("containsPolygonGeometry should detect polygon types correctly", () => {
        const withPolygon = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POLYGON, GEOMETRY_TYPE.LINESTRING]),
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );
        expect(withPolygon.containsPolygonGeometry()).toBe(true);

        const withMultipolygon = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            new Int32Array([GEOMETRY_TYPE.MULTIPOLYGON, GEOMETRY_TYPE.POINT]),
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );
        expect(withMultipolygon.containsPolygonGeometry()).toBe(true);

        const withoutPolygon = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING]),
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );
        expect(withoutPolygon.containsPolygonGeometry()).toBe(false);
    });

    it("filter should return appropriate SelectionVector based on geometry matches", () => {
        const geometryTypes = new Int32Array([
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.LINESTRING,
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.POLYGON,
            GEOMETRY_TYPE.MULTIPOINT,
        ]);
        const vector = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            geometryTypes,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );

        const pointResult = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POINT);
        expect(pointResult).toBeInstanceOf(FlatSelectionVector);
        expect(pointResult.limit).toBe(3);
        expect(pointResult.getIndex(0)).toBe(0);
        expect(pointResult.getIndex(1)).toBe(2);
        expect(pointResult.getIndex(2)).toBe(4);

        const allPoints = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POINT]),
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );
        const fullResult = allPoints.filter(SINGLE_PART_GEOMETRY_TYPE.POINT);
        expect(fullResult).toBeInstanceOf(ConstSelectionVector);
        expect(fullResult.limit).toBe(3);

        const noMatch = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON);
        expect(noMatch).toBeInstanceOf(FlatSelectionVector);
        expect(noMatch.limit).toBe(1);
    });

    it("filterSelected should modify selection based on geometry matches", () => {
        const geometryTypes = new Int32Array([
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.LINESTRING,
            GEOMETRY_TYPE.POINT,
            GEOMETRY_TYPE.POLYGON,
        ]);
        const vector = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            geometryTypes,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );

        const selection = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
        vector.filterSelected(SINGLE_PART_GEOMETRY_TYPE.POINT, selection);
        expect(selection.limit).toBe(2);
        expect(selection.getIndex(0)).toBe(0);
        expect(selection.getIndex(1)).toBe(2);
    });

    it("containsSingleGeometryType should return false", () => {
        const vector = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING]),
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );

        expect(vector.containsSingleGeometryType()).toBe(false);
    });
});
