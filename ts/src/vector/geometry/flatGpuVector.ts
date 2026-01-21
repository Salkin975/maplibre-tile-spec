import { type IGpuVector } from "./gpuVector";
import type TopologyVector from "./topologyVector";
import { type CoordinatesArray } from "./geometryVector";
import { type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { type SelectionVector } from "../filter/selectionVector";
import { createSelectionVectorByTypeFlat, filterSelectedByTypeFlat } from "./geometryVectorFilterUtils";
import {getGeometries} from "./gpuVectorUtils";

export function createFlatGpuVector(
    geometryTypes: Int32Array,
    triangleOffsets: Uint32Array,
    indexBuffer: Int32Array,
    vertexBuffer: Int32Array,
    topologyVector?: TopologyVector | null,
): FlatGpuVector {
    return new FlatGpuVector(geometryTypes, triangleOffsets, indexBuffer, vertexBuffer, topologyVector);
}

//TODO: extend from GeometryVector -> make topology vector optional
export class FlatGpuVector implements IGpuVector {
    constructor(
        public readonly geometryTypes: Int32Array,
        public readonly triangleOffsets: Uint32Array,
        public readonly indexBuffer: Int32Array,
        public readonly vertexBuffer: Int32Array,
        public readonly topologyVector: TopologyVector | null,
    ) {}

    geometryType(index: number): number {
        return this.geometryTypes[index];
    }

    get numGeometries(): number {
        return this.geometryTypes.length;
    }

    getGeometries(): CoordinatesArray[] {
        return getGeometries(this);
    }

    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        return createSelectionVectorByTypeFlat(geometryType, this.geometryTypes, this.numGeometries);
    }

    filterSelected(geometryType: SINGLE_PART_GEOMETRY_TYPE, selectionVector: SelectionVector): void {
        filterSelectedByTypeFlat(geometryType, this.geometryTypes, selectionVector);
    }

    containsSingleGeometryType(): boolean {
        return false;
    }
}
