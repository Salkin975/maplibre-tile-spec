import { describe, it, expect } from "vitest";
import { ConstGpuVector } from "./constGpuVector";
import { FlatGpuVector } from "./flatGpuVector";
import { GEOMETRY_TYPE } from "./geometryType";
import TopologyVector from "./topologyVector";
import Point from "@mapbox/point-geometry";

describe("GpuVector", () => {
    /**
     * Creates a mock TopologyVector with three-level hierarchy:
     * - geometryOffsets [0, 1]: 1 geometry with 1 part
     * - partOffsets [0, 1]: 1 part with 1 ring
     * - ringOffsets [0, 4]: 1 ring with 4 vertices
     */
    function createMockTopologyVector(): TopologyVector {
        return new TopologyVector(
            new Int32Array([0, 1]),
            new Int32Array([0, 1]),
            new Int32Array([0, 4])
        );
    }

    it("triangleOffsets getter should return triangle offsets array", () => {
        const offsets = new Int32Array([0, 10, 20, 30]);
        const vector = new ConstGpuVector(
            3,
            GEOMETRY_TYPE.POLYGON,
            offsets,
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        expect(vector.triangleOffsets).toBe(offsets);
    });

    it("indexBuffer getter should return index buffer array", () => {
        const indexBuffer = new Int32Array([0, 1, 2, 3, 4, 5]);
        const vector = new ConstGpuVector(
            2,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 3, 6]),
            indexBuffer,
            new Int32Array([]),
            null
        );

        expect(vector.indexBuffer).toBe(indexBuffer);
    });

    it("vertexBuffer getter should return vertex buffer array", () => {
        const vertexBuffer = new Int32Array([10, 20, 30, 40, 50, 60]);
        const vector = new ConstGpuVector(
            2,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 3, 6]),
            new Int32Array([0, 1, 2, 3, 4, 5]),
            vertexBuffer,
            null
        );

        expect(vector.vertexBuffer).toBe(vertexBuffer);
    });

    it("topologyVector getter should return topology vector when present", () => {
        const topology = createMockTopologyVector();
        const vector = new ConstGpuVector(
            1,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 10]),
            new Int32Array([]),
            new Int32Array([]),
            topology
        );

        expect(vector.topologyVector).toBe(topology);
    });

    it("topologyVector getter should return null when not present", () => {
        const vector = new ConstGpuVector(
            1,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 10]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        expect(vector.topologyVector).toBeNull();
    });

    it("getGeometries should extract polygon coordinates from topology", () => {
        const topology = new TopologyVector(
            new Int32Array([0, 1]),
            new Int32Array([0, 1]),
            new Int32Array([0, 4])
        );
        const vertexBuffer = new Int32Array([0, 0, 10, 0, 10, 10, 0, 10]);
        const vector = new ConstGpuVector(
            1,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 10]),
            new Int32Array([]),
            vertexBuffer,
            topology
        );

        const geometries = vector.getGeometries();
        expect(geometries.length).toBe(1);
        expect(Array.isArray(geometries[0])).toBe(true);
        expect(geometries[0].length).toBe(1);
        expect(geometries[0][0].length).toBe(5);
        expect(geometries[0][0][0]).toBeInstanceOf(Point);
    });

    it("getGeometries should throw error when topology is missing", () => {
        const vector = new ConstGpuVector(
            1,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 10]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        expect(() => vector.getGeometries()).toThrow("Cannot convert GpuVector to coordinates without topology information");
    });

    it("getGeometries should handle multipolygon geometry type", () => {
        const topology = new TopologyVector(
            new Int32Array([0, 2]),
            new Int32Array([0, 1, 2]),
            new Int32Array([0, 4, 8])
        );
        const vertexBuffer = new Int32Array([
            0, 0, 10, 0, 10, 10, 0, 10,
            20, 20, 30, 20, 30, 30, 20, 30
        ]);
        const vector = new FlatGpuVector(
            new Int32Array([GEOMETRY_TYPE.MULTIPOLYGON]),
            new Int32Array([0, 20]),
            new Int32Array([]),
            vertexBuffer,
            topology
        );

        const geometries = vector.getGeometries();
        expect(geometries.length).toBe(1);
        expect(geometries[0].length).toBe(2);
        expect(geometries[0][0].length).toBe(5);
        expect(geometries[0][1].length).toBe(5);
    });

    it("getGeometries should close polygon rings by duplicating first vertex", () => {
        const topology = new TopologyVector(
            new Int32Array([0, 1]),
            new Int32Array([0, 1]),
            new Int32Array([0, 4])
        );
        const vertexBuffer = new Int32Array([0, 0, 10, 0, 10, 10, 0, 10]);
        const vector = new ConstGpuVector(
            1,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 10]),
            new Int32Array([]),
            vertexBuffer,
            topology
        );

        const geometries = vector.getGeometries();
        const ring = geometries[0][0];

        expect(ring[0].x).toBe(ring[ring.length - 1].x);
        expect(ring[0].y).toBe(ring[ring.length - 1].y);
    });

    it("iterator should return null for GpuVector", () => {
        const vector = new ConstGpuVector(
            1,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 10]),
            new Int32Array([]),
            new Int32Array([]),
            null
        );

        const iterator = vector[Symbol.iterator]();
        expect(iterator).toBeNull();
    });

    it("getGeometries should handle polygon with empty ring", () => {
        const topology = new TopologyVector(
            new Int32Array([0, 1]),
            new Int32Array([0, 1]),
            new Int32Array([0, 0])
        );
        const vertexBuffer = new Int32Array([]);
        const vector = new ConstGpuVector(
            1,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 10]),
            new Int32Array([]),
            vertexBuffer,
            topology
        );

        const geometries = vector.getGeometries();
        expect(geometries.length).toBe(1);
        expect(geometries[0].length).toBe(1);
        expect(geometries[0][0].length).toBe(0);
    });

    it("getGeometries should handle polygon without geometryOffsets", () => {
        const topology = new TopologyVector(
            null as any,
            new Int32Array([0, 1]),
            new Int32Array([0, 4])
        );
        const vertexBuffer = new Int32Array([0, 0, 10, 0, 10, 10, 0, 10]);
        const vector = new ConstGpuVector(
            1,
            GEOMETRY_TYPE.POLYGON,
            new Int32Array([0, 10]),
            new Int32Array([]),
            vertexBuffer,
            topology
        );

        const geometries = vector.getGeometries();
        expect(geometries.length).toBe(1);
        expect(geometries[0].length).toBe(1);
        expect(geometries[0][0].length).toBe(5);
    });

    it("getGeometries should handle multipolygon with empty ring", () => {
        const topology = new TopologyVector(
            new Int32Array([0, 1]),
            new Int32Array([0, 1]),
            new Int32Array([0, 0])
        );
        const vertexBuffer = new Int32Array([]);
        const vector = new FlatGpuVector(
            new Int32Array([GEOMETRY_TYPE.MULTIPOLYGON]),
            new Int32Array([0, 10]),
            new Int32Array([]),
            vertexBuffer,
            topology
        );

        const geometries = vector.getGeometries();
        expect(geometries.length).toBe(1);
        expect(geometries[0].length).toBe(1);
        expect(geometries[0][0].length).toBe(0);
    });
});
