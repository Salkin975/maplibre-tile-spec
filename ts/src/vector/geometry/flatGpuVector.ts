import { type SelectionVector } from "../filter/selectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import { GpuVector } from "./gpuVector";
import { type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import type TopologyVector from "./topologyVector";
import { ConstSelectionVector } from "../filter/constSelectionVector";

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

    filterSelected(geometryType: SINGLE_PART_GEOMETRY_TYPE, selectionVector: SelectionVector) {
        let limit = 0;
        const vector = selectionVector.selectionValues();
        for (let i = 0; i < selectionVector.limit; i++) {
            const index = vector[i];
            if (this.geometryType(index) === geometryType || this.geometryType(index) === geometryType + 3) {
                vector[limit++] = index;
            }
        }

        selectionVector.setLimit(limit);
    }

    containsSingleGeometryType(): boolean {
        return false;
    }
}
