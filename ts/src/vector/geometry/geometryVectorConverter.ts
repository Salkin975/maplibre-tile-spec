import type { GeometryVector, MortonSettings, CoordinatesArray } from "./geometryVector";
import { decodeZOrderCurve } from "./zOrderCurve";
import { GEOMETRY_TYPE } from "./geometryType";
import { VertexBufferType } from "./vertexBufferType";
import Point from "@mapbox/point-geometry";

/** Which topology buffers exist depends on the geometry types in the column. */
export function convertGeometryVector(geometryVector: GeometryVector): CoordinatesArray[] {
    const geometries: CoordinatesArray[] = new Array(geometryVector.numGeometries);
    let partOffsetCounter = 1;
    let ringOffsetsCounter = 1;
    let geometryOffsetsCounter = 1;
    let geometryCounter = 0;
    let vertexBufferOffset = 0;
    let vertexOffsetsOffset = 0;

    const mortonSettings = geometryVector.mortonSettings;
    const topologyVector = geometryVector.topologyVector;
    const geometryOffsets = topologyVector.geometryOffsets;
    const partOffsets = topologyVector.partOffsets;
    const ringOffsets = topologyVector.ringOffsets;
    const vertexOffsets = geometryVector.vertexOffsets;
    const nonOffset = !vertexOffsets || vertexOffsets.length === 0;

    const containsPolygon = geometryVector.containsPolygonGeometry();
    const vertexBuffer = geometryVector.vertexBuffer;

    for (let i = 0; i < geometryVector.numGeometries; i++) {
        const geometryType = geometryVector.geometryType(i);
        switch (geometryType) {
            case GEOMETRY_TYPE.POINT:
                {
                    let x: number;
                    let y: number;
                    if (nonOffset) {
                        x = vertexBuffer[vertexBufferOffset++];
                        y = vertexBuffer[vertexBufferOffset++];
                    } else if (geometryVector.vertexBufferType === VertexBufferType.MORTON) {
                        const offset = vertexOffsets[vertexOffsetsOffset++];
                        const mortonCode = vertexBuffer[offset];
                        const vertex = decodeZOrderCurve(
                            mortonCode,
                            mortonSettings.numBits,
                            mortonSettings.coordinateShift,
                        );
                        x = vertex.x;
                        y = vertex.y;
                    } else {
                        const offset = vertexOffsets[vertexOffsetsOffset++] * 2;
                        x = vertexBuffer[offset];
                        y = vertexBuffer[offset + 1];
                    }
                    geometries[geometryCounter++] = [[new Point(x, y)]];
                    if (geometryOffsets) geometryOffsetsCounter++;
                    if (partOffsets) partOffsetCounter++;
                    if (ringOffsets) ringOffsetsCounter++;
                }
                break;
            case GEOMETRY_TYPE.MULTIPOINT:
                {
                    const numPoints =
                        geometryOffsets[geometryOffsetsCounter] - geometryOffsets[geometryOffsetsCounter - 1];
                    geometryOffsetsCounter++;
                    let points: Point[];
                    if (nonOffset) {
                        points = new Array(numPoints);
                        for (let j = 0; j < numPoints; j++) {
                            const x = vertexBuffer[vertexBufferOffset++];
                            const y = vertexBuffer[vertexBufferOffset++];
                            points[j] = new Point(x, y);
                        }
                    } else {
                        points = decodeDictionaryEncodedVertices(
                            geometryVector.vertexBufferType,
                            vertexBuffer,
                            vertexOffsets,
                            vertexOffsetsOffset,
                            numPoints,
                            false,
                            mortonSettings,
                        );
                        vertexOffsetsOffset += numPoints;
                    }
                    geometries[geometryCounter++] = points.map((point) => [point]);
                    // MULTIPOINT must increment offset counters like POINT does
                    partOffsetCounter += numPoints;
                    ringOffsetsCounter += numPoints;
                }
                break;
            case GEOMETRY_TYPE.LINESTRING:
                {
                    let numVertices: number;
                    if (containsPolygon) {
                        numVertices = ringOffsets[ringOffsetsCounter] - ringOffsets[ringOffsetsCounter - 1];
                        ringOffsetsCounter++;
                    } else {
                        numVertices = partOffsets[partOffsetCounter] - partOffsets[partOffsetCounter - 1];
                    }
                    partOffsetCounter++;

                    let vertices: Point[];
                    if (nonOffset) {
                        vertices = getLineStringOrRing(vertexBuffer, vertexBufferOffset, numVertices, false);
                        vertexBufferOffset += numVertices * 2;
                    } else {
                        vertices = decodeDictionaryEncodedVertices(
                            geometryVector.vertexBufferType,
                            vertexBuffer,
                            vertexOffsets,
                            vertexOffsetsOffset,
                            numVertices,
                            false,
                            mortonSettings,
                        );
                        vertexOffsetsOffset += numVertices;
                    }

                    geometries[geometryCounter++] = [vertices];

                    if (geometryOffsets) geometryOffsetsCounter++;
                }
                break;
            case GEOMETRY_TYPE.POLYGON:
                {
                    const numRings = partOffsets[partOffsetCounter] - partOffsets[partOffsetCounter - 1];
                    partOffsetCounter++;
                    const rings: CoordinatesArray = new Array(numRings - 1);
                    let shell: Point[];
                    let numVertices = ringOffsets[ringOffsetsCounter] - ringOffsets[ringOffsetsCounter - 1];
                    ringOffsetsCounter++;

                    if (nonOffset) {
                        shell = getLineStringOrRing(vertexBuffer, vertexBufferOffset, numVertices, true);
                        vertexBufferOffset += numVertices * 2;
                        for (let j = 0; j < rings.length; j++) {
                            numVertices = ringOffsets[ringOffsetsCounter] - ringOffsets[ringOffsetsCounter - 1];
                            ringOffsetsCounter++;
                            rings[j] = getLineStringOrRing(vertexBuffer, vertexBufferOffset, numVertices, true);
                            vertexBufferOffset += numVertices * 2;
                        }
                    } else {
                        shell = decodeDictionaryEncodedVertices(
                            geometryVector.vertexBufferType,
                            vertexBuffer,
                            vertexOffsets,
                            vertexOffsetsOffset,
                            numVertices,
                            true,
                            mortonSettings,
                        );
                        vertexOffsetsOffset += numVertices;
                        for (let j = 0; j < rings.length; j++) {
                            numVertices = ringOffsets[ringOffsetsCounter] - ringOffsets[ringOffsetsCounter - 1];
                            ringOffsetsCounter++;
                            rings[j] = decodeDictionaryEncodedVertices(
                                geometryVector.vertexBufferType,
                                vertexBuffer,
                                vertexOffsets,
                                vertexOffsetsOffset,
                                numVertices,
                                true,
                                mortonSettings,
                            );
                            vertexOffsetsOffset += numVertices;
                        }
                    }
                    geometries[geometryCounter++] = [shell].concat(rings);
                    if (geometryOffsets) geometryOffsetsCounter++;
                }
                break;
            case GEOMETRY_TYPE.MULTILINESTRING:
                {
                    const numLineStrings =
                        geometryOffsets[geometryOffsetsCounter] - geometryOffsets[geometryOffsetsCounter - 1];
                    geometryOffsetsCounter++;
                    const lineStrings: CoordinatesArray = new Array(numLineStrings);
                    for (let j = 0; j < numLineStrings; j++) {
                        let numVertices: number;
                        if (containsPolygon) {
                            numVertices = ringOffsets[ringOffsetsCounter] - ringOffsets[ringOffsetsCounter - 1];
                            ringOffsetsCounter++;
                        } else {
                            numVertices = partOffsets[partOffsetCounter] - partOffsets[partOffsetCounter - 1];
                        }
                        partOffsetCounter++;
                        if (nonOffset) {
                            lineStrings[j] = getLineStringOrRing(vertexBuffer, vertexBufferOffset, numVertices, false);
                            vertexBufferOffset += numVertices * 2;
                        } else {
                            const vertices = decodeDictionaryEncodedVertices(
                                geometryVector.vertexBufferType,
                                vertexBuffer,
                                vertexOffsets,
                                vertexOffsetsOffset,
                                numVertices,
                                false,
                                mortonSettings,
                            );
                            lineStrings[j] = vertices;
                            vertexOffsetsOffset += numVertices;
                        }
                    }
                    geometries[geometryCounter++] = lineStrings;
                }
                break;
            case GEOMETRY_TYPE.MULTIPOLYGON:
                {
                    const numPolygons =
                        geometryOffsets[geometryOffsetsCounter] - geometryOffsets[geometryOffsetsCounter - 1];
                    geometryOffsetsCounter++;
                    const polygons: CoordinatesArray[] = new Array(numPolygons);
                    for (let j = 0; j < numPolygons; j++) {
                        const numRings = partOffsets[partOffsetCounter] - partOffsets[partOffsetCounter - 1];
                        partOffsetCounter++;
                        let shell: Point[];
                        const rings: CoordinatesArray = new Array(numRings - 1);
                        const numVertices = ringOffsets[ringOffsetsCounter] - ringOffsets[ringOffsetsCounter - 1];
                        ringOffsetsCounter++;
                        if (nonOffset) {
                            shell = getLineStringOrRing(vertexBuffer, vertexBufferOffset, numVertices, true);
                            vertexBufferOffset += numVertices * 2;
                        } else {
                            shell = decodeDictionaryEncodedVertices(
                                geometryVector.vertexBufferType,
                                vertexBuffer,
                                vertexOffsets,
                                vertexOffsetsOffset,
                                numVertices,
                                true,
                                mortonSettings,
                            );
                            vertexOffsetsOffset += numVertices;
                        }
                        for (let k = 0; k < rings.length; k++) {
                            const numRingVertices =
                                ringOffsets[ringOffsetsCounter] - ringOffsets[ringOffsetsCounter - 1];
                            ringOffsetsCounter++;
                            if (nonOffset) {
                                rings[k] = getLineStringOrRing(vertexBuffer, vertexBufferOffset, numRingVertices, true);
                                vertexBufferOffset += numRingVertices * 2;
                            } else {
                                rings[k] = decodeDictionaryEncodedVertices(
                                    geometryVector.vertexBufferType,
                                    vertexBuffer,
                                    vertexOffsets,
                                    vertexOffsetsOffset,
                                    numRingVertices,
                                    true,
                                    mortonSettings,
                                );
                                vertexOffsetsOffset += numRingVertices;
                            }
                        }
                        polygons[j] = [shell].concat(rings);
                    }
                    geometries[geometryCounter++] = polygons.flat();
                }
                break;
            default:
                throw new Error(`The specified geometry type (${geometryType}) is currently not supported.`);
        }
    }

    return geometries;
}

type IndexedGeometrySource = {
    readonly numGeometries: number;
    readonly topologyVector: {
        readonly geometryOffsets?: Uint32Array;
        readonly partOffsets?: Uint32Array;
        readonly ringOffsets?: Uint32Array;
    };
    geometryType(index: number): number;
    getVertex(index: number): [number, number];
};

export function convertGeometryAtIndex(geometryVector: IndexedGeometrySource, targetIndex: number): CoordinatesArray {
    if (targetIndex < 0 || targetIndex >= geometryVector.numGeometries) {
        throw new RangeError("Geometry index out of bounds");
    }

    const topology = geometryVector.topologyVector;
    const geometryOffsets = topology.geometryOffsets;
    const partOffsets = topology.partOffsets;
    const ringOffsets = topology.ringOffsets;
    const rootStart = geometryOffsets?.[targetIndex] ?? targetIndex;
    const rootEnd = geometryOffsets?.[targetIndex + 1] ?? targetIndex + 1;

    const readVertices = (start: number, end: number, close: boolean): Point[] => {
        const count = end - start;
        const vertices = new Array<Point>(close ? count + 1 : count);
        for (let i = 0; i < count; i++) {
            const [x, y] = geometryVector.getVertex(start + i);
            vertices[i] = new Point(x, y);
        }
        if (close) vertices[count] = new Point(vertices[0].x, vertices[0].y);
        return vertices;
    };

    const vertexRange = (start: number, end: number): [number, number] => {
        if (ringOffsets) {
            const ringStart = partOffsets?.[start] ?? start;
            const ringEnd = partOffsets?.[end] ?? end;
            return [ringOffsets[ringStart], ringOffsets[ringEnd]];
        }
        if (partOffsets) {
            return [partOffsets[start], partOffsets[end]];
        }
        return [start, end];
    };

    const readLine = (rootIndex: number): Point[] => {
        const [start, end] = vertexRange(rootIndex, rootIndex + 1);
        return readVertices(start, end, false);
    };

    const readPolygonRings = (start: number, end: number): Point[][] => {
        if (!partOffsets || !ringOffsets) throw new Error("Missing topology offsets for Polygon");
        const rings: Point[][] = [];
        for (let polygonIndex = start; polygonIndex < end; polygonIndex++) {
            const ringStart = partOffsets[polygonIndex];
            const ringEnd = partOffsets[polygonIndex + 1];
            for (let ringIndex = ringStart; ringIndex < ringEnd; ringIndex++) {
                rings.push(readVertices(ringOffsets[ringIndex], ringOffsets[ringIndex + 1], true));
            }
        }
        return rings;
    };

    switch (geometryVector.geometryType(targetIndex)) {
        case GEOMETRY_TYPE.POINT: {
            const [start] = vertexRange(rootStart, rootEnd);
            return [readVertices(start, start + 1, false)];
        }
        case GEOMETRY_TYPE.MULTIPOINT: {
            const [start, end] = vertexRange(rootStart, rootEnd);
            return readVertices(start, end, false).map((point) => [point]);
        }
        case GEOMETRY_TYPE.LINESTRING: {
            const [start, end] = vertexRange(rootStart, rootEnd);
            return [readVertices(start, end, false)];
        }
        case GEOMETRY_TYPE.POLYGON:
            return readPolygonRings(rootStart, rootEnd);
        case GEOMETRY_TYPE.MULTILINESTRING: {
            const lines = new Array<Point[]>(rootEnd - rootStart);
            for (let rootIndex = rootStart; rootIndex < rootEnd; rootIndex++) {
                lines[rootIndex - rootStart] = readLine(rootIndex);
            }
            return lines;
        }
        case GEOMETRY_TYPE.MULTIPOLYGON:
            return readPolygonRings(rootStart, rootEnd);
        default:
            throw new Error(
                `The specified geometry type (${geometryVector.geometryType(targetIndex)}) is currently not supported.`,
            );
    }
}

function decodeDictionaryEncodedVertices(
    vertexBufferType: VertexBufferType,
    vertexBuffer: Int32Array | Uint32Array,
    vertexOffsets: Uint32Array,
    vertexOffset: number,
    numVertices: number,
    isRing: boolean,
    mortonSettings: MortonSettings,
): Point[] {
    if (vertexBufferType === VertexBufferType.MORTON) {
        return decodeMortonDictionaryEncodedVertices(
            vertexBuffer,
            vertexOffsets,
            vertexOffset,
            numVertices,
            isRing,
            mortonSettings,
        );
    } else {
        return decodeVec2DictionaryEncodedVertices(vertexBuffer, vertexOffsets, vertexOffset, numVertices, isRing);
    }
}

function getLineStringOrRing(
    vertexBuffer: Int32Array | Uint32Array,
    startIndex: number,
    numVertices: number,
    isRing: boolean,
): Point[] {
    const vertices: Point[] = new Array(isRing ? numVertices + 1 : numVertices);
    for (let i = 0; i < numVertices * 2; i += 2) {
        const x = vertexBuffer[startIndex + i];
        const y = vertexBuffer[startIndex + i + 1];
        vertices[i / 2] = new Point(x, y);
    }

    if (isRing) {
        vertices[vertices.length - 1] = new Point(vertices[0].x, vertices[0].y);
    }
    return vertices;
}

function decodeVec2DictionaryEncodedVertices(
    vertexBuffer: Int32Array | Uint32Array,
    vertexOffsets: Uint32Array,
    vertexOffset: number,
    numVertices: number,
    isRing: boolean,
): Point[] {
    const vertices: Point[] = new Array(isRing ? numVertices + 1 : numVertices);
    for (let i = 0; i < numVertices * 2; i += 2) {
        const offset = vertexOffsets[vertexOffset + i / 2] * 2;
        const x = vertexBuffer[offset];
        const y = vertexBuffer[offset + 1];
        vertices[i / 2] = new Point(x, y);
    }

    if (isRing) {
        vertices[vertices.length - 1] = new Point(vertices[0].x, vertices[0].y);
    }
    return vertices;
}

function decodeMortonDictionaryEncodedVertices(
    vertexBuffer: Int32Array | Uint32Array,
    vertexOffsets: Uint32Array,
    vertexOffset: number,
    numVertices: number,
    isRing: boolean,
    mortonSettings: MortonSettings,
): Point[] {
    const vertices: Point[] = new Array(isRing ? numVertices + 1 : numVertices);
    for (let i = 0; i < numVertices; i++) {
        const offset = vertexOffsets[vertexOffset + i];
        const mortonEncodedVertex = vertexBuffer[offset];
        const vertex = decodeZOrderCurve(mortonEncodedVertex, mortonSettings.numBits, mortonSettings.coordinateShift);
        vertices[i] = new Point(vertex.x, vertex.y);
    }
    if (isRing) {
        vertices[vertices.length - 1] = new Point(vertices[0].x, vertices[0].y);
    }

    return vertices;
}
