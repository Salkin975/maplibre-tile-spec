import { type SelectionVector } from "../filter/selectionVector";
import { type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { type CoordinatesArray } from "./geometryVector";
import { type IGpuVector } from "./gpuVector";
import type TopologyVector from "./topologyVector";

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
        triangleOffsets: Uint32Array,
        indexBuffer: Int32Array,
        vertexBuffer: Int32Array,
        topologyVector?: TopologyVector | null,
    ) {}
    triangleOffsets: Uint32Array<ArrayBufferLike>;
    indexBuffer: Int32Array<ArrayBufferLike>;
    vertexBuffer: Int32Array<ArrayBufferLike>;
    topologyVector: TopologyVector;
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
        return this._geometryType;
    }

    get numGeometries(): number {
        return this._numGeometries;
    }

    containsSingleGeometryType(): boolean {
        return true;
    }
}
