import { describe, it, expect } from "vitest";
import {
    ConstGeometryVector,
    createConstGeometryVector,
    createMortonEncodedConstGeometryVector,
} from "./constGeometryVector";
import { GEOMETRY_TYPE, SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import TopologyVector from "./topologyVector";
import { VertexBufferType } from "./vertexBufferType";
import { ConstSelectionVector } from "../filter/constSelectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";

describe("ConstGeometryVector", () => {
    function createMockTopologyVector(): TopologyVector {
        return new TopologyVector(
            new Int32Array([0, 10, 20, 30]),
            new Int32Array([0, 5, 15, 25]),
            new Int32Array([0, 3, 8, 13, 18])
        );
    }

    it("createConstGeometryVector should create vector with VEC_2 buffer type", () => {
        const vector = createConstGeometryVector(
            3,
            GEOMETRY_TYPE.POINT,
            createMockTopologyVector(),
            new Int32Array([0, 10, 20, 30]),
            new Int32Array([0, 0, 10, 10])
        );

        expect(vector.numGeometries).toBe(3);
        expect(vector.geometryType(0)).toBe(GEOMETRY_TYPE.POINT);
    });

    it("createMortonEncodedConstGeometryVector should create vector with MORTON buffer type", () => {
        const vector = createMortonEncodedConstGeometryVector(
            2,
            GEOMETRY_TYPE.LINESTRING,
            createMockTopologyVector(),
            new Int32Array([0, 10, 20]),
            new Int32Array([0, 1, 2, 3]),
            { numBits: 15, coordinateShift: 0 }
        );

        expect(vector.numGeometries).toBe(2);
        expect(vector.geometryType(1)).toBe(GEOMETRY_TYPE.LINESTRING);
    });

    it("geometryType should return the same type for all indices", () => {
        const vector = new ConstGeometryVector(
            5,
            GEOMETRY_TYPE.POLYGON,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([0, 10, 20, 30, 40, 50]),
            new Int32Array([])
        );

        expect(vector.geometryType(0)).toBe(GEOMETRY_TYPE.POLYGON);
        expect(vector.geometryType(2)).toBe(GEOMETRY_TYPE.POLYGON);
        expect(vector.geometryType(4)).toBe(GEOMETRY_TYPE.POLYGON);
    });

    it("numGeometries should return the correct count", () => {
        const vector = new ConstGeometryVector(
            10,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );

        expect(vector.numGeometries).toBe(10);
    });

    it("containsPolygonGeometry should detect polygon types correctly", () => {
        const polygonVector = new ConstGeometryVector(
            3,
            GEOMETRY_TYPE.POLYGON,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );
        expect(polygonVector.containsPolygonGeometry()).toBe(true);

        const multipolygonVector = new ConstGeometryVector(
            3,
            GEOMETRY_TYPE.MULTIPOLYGON,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );
        expect(multipolygonVector.containsPolygonGeometry()).toBe(true);

        const pointVector = new ConstGeometryVector(
            3,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );
        expect(pointVector.containsPolygonGeometry()).toBe(false);
    });

    it("filter should return appropriate ConstSelectionVector based on match", () => {
        const vector = new ConstGeometryVector(
            5,
            GEOMETRY_TYPE.MULTIPOINT,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );

        const matchingResult = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POINT);
        expect(matchingResult).toBeInstanceOf(ConstSelectionVector);
        expect(matchingResult.limit).toBe(5);

        const nonMatchingResult = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON);
        expect(nonMatchingResult).toBeInstanceOf(ConstSelectionVector);
        expect(nonMatchingResult.limit).toBe(0);
    });

    it("filterSelected should modify selection limit based on geometry match", () => {
        const vector = new ConstGeometryVector(
            5,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );

        const matchingSelection = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3, 4]));
        vector.filterSelected(SINGLE_PART_GEOMETRY_TYPE.POINT, matchingSelection);
        expect(matchingSelection.limit).toBe(5);

        const nonMatchingSelection = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3, 4]));
        vector.filterSelected(SINGLE_PART_GEOMETRY_TYPE.POLYGON, nonMatchingSelection);
        expect(nonMatchingSelection.limit).toBe(0);
    });

    it("containsSingleGeometryType should always return true", () => {
        const vector = new ConstGeometryVector(
            3,
            GEOMETRY_TYPE.LINESTRING,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );

        expect(vector.containsSingleGeometryType()).toBe(true);
    });
});
