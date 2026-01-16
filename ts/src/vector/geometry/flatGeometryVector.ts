import { type CoordinatesArray, type IGeometryVector, type MortonSettings } from "./geometryVector";
import type TopologyVector from "../../vector/geometry/topologyVector";
import { GEOMETRY_TYPE, type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { VertexBufferType } from "./vertexBufferType";
import { type SelectionVector } from "../filter/selectionVector";

export function createFlatGeometryVector(
    geometryTypes: Int32Array,
    topologyVector: TopologyVector,
    vertexOffsets: Int32Array,
    vertexBuffer: Int32Array,
): FlatGeometryVector {
    return new FlatGeometryVector(VertexBufferType.VEC_2, geometryTypes, topologyVector, vertexOffsets, vertexBuffer);
}

export function createFlatGeometryVectorMortonEncoded(
    geometryTypes: Int32Array,
    topologyVector: TopologyVector,
    vertexOffsets: Int32Array,
    vertexBuffer: Int32Array,
    mortonInfo: MortonSettings,
): FlatGeometryVector {
    //TODO: refactor to use unsigned integers
    return new FlatGeometryVector(
        VertexBufferType.MORTON,
        geometryTypes,
        topologyVector,
        vertexOffsets,
        vertexBuffer,
        mortonInfo,
    );
}

export class FlatGeometryVector implements IGeometryVector {
    constructor(
        vertexBufferType: VertexBufferType,
        //TODO: refactor -> use UInt8Array
        private readonly _geometryTypes: Int32Array,
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

    get geometryTypes(): Int32Array {
        return this._geometryTypes;
    }

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

    geometryType(index: number): number {
        return this._geometryTypes[index];
    }

    get numGeometries(): number {
        return this._geometryTypes.length;
    }

    containsPolygonGeometry(): boolean {
        for (let i = 0; i < this.numGeometries; i++) {
            if (this.geometryType(i) === GEOMETRY_TYPE.POLYGON || this.geometryType(i) === GEOMETRY_TYPE.MULTIPOLYGON) {
                return true;
            }
        }
        return false;
    }

    containsSingleGeometryType(): boolean {
        return false;
    }
}
