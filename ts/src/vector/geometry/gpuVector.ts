import { createFlatGeometryVector } from "./flatGeometryVector";
import { convertGeometryAtIndex } from "./geometryVectorConverter";
import { filterByGeometryType, type CoordinatesArray } from "./geometryVector";
import type { TopologyVector } from "./topologyVector";
import type { SelectionVector } from "../filter/selectionVector";
import type { GeometryCollection } from "./geometryCollection";
import type { SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";

export abstract class GpuVector implements Iterable<CoordinatesArray>, GeometryCollection {
    protected constructor(
        private readonly _triangleOffsets: Uint32Array,
        private readonly _indexBuffer: Uint32Array,
        private readonly _vertexBuffer: Int32Array | Uint32Array,
        private readonly _topologyVector?: TopologyVector,
    ) {}

    abstract geometryType(index: number): number;

    abstract get numGeometries(): number;

    abstract containsSingleGeometryType(): boolean;

    get triangleOffsets(): Uint32Array {
        return this._triangleOffsets;
    }

    get indexBuffer(): Uint32Array {
        return this._indexBuffer;
    }

    get vertexBuffer(): Int32Array | Uint32Array {
        return this._vertexBuffer;
    }

    get topologyVector(): TopologyVector | undefined {
        return this._topologyVector;
    }

    getVertex(index: number): [number, number] {
        const offset = index * 2;
        return [this._vertexBuffer[offset], this._vertexBuffer[offset + 1]];
    }

    private requireTopology(): TopologyVector {
        if (!this._topologyVector) {
            throw new Error("Cannot convert GpuVector to coordinates without topology information");
        }
        return this._topologyVector;
    }

    getGeometries(): CoordinatesArray[] {
        const topology = this.requireTopology();
        const types = new Uint32Array(this.numGeometries);
        for (let i = 0; i < this.numGeometries; i++) {
            types[i] = this.geometryType(i);
        }
        return createFlatGeometryVector(types, topology, undefined, this._vertexBuffer).getGeometries();
    }

    getGeometry(index: number): CoordinatesArray {
        // The narrowed topology has to be handed over explicitly: `this.topologyVector` is
        // optional, which `convertGeometryAtIndex` does not accept.
        const topologyVector = this.requireTopology();
        return convertGeometryAtIndex(
            {
                numGeometries: this.numGeometries,
                topologyVector,
                geometryType: (i) => this.geometryType(i),
                getVertex: (i) => this.getVertex(i),
            },
            index,
        );
    }

    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        return filterByGeometryType(this, geometryType);
    }

    [Symbol.iterator](): Iterator<CoordinatesArray> {
        // Returned `null` before, which is not an Iterator — iterating a GpuVector failed with
        // an opaque TypeError instead of saying what was wrong. Use getGeometries() or
        // getGeometry(index) until this is implemented.
        throw new Error("Iterator on a GpuVector is not implemented yet.");
    }
}
