import { GeometryVector, type MortonSettings } from "./geometryVector";
import type TopologyVector from "../../vector/geometry/topologyVector";
import { type SelectionVector } from "../filter/selectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import { GEOMETRY_TYPE, type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { VertexBufferType } from "./vertexBufferType";
import { ConstSelectionVector } from "../filter/constSelectionVector";

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

export class FlatGeometryVector extends GeometryVector {
    constructor(
        vertexBufferType: VertexBufferType,
        //TODO: refactor -> use UInt8Array
        private readonly _geometryTypes: Int32Array,
        topologyVector: TopologyVector,
        vertexOffsets: Int32Array,
        vertexBuffer: Int32Array,
        mortonSettings?: MortonSettings,
    ) {
        super(vertexBufferType, topologyVector, vertexOffsets, vertexBuffer, mortonSettings);
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

    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        const selectionVector = new Uint32Array(this.numGeometries);
        let index = 0;
        for (let i = 0; i < this.numGeometries; i++) {
            if (this.geometryType(i) === geometryType || this.geometryType(i) === geometryType + 3) {
                selectionVector[index++] = i;
            }
        }
        if (index === 0) {
            return ConstSelectionVector.empty(this.numGeometries);
        }
        if (index === this.numGeometries) {
            return ConstSelectionVector.full(this.numGeometries);
        }
        return new FlatSelectionVector(selectionVector.subarray(0, index));
    }

    filterSelected(predicateGeometryType: SINGLE_PART_GEOMETRY_TYPE, selectionVector: SelectionVector) {
        let limit = 0;
        const vector = selectionVector.selectionValues();
        for (let i = 0; i < selectionVector.limit; i++) {
            const index = vector[i];
            const geometryType = this.geometryType(index);
            if (predicateGeometryType === geometryType || predicateGeometryType + 3 === geometryType) {
                vector[limit++] = index;
            }
        }

        selectionVector.setLimit(limit);
    }

    containsSingleGeometryType(): boolean {
        return false;
    }
}
