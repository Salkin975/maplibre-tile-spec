import { type SelectionVector } from "../filter/selectionVector";
import { GpuVector } from "./gpuVector";
import { type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import type TopologyVector from "./topologyVector";
import {ConstSelectionVector} from "../filter/constSelectionVector";

export function createConstGpuVector(
    numGeometries: number,
    geometryType: number,
    triangleOffsets: Int32Array,
    indexBuffer: Int32Array,
    vertexBuffer: Int32Array,
    topologyVector?: TopologyVector | null,
): GpuVector {
    return new ConstGpuVector(numGeometries, geometryType, triangleOffsets, indexBuffer, vertexBuffer, topologyVector);
}

//TODO: extend from GeometryVector -> make topology vector optional
export class ConstGpuVector extends GpuVector {
    constructor(
        private readonly _numGeometries: number,
        private readonly _geometryType: number,
        triangleOffsets: Int32Array,
        indexBuffer: Int32Array,
        vertexBuffer: Int32Array,
        topologyVector?: TopologyVector | null,
    ) {
        super(triangleOffsets, indexBuffer, vertexBuffer, topologyVector);
    }

    geometryType(index: number): number {
        return this._geometryType;
    }

    get numGeometries(): number {
        return this._numGeometries;
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
