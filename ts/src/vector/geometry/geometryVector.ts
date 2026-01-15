import type TopologyVector from "../../vector/geometry/topologyVector";
import { type GEOMETRY_TYPE } from "./geometryType";
import { type VertexBufferType } from "./vertexBufferType";
import type Point from "@mapbox/point-geometry";
import { type IGeometryCollection } from "./geometryCollection";

export type CoordinatesArray = Array<Array<Point>>;

export type Geometry = {
    coordinates: CoordinatesArray;
    type: GEOMETRY_TYPE;
};

export interface MortonSettings {
    numBits: number;
    coordinateShift: number;
}

export interface IGeometryVector extends IGeometryCollection {

    readonly vertexBufferType: VertexBufferType;

    readonly topologyVector: TopologyVector;

    readonly vertexOffsets: Int32Array;

    readonly vertexBuffer: Int32Array;

    readonly mortonSettings: MortonSettings | undefined;

    getVertex(index: number): [number, number];

    getSimpleEncodedVertex(index: number): [number, number];

    getGeometries(): CoordinatesArray[];

    containsPolygonGeometry(): boolean;
}

