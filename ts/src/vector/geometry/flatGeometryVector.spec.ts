import { describe, it, expect } from 'vitest';
import { VertexBufferType } from './vertexBufferType';
import type { MortonSettings } from './geometryVector';
import { createFlatGeometryVector, createFlatGeometryVectorMortonEncoded, FlatGeometryVector } from './flatGeometryVector';
import { GEOMETRY_TYPE, SINGLE_PART_GEOMETRY_TYPE } from './geometryType';
import TopologyVector from "./topologyVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";

describe('FlatGeometryVector', () => {
    const mortonSettings: MortonSettings = { numBits: 15, coordinateShift: 0 };

    describe('construction', () => {
        it('creates VEC_2 vector via factory', () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING]);
            const vector = createFlatGeometryVector(geometryTypes, createSimpleTopology(2), new Int32Array([]), createVertexBuffer(2));

            expect(vector).toBeInstanceOf(FlatGeometryVector);
            expect(vector.numGeometries).toBe(2);
            expect(vector.vertexBufferType).toBe(VertexBufferType.VEC_2);
            expect(vector.geometryTypes).toBe(geometryTypes);
            expect(vector.mortonSettings).toBeUndefined();
        });

        it('creates MORTON vector via factory', () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT]);
            const vertexBuffer = new Int32Array([encodeMorton(10, 20, 15)]);
            const vector = createFlatGeometryVectorMortonEncoded(geometryTypes, createSimpleTopology(1), createVertexOffsets(1), vertexBuffer, mortonSettings);

            expect(vector.vertexBufferType).toBe(VertexBufferType.MORTON);
            expect(vector.mortonSettings).toBe(mortonSettings);
        });

        it('handles empty geometry', () => {
            const emptyTopology = createSimpleTopology(0);
            expect(() => createFlatGeometryVector(new Int32Array([]), emptyTopology, new Int32Array([]), new Int32Array([]))).not.toThrow();
        });
    });

    it('geometryType returns type at specified index', () => {
        const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POLYGON]);
        const vector = createFlatGeometryVector(geometryTypes, createSimpleTopology(3), new Int32Array([]), createVertexBuffer(3));

        expect(vector.geometryType(0)).toBe(GEOMETRY_TYPE.POINT);
        expect(vector.geometryType(1)).toBe(GEOMETRY_TYPE.LINESTRING);
        expect(vector.geometryType(2)).toBe(GEOMETRY_TYPE.POLYGON);
    });

    describe('vertex access', () => {
        it('getVertex returns [x, y] coordinates', () => {
            const vector = createFlatGeometryVector(
                new Int32Array([GEOMETRY_TYPE.POINT]),
                createSimpleTopology(1),
                createVertexOffsets(2),
                createVertexBuffer(2)
            );

            expect(vector.getVertex(0)).toEqual([10, 20]);
            expect(vector.getVertex(1)).toEqual([20, 40]);
        });

        it('getVertex decodes morton encoding', () => {
            const vertexBuffer = new Int32Array([encodeMorton(100, 200, 15)]);
            const vector = createFlatGeometryVectorMortonEncoded(
                new Int32Array([GEOMETRY_TYPE.POINT]),
                createSimpleTopology(1),
                createVertexOffsets(1),
                vertexBuffer,
                mortonSettings
            );

            expect(vector.getVertex(0)).toEqual([100, 200]);
        });

        it('getSimpleEncodedVertex bypasses morton decoding', () => {
            const mortonValue = encodeMorton(100, 200, 15);
            const vertexBuffer = new Int32Array([mortonValue, 999]);
            const vector = createFlatGeometryVectorMortonEncoded(
                new Int32Array([GEOMETRY_TYPE.POINT]),
                createSimpleTopology(1),
                createVertexOffsets(1),
                vertexBuffer,
                mortonSettings
            );

            expect(vector.getSimpleEncodedVertex(0)).toEqual([mortonValue, 999]);
        });
    });

    describe('getGeometries', () => {
        it('converts to Point arrays', () => {
            const geometryTypes = new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.MULTIPOINT]);
            const topology = new TopologyVector(
                new Uint32Array([0, 1, 3]),
                new Uint32Array([0, 1, 3]),
                new Uint32Array([0, 1, 3])
            );
            const vertexBuffer = new Int32Array([10, 20, 30, 40, 50, 60]);
            const vector = createFlatGeometryVector(geometryTypes, topology, new Int32Array([]), vertexBuffer);

            const geometries = vector.getGeometries();

            expect(geometries).toHaveLength(2);
            expect(geometries[0][0][0]).toMatchObject({ x: 10, y: 20 });
            expect(geometries[1][0][0]).toMatchObject({ x: 30, y: 40 });
            expect(geometries[1][1][0]).toMatchObject({ x: 50, y: 60 });
        });
    });

    describe('containsPolygonGeometry', () => {
        it('returns true when polygon present', () => {
            const vector = createFlatGeometryVector(
                new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POLYGON]),
                createSimpleTopology(2),
                new Int32Array([]),
                createVertexBuffer(2)
            );

            expect(vector.containsPolygonGeometry()).toBe(true);
        });

        it('returns false when no polygons', () => {
            const vector = createFlatGeometryVector(
                new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING]),
                createSimpleTopology(2),
                new Int32Array([]),
                createVertexBuffer(2)
            );

            expect(vector.containsPolygonGeometry()).toBe(false);
        });
    });

    describe('filter', () => {
        it('returns selection of matching geometries', () => {
            const vector = createFlatGeometryVector(
                new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POINT]),
                createSimpleTopology(3),
                new Int32Array([]),
                createVertexBuffer(3)
            );

            const selection = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POINT);

            expect(selection.limit).toBe(2);
            expect(selection.getIndex(0)).toBe(0);
            expect(selection.getIndex(1)).toBe(2);
        });

        it('matches MULTIPOINT to POINT filter', () => {
            const vector = createFlatGeometryVector(
                new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.MULTIPOINT]),
                createSimpleTopology(2),
                new Int32Array([]),
                createVertexBuffer(2)
            );

            expect(vector.filter(SINGLE_PART_GEOMETRY_TYPE.POINT).limit).toBe(2);
        });

        it('returns empty selection when type does not match', () => {
            const vector = createFlatGeometryVector(
                new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.POINT]),
                createSimpleTopology(2),
                new Int32Array([]),
                createVertexBuffer(2)
            );

            expect(vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON).limit).toBe(0);
        });
    });

    describe('filterSelected', () => {
        it('clears selection when type does not match', () => {
            const vector = createFlatGeometryVector(
                new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING]),
                createSimpleTopology(2),
                new Int32Array([]),
                createVertexBuffer(2)
            );
            const selection = new FlatSelectionVector(new Uint32Array([0, 1]));

            vector.filterSelected(SINGLE_PART_GEOMETRY_TYPE.POLYGON, selection);

            expect(selection.limit).toBe(0);
        });

        it('preserves selection when type matches', () => {
            const vector = createFlatGeometryVector(
                new Int32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.MULTIPOINT]),
                createSimpleTopology(2),
                new Int32Array([]),
                createVertexBuffer(2)
            );
            const selection = new FlatSelectionVector(new Uint32Array([0, 1]));

            vector.filterSelected(SINGLE_PART_GEOMETRY_TYPE.POINT, selection);

            expect(selection.limit).toBe(2);
        });
    });

    it('containsSingleGeometryType always returns false', () => {
        const vector = createFlatGeometryVector(
            new Int32Array([GEOMETRY_TYPE.POINT]),
            createSimpleTopology(1),
            new Int32Array([]),
            createVertexBuffer(1)
        );

        expect(vector.containsSingleGeometryType()).toBe(false);
    });
});

function createSimpleTopology(numGeometries: number): TopologyVector {
    const offsets = new Uint32Array(numGeometries + 1);
    for (let i = 0; i <= numGeometries; i++) offsets[i] = i;
    return new TopologyVector(offsets, offsets, offsets);
}

function createVertexBuffer(numVertices: number): Int32Array {
    const buffer = new Int32Array(numVertices * 2);
    for (let i = 0; i < numVertices; i++) {
        buffer[i * 2] = 10 * (i + 1);
        buffer[i * 2 + 1] = 20 * (i + 1);
    }
    return buffer;
}

function createVertexOffsets(numVertices: number): Int32Array {
    const offsets = new Int32Array(numVertices);
    for (let i = 0; i < numVertices; i++) offsets[i] = i;
    return offsets;
}

function encodeMorton(x: number, y: number, numBits: number): number {
    let morton = 0;
    for (let i = 0; i < numBits; i++) {
        morton |= ((x & (1 << i)) << i) | ((y & (1 << i)) << (i + 1));
    }
    return morton;
}
