import { type SelectionVector } from "../filter/selectionVector";
import { type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { GpuVector } from "./gpuVector";
import type TopologyVector from "./topologyVector";

export function createFlatGpuVector(
    geometryTypes: Int32Array,
    triangleOffsets: Int32Array,
    indexBuffer: Int32Array,
    vertexBuffer: Int32Array,
    topologyVector?: TopologyVector | null,
): GpuVector {
    return new FlatGpuVector(geometryTypes, triangleOffsets, indexBuffer, vertexBuffer, topologyVector);
}

//TODO: extend from GeometryVector -> make topology vector optional
export class FlatGpuVector extends GpuVector {
    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        throw new Error("Method not implemented.");
    }
    filterSelected(geometryType: SINGLE_PART_GEOMETRY_TYPE, selectionVector: SelectionVector) {
        throw new Error("Method not implemented.");
    }
    constructor(
        private readonly _geometryTypes: Int32Array,
        triangleOffsets: Int32Array,
        indexBuffer: Int32Array,
        vertexBuffer: Int32Array,
        topologyVector: TopologyVector | null,
    ) {
        super(triangleOffsets, indexBuffer, vertexBuffer, topologyVector);
    }

    geometryType(index: number): number {
        return this._geometryTypes[index];
    }

    get numGeometries(): number {
        return this._geometryTypes.length;
    }

    containsSingleGeometryType(): boolean {
        return false;
    }
}
