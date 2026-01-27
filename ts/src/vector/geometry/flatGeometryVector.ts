import { type Geometry, type IGeometryVector, type MortonSettings } from "./geometryVector";
import type TopologyVector from "../../vector/geometry/topologyVector";
import { type SelectionVector } from "../filter/selectionVector";
import { type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { VertexBufferType } from "./vertexBufferType";
import {
    convertGeometryVector,
    getSimpleEncodedVertex,
    getVertex
} from "./geometryVectorUtils";
import {
    containsPolygonGeometryFlat,
    createSelectionVectorByTypeFlat,
    filterSelectedByTypeFlat,
} from "./geometryVectorFilterUtils";

export function createFlatGeometryVector(
    geometryTypes: Int32Array,
    topologyVector: TopologyVector,
    vertexOffsets: Int32Array,
    vertexBuffer: Int32Array,
): FlatGeometryVector {
    return new FlatGeometryVector(VertexBufferType.VEC_2, geometryTypes, topologyVector, vertexOffsets, vertexBuffer);
}

export function createFlatGeometryVectorMortonEncoded(
    geometryTypes: Int32Array,
    topologyVector: TopologyVector,
    vertexOffsets: Int32Array,
    vertexBuffer: Int32Array,
    mortonInfo: MortonSettings,
): FlatGeometryVector {
    //TODO: refactor to use unsigned integers
    return new FlatGeometryVector(
        VertexBufferType.MORTON,
        geometryTypes,
        topologyVector,
        vertexOffsets,
        vertexBuffer,
        mortonInfo,
    );
}

export class FlatGeometryVector implements IGeometryVector {
    constructor(
        public readonly vertexBufferType: VertexBufferType,
        //TODO: refactor -> use UInt8Array
        public readonly geometryTypes: Int32Array,
        public readonly topologyVector: TopologyVector,
        public readonly vertexOffsets: Int32Array,
        public readonly vertexBuffer: Int32Array,
        public readonly mortonSettings: MortonSettings | undefined = undefined,
    ) {}

    geometryType(index: number): number {
        return this.geometryTypes[index];
    }

    get numGeometries(): number {
        return this.geometryTypes.length;
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
        return containsPolygonGeometryFlat(this.geometryTypes);
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

    *[Symbol.iterator](): Iterator<Geometry> {
        const geometries = this.getGeometries();
        for (let i = 0; i < this.numGeometries; i++) {
            yield { coordinates: geometries[i], type: this.geometryTypes[i] };
        }
    }
}
