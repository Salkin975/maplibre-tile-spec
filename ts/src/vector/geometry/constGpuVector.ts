import { type SelectionVector } from "../filter/selectionVector";
import { type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { type IGpuVector } from "./gpuVector";
import { type CoordinatesArray } from "./geometryVector";
import type TopologyVector from "./topologyVector";
import {
    createSelectionVectorByTypeConst,
    filterSelectedByTypeConst,
} from "./geometryVectorFilterUtils";
import { getGeometries } from "./gpuVectorUtils";

export function createConstGpuVector(
    numGeometries: number,
    geometryType: number,
    triangleOffsets: Uint32Array,
    indexBuffer: Int32Array,
    vertexBuffer: Int32Array,
    topologyVector?: TopologyVector | null,
): IGpuVector {
    return new ConstGpuVector(numGeometries, geometryType, triangleOffsets, indexBuffer, vertexBuffer, topologyVector);
}

//TODO: extend from GeometryVector -> make topology vector optional
export class ConstGpuVector implements IGpuVector {
    constructor(
        private readonly _numGeometries: number,
        private readonly _geometryType: number,
        private readonly _triangleOffsets: Uint32Array,
        private readonly _indexBuffer: Int32Array,
        private readonly _vertexBuffer: Int32Array,
        private readonly _topologyVector: TopologyVector | null = null,
    ) {}

    geometryType(index?: number): number {
        return this._geometryType;
    }

    get numGeometries(): number {
        return this._numGeometries;
    }

    get triangleOffsets(): Uint32Array {
        return this._triangleOffsets;
    }

    get indexBuffer(): Int32Array {
        return this._indexBuffer;
    }

    get vertexBuffer(): Int32Array {
        return this._vertexBuffer;
    }

    get topologyVector(): TopologyVector | null {
        return this._topologyVector;
    }

    getGeometries(): CoordinatesArray[] {
        return getGeometries(this);
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
