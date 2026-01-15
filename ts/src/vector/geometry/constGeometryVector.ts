import { type CoordinatesArray, type IGeometryVector, type MortonSettings } from "./geometryVector";
import type TopologyVector from "../../vector/geometry/topologyVector";
import { GEOMETRY_TYPE, type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { VertexBufferType } from "./vertexBufferType";
import { type SelectionVector } from "../filter/selectionVector";

export function createConstGeometryVector(
    numGeometries: number,
    geometryType: number,
    topologyVector: TopologyVector,
    vertexOffsets: Int32Array,
    vertexBuffer: Int32Array,
): ConstGeometryVector {
    return new ConstGeometryVector(
        numGeometries,
        geometryType,
        VertexBufferType.VEC_2,
        topologyVector,
        vertexOffsets,
        vertexBuffer,
    );
}

export function createMortonEncodedConstGeometryVector(
    numGeometries: number,
    geometryType: number,
    topologyVector: TopologyVector,
    vertexOffsets: Int32Array,
    vertexBuffer: Int32Array,
    mortonInfo: MortonSettings,
): ConstGeometryVector {
    return new ConstGeometryVector(
        numGeometries,
        geometryType,
        VertexBufferType.MORTON,
        topologyVector,
        vertexOffsets,
        vertexBuffer,
        mortonInfo,
    );
}

export class ConstGeometryVector implements IGeometryVector {
    constructor(
        private readonly _numGeometries: number,
        private readonly _geometryType: number,
        vertexBufferType: VertexBufferType,
        topologyVector: TopologyVector,
        vertexOffsets: Int32Array,
        vertexBuffer: Int32Array,
        mortonSettings?: MortonSettings,
    ) {}
    vertexBufferType: VertexBufferType;
    topologyVector: TopologyVector;
    vertexOffsets: Int32Array<ArrayBufferLike>;
    vertexBuffer: Int32Array<ArrayBufferLike>;
    mortonSettings: MortonSettings;
    getVertex(index: number): [number, number] {
        throw new Error("Method not implemented.");
    }
    getSimpleEncodedVertex(index: number): [number, number] {
        throw new Error("Method not implemented.");
    }
    getGeometries(): CoordinatesArray[] {
        throw new Error("Method not implemented.");
    }
    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        throw new Error("Method not implemented.");
    }
    filterSelected(geometryType: SINGLE_PART_GEOMETRY_TYPE, selectionVector: SelectionVector): void {
        throw new Error("Method not implemented.");
    }

    geometryType(index?: number): number {
        return this._geometryType;
    }

    get numGeometries(): number {
        return this._numGeometries;
    }

    containsPolygonGeometry(): boolean {
        return this._geometryType === GEOMETRY_TYPE.POLYGON || this._geometryType === GEOMETRY_TYPE.MULTIPOLYGON;
    }

    containsSingleGeometryType(): boolean {
        return true;
    }
}
