import { GeometryVector, type MortonSettings } from "./geometryVector";
import type TopologyVector from "../../vector/geometry/topologyVector";
import { type SelectionVector } from "../filter/selectionVector";
import { GEOMETRY_TYPE, type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { VertexBufferType } from "./vertexBufferType";
import {ConstSelectionVector} from "../filter/constSelectionVector";

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

export class ConstGeometryVector extends GeometryVector {
    constructor(
        private readonly _numGeometries: number,
        private readonly _geometryType: number,
        vertexBufferType: VertexBufferType,
        topologyVector: TopologyVector,
        vertexOffsets: Int32Array,
        vertexBuffer: Int32Array,
        mortonSettings?: MortonSettings,
    ) {
        super(vertexBufferType, topologyVector, vertexOffsets, vertexBuffer, mortonSettings);
    }

    geometryType(index: number): number {
        return this._geometryType;
    }

    get numGeometries(): number {
        return this._numGeometries;
    }

    containsPolygonGeometry(): boolean {
        return this._geometryType === GEOMETRY_TYPE.POLYGON || this._geometryType === GEOMETRY_TYPE.MULTIPOLYGON;
    }

    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        if (geometryType !== this._geometryType && geometryType + 3 !== this._geometryType) {
            return ConstSelectionVector.empty(this.numGeometries);
        }
        return ConstSelectionVector.full(this.numGeometries);
    }

    filterSelected(geometryType: SINGLE_PART_GEOMETRY_TYPE, selectionVector: SelectionVector) {
        if (geometryType !== this._geometryType && geometryType + 3 !== this._geometryType) {
            selectionVector.setLimit(0);
        }
    }

    containsSingleGeometryType(): boolean {
        return true;
    }
}
