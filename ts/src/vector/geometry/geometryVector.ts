import { convertGeometryAtIndex, convertGeometryVector } from "./geometryVectorConverter";
import { decodeZOrderCurve } from "./zOrderCurve";
import type Point from "@mapbox/point-geometry";
import type { GEOMETRY_TYPE, SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import type { VertexBufferType } from "./vertexBufferType";
import type { TopologyVector } from "./topologyVector";
import { ConstSelectionVector } from "../filter/constSelectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import type { SelectionVector } from "../filter/selectionVector";
import type { GeometryCollection } from "./geometryCollection";

export type CoordinatesArray = Array<Array<Point>>;

/** Multi-part geometry types follow their single-part counterparts in {@link GEOMETRY_TYPE} at a fixed offset (POINT=0 → MULTIPOINT=3, etc.). */
const MULTI_PART_TYPE_OFFSET = 3;

function matchesGeometryType(currentType: number, geometryType: SINGLE_PART_GEOMETRY_TYPE): boolean {
    return currentType === geometryType || currentType === geometryType + MULTI_PART_TYPE_OFFSET;
}

/**
 * Shared implementation of {@link GeometryCollection.filter} for {@link GeometryVector} and GpuVector.
 * Not re-exported from any barrel — internal to the geometry vector classes.
 */
export function filterByGeometryType(
    collection: GeometryCollection,
    geometryType: SINGLE_PART_GEOMETRY_TYPE,
): SelectionVector {
    if (collection.containsSingleGeometryType()) {
        return matchesGeometryType(collection.geometryType(0), geometryType)
            ? ConstSelectionVector.full(collection.numGeometries)
            : ConstSelectionVector.empty(collection.numGeometries);
    }

    const selected = new Uint32Array(collection.numGeometries);
    let selectedCount = 0;
    for (let i = 0; i < collection.numGeometries; i++) {
        if (matchesGeometryType(collection.geometryType(i), geometryType)) {
            selected[selectedCount++] = i;
        }
    }

    if (selectedCount === 0) {
        return ConstSelectionVector.empty(collection.numGeometries);
    }
    if (selectedCount === collection.numGeometries) {
        return ConstSelectionVector.full(collection.numGeometries);
    }
    return new FlatSelectionVector(selected, selectedCount);
}

export type Geometry = {
    coordinates: CoordinatesArray;
    type: GEOMETRY_TYPE;
};

export interface MortonSettings {
    numBits: number;
    coordinateShift: number;
}

export abstract class GeometryVector implements GeometryCollection {
    protected constructor(
        private readonly _vertexBufferType: VertexBufferType,
        private readonly _topologyVector: TopologyVector,
        private readonly _vertexOffsets: Uint32Array | undefined,
        private readonly _vertexBuffer: Int32Array | Uint32Array,
        private readonly _mortonSettings?: MortonSettings,
    ) {}

    get vertexBufferType(): VertexBufferType {
        return this._vertexBufferType;
    }

    get topologyVector(): TopologyVector {
        return this._topologyVector;
    }

    get vertexOffsets(): Uint32Array | undefined {
        return this._vertexOffsets;
    }

    get vertexBuffer(): Int32Array | Uint32Array {
        return this._vertexBuffer;
    }

    //TODO: add scaling information to the constructor
    getVertex(index: number): [number, number] {
        if (this.vertexOffsets && this.mortonSettings) {
            //TODO: move decoding of the morton codes on the GPU in the vertex shader
            const vertexOffset = this.vertexOffsets[index];
            const mortonEncodedVertex = this.vertexBuffer[vertexOffset];
            //TODO: improve performance -> inline calculation and move to decoding of VertexBuffer
            const vertex = decodeZOrderCurve(
                mortonEncodedVertex,
                this.mortonSettings.numBits,
                this.mortonSettings.coordinateShift,
            );
            return [vertex.x, vertex.y];
        }

        const offset = this.vertexOffsets ? this.vertexOffsets[index] * 2 : index * 2;
        const x = this.vertexBuffer[offset];
        const y = this.vertexBuffer[offset + 1];
        return [x, y];
    }

    getGeometries(): CoordinatesArray[] {
        return convertGeometryVector(this);
    }

    getGeometry(index: number): CoordinatesArray {
        return convertGeometryAtIndex(this, index);
    }

    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        return filterByGeometryType(this, geometryType);
    }


    get mortonSettings(): MortonSettings | undefined {
        return this._mortonSettings;
    }

    abstract containsPolygonGeometry(): boolean;

    abstract geometryType(index: number): number;

    abstract get numGeometries(): number;

    abstract containsSingleGeometryType(): boolean;
}
