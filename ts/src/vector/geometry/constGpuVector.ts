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
        public readonly numGeometries: number,
        public readonly constGeometryType: number,
        public readonly triangleOffsets: Uint32Array,
        public readonly indexBuffer: Int32Array,
        public readonly vertexBuffer: Int32Array,
        public readonly topologyVector: TopologyVector | null = null,
    ) {}

    geometryType(index?: number): number {
        return this.constGeometryType;
    }

    getGeometries(): CoordinatesArray[] {
        return getGeometries(this);
    }

    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        return createSelectionVectorByTypeConst(geometryType, this.constGeometryType, this.numGeometries);
    }

    filterSelected(geometryType: SINGLE_PART_GEOMETRY_TYPE, selectionVector: SelectionVector): void {
        filterSelectedByTypeConst(geometryType, this.constGeometryType, selectionVector);
    }

    containsSingleGeometryType(): boolean {
        return true;
    }
}
