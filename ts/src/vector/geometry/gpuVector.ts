import { type CoordinatesArray } from "./geometryVector";
import type TopologyVector from "./topologyVector";
import { type IGeometryCollection } from "./geometryCollection";


export interface IGpuVector extends IGeometryCollection {

    readonly triangleOffsets: Uint32Array;

    readonly indexBuffer: Int32Array;

    readonly vertexBuffer: Int32Array;

    readonly topologyVector: TopologyVector | null;

    getGeometries(): CoordinatesArray[];
}

