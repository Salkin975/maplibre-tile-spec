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
        public readonly numGeometries: number,
        public readonly constGeometryType: number,
        public readonly vertexBufferType: VertexBufferType,
        public readonly topologyVector: TopologyVector,
        public readonly vertexOffsets: Int32Array,
        public readonly vertexBuffer: Int32Array,
        public readonly mortonSettings: MortonSettings | undefined = undefined,
    ) {}

    geometryType(index?: number): number {
        return this.constGeometryType;
    }

    getVertex(index: number): [number, number] {
        return getVertex(index, this.vertexOffsets, this.vertexBuffer, this.mortonSettings);
    }

    getSimpleEncodedVertex(index: number): [number, number] {
        return getSimpleEncodedVertex(index, this.vertexOffsets, this.vertexBuffer);
    }

    getGeometries() {
        return convertGeometryVector(this);
    }

    containsPolygonGeometry(): boolean {
        return containsPolygonGeometryConst(this.constGeometryType);
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
