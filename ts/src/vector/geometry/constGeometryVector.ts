import { type IGeometryVector, type MortonSettings } from "./geometryVector";
import type TopologyVector from "../../vector/geometry/topologyVector";
import { type SelectionVector } from "../filter/selectionVector";
import { type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { VertexBufferType } from "./vertexBufferType";
import {
    containsPolygonGeometryConst,
    createSelectionVectorByTypeConst,
    filterSelectedByTypeConst,
} from "./geometryVectorFilterUtils";
import {
    convertGeometryVector,
    getSimpleEncodedVertex,
    getVertex
} from "./geometryVectorUtils";

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
        private readonly _vertexBufferType: VertexBufferType,
        private readonly _topologyVector: TopologyVector,
        private readonly _vertexOffsets: Int32Array,
        private readonly _vertexBuffer: Int32Array,
        private readonly _mortonSettings?: MortonSettings,
    ) {}

    geometryType(index?: number): number {
        return this._geometryType;
    }

    get numGeometries(): number {
        return this._numGeometries;
    }

    get vertexBufferType(): VertexBufferType {
        return this._vertexBufferType;
    }

    get topologyVector(): TopologyVector {
        return this._topologyVector;
    }

    get vertexOffsets(): Int32Array {
        return this._vertexOffsets;
    }

    get vertexBuffer(): Int32Array {
        return this._vertexBuffer;
    }

    get mortonSettings(): MortonSettings | undefined {
        return this._mortonSettings;
    }

    getVertex(index: number): [number, number] {
        return getVertex(index, this._vertexOffsets, this._vertexBuffer, this._mortonSettings);
    }

    getSimpleEncodedVertex(index: number): [number, number] {
        return getSimpleEncodedVertex(index, this._vertexOffsets, this._vertexBuffer);
    }

    getGeometries() {
        return convertGeometryVector(this);
    }

    containsPolygonGeometry(): boolean {
        return containsPolygonGeometryConst(this._geometryType);
    }

    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        return createSelectionVectorByTypeConst(geometryType, this._geometryType, this.numGeometries);
    }

    filterSelected(geometryType: SINGLE_PART_GEOMETRY_TYPE, selectionVector: SelectionVector): void {
        filterSelectedByTypeConst(geometryType, this._geometryType, selectionVector);
    }

    containsSingleGeometryType(): boolean {
        return true;
    }
}
