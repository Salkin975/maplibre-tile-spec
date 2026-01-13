import { type IGeometryVector, type MortonSettings, type Geometry } from "./geometryVector";
import type TopologyVector from "../../vector/geometry/topologyVector";
import { type SelectionVector } from "../filter/selectionVector";
import { type SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { VertexBufferType } from "./vertexBufferType";
import { GeometryFilterUtils } from "./geometryFilterUtils";
import { GeometryVectorUtils } from "./geometryVectorUtils";

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
        private readonly _vertexBufferType: VertexBufferType,
        //TODO: refactor -> use UInt8Array
        private readonly _geometryTypes: Int32Array,
        private readonly _topologyVector: TopologyVector,
        private readonly _vertexOffsets: Int32Array,
        private readonly _vertexBuffer: Int32Array,
        private readonly _mortonSettings?: MortonSettings,
    ) {}

    geometryType(index: number): number {
        return this._geometryTypes[index];
    }

    get numGeometries(): number {
        return this._geometryTypes.length;
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
        return GeometryVectorUtils.getVertex(index, this._vertexOffsets, this._vertexBuffer, this._mortonSettings);
    }

    getSimpleEncodedVertex(index: number): [number, number] {
        return GeometryVectorUtils.getSimpleEncodedVertex(index, this._vertexOffsets, this._vertexBuffer);
    }

    getGeometries() {
        return GeometryVectorUtils.convertGeometryVector(this);
    }

    *[Symbol.iterator](): Iterator<Geometry> {
        const geometries = GeometryVectorUtils.convertGeometryVector(this);
        let index = 0;

        while (index < this.numGeometries) {
            yield { coordinates: geometries[index], type: this.geometryType(index) };
            index++;
        }
    }

    containsPolygonGeometry(): boolean {
        return GeometryFilterUtils.containsPolygonGeometryFlat(this._geometryTypes);
    }

    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        return GeometryFilterUtils.filterFlat(geometryType, this._geometryTypes, this.numGeometries);
    }

    filterSelected(geometryType: SINGLE_PART_GEOMETRY_TYPE, selectionVector: SelectionVector): void {
        GeometryFilterUtils.filterSelectedFlat(geometryType, this._geometryTypes, selectionVector);
    }

    containsSingleGeometryType(): boolean {
        return GeometryFilterUtils.containsSingleGeometryTypeFlat();
    }
}
