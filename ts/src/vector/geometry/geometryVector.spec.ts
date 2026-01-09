import { describe, it, expect } from "vitest";
import { ConstGeometryVector } from "./constGeometryVector";
import { FlatGeometryVector } from "./flatGeometryVector";
import { GEOMETRY_TYPE } from "./geometryType";
import TopologyVector from "./topologyVector";
import { VertexBufferType } from "./vertexBufferType";

describe("GeometryVector", () => {
    function createMockTopologyVector(): TopologyVector {
        return new TopologyVector(
            new Int32Array([0, 10, 20, 30]),
            new Int32Array([0, 5, 15, 25]),
            new Int32Array([0, 3, 8, 13, 18])
        );
    }

    it("getSimpleEncodedVertex should return correct vertex coordinates", () => {
        const vertexBuffer = new Int32Array([10, 20, 30, 40, 50, 60]);
        const vector = new ConstGeometryVector(
            3,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([0, 1, 2]),
            vertexBuffer
        );

        const vertex0 = vector.getSimpleEncodedVertex(0);
        expect(vertex0[0]).toBe(10);
        expect(vertex0[1]).toBe(20);

        const vertex1 = vector.getSimpleEncodedVertex(1);
        expect(vertex1[0]).toBe(30);
        expect(vertex1[1]).toBe(40);

        const vertex2 = vector.getSimpleEncodedVertex(2);
        expect(vertex2[0]).toBe(50);
        expect(vertex2[1]).toBe(60);
    });

    it("getVertex should return correct coordinates for VEC_2 buffer type", () => {
        const vertexBuffer = new Int32Array([100, 200, 300, 400]);
        const vector = new ConstGeometryVector(
            2,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([0, 1]),
            vertexBuffer
        );

        const vertex0 = vector.getVertex(0);
        expect(vertex0[0]).toBe(100);
        expect(vertex0[1]).toBe(200);

        const vertex1 = vector.getVertex(1);
        expect(vertex1[0]).toBe(300);
        expect(vertex1[1]).toBe(400);
    });

    it("getVertex should decode morton encoded vertices", () => {
        const mortonSettings = { numBits: 15, coordinateShift: 0 };
        const vertexBuffer = new Int32Array([0, 1, 2]);
        const vector = new ConstGeometryVector(
            3,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.MORTON,
            createMockTopologyVector(),
            new Int32Array([0, 1, 2]),
            vertexBuffer,
            mortonSettings
        );

        const vertex0 = vector.getVertex(0);
        expect(Array.isArray(vertex0)).toBe(true);
        expect(vertex0.length).toBe(2);
    });

    it("iterator should yield geometries with coordinates and type", () => {
        const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING]);
        const vector = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            geometryTypes,
            createMockTopologyVector(),
            new Int32Array([0, 1, 2]),
            new Int32Array([10, 20, 30, 40])
        );

        const geometries = [...vector];
        expect(geometries.length).toBe(2);
        expect(geometries[0].type).toBe(GEOMETRY_TYPE.POINT);
        expect(geometries[1].type).toBe(GEOMETRY_TYPE.LINESTRING);
        expect(Array.isArray(geometries[0].coordinates)).toBe(true);
    });

    it("vertexBufferType getter should return correct buffer type", () => {
        const vector = new ConstGeometryVector(
            3,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([]),
            new Int32Array([])
        );

        expect(vector.vertexBufferType).toBe(VertexBufferType.VEC_2);
    });

    it("topologyVector getter should return topology vector", () => {
        const topology = createMockTopologyVector();
        const vector = new ConstGeometryVector(
            3,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.VEC_2,
            topology,
            new Int32Array([]),
            new Int32Array([])
        );

        expect(vector.topologyVector).toBe(topology);
    });

    it("vertexOffsets getter should return vertex offsets array", () => {
        const offsets = new Int32Array([0, 10, 20, 30]);
        const vector = new ConstGeometryVector(
            3,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            offsets,
            new Int32Array([])
        );

        expect(vector.vertexOffsets).toBe(offsets);
    });

    it("vertexBuffer getter should return vertex buffer array", () => {
        const buffer = new Int32Array([10, 20, 30, 40]);
        const vector = new ConstGeometryVector(
            2,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([0, 1]),
            buffer
        );

        expect(vector.vertexBuffer).toBe(buffer);
    });

    it("mortonSettings getter should return morton settings when present", () => {
        const mortonSettings = { numBits: 15, coordinateShift: 0 };
        const vector = new ConstGeometryVector(
            2,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.MORTON,
            createMockTopologyVector(),
            new Int32Array([0, 1]),
            new Int32Array([0, 1]),
            mortonSettings
        );

        expect(vector.mortonSettings).toEqual(mortonSettings);
    });

    it("mortonSettings getter should return undefined when not present", () => {
        const vector = new ConstGeometryVector(
            2,
            GEOMETRY_TYPE.POINT,
            VertexBufferType.VEC_2,
            createMockTopologyVector(),
            new Int32Array([0, 1]),
            new Int32Array([0, 1])
        );

        expect(vector.mortonSettings).toBeUndefined();
    });

    it("getGeometries should return converted geometry coordinates", () => {
        const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT]);
        const vector = new FlatGeometryVector(
            VertexBufferType.VEC_2,
            geometryTypes,
            createMockTopologyVector(),
            new Int32Array([0]),
            new Int32Array([10, 20])
        );

        const geometries = vector.getGeometries();
        expect(Array.isArray(geometries)).toBe(true);
        expect(geometries.length).toBe(1);
    });
});
