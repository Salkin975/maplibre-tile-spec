import FeatureTable, { PendingGeometryColumn, PendingIdColumn } from "./vector/featureTable";
import { ComplexType, type Column } from "./metadata/tileset/tilesetMetadata";
import IntWrapper from "./decoding/intWrapper";
import { decodeStreamMetadata } from "./metadata/tile/streamMetadataDecoder";
import BitVector from "./vector/flat/bitVector";
import { decodeMapPropertyColumn } from "./decoding/mapPropertyDecoder";
import type GeometryScaling from "./decoding/geometryScaling";
import { decodeBooleanRle } from "./decoding/decodingUtils";
import { decodeEmbeddedTileSetMetadata } from "./metadata/tileset/embeddedTilesetMetadataDecoder";
import { hasStreamCount, isGeometryColumn, isLogicalIdColumn } from "./metadata/tileset/typeMap";
import { PhysicalStreamType } from "./metadata/tile/physicalStreamType";
import { DictionaryType } from "./metadata/tile/dictionaryType";
import { LazyPropertyVectors, type PendingPropertyColumn } from "./vector/lazyPropertyVectors";
import { readVarint } from "./decoding/integerDecodingUtils";

/** Walks `numStreams` stream headers and jumps over their payloads without decoding them. */
function skipStreams(tile: Uint8Array, offset: IntWrapper, numStreams: number): void {
    for (let i = 0; i < numStreams; i++) {
        const meta = decodeStreamMetadata(tile, offset);
        offset.set(offset.get() + meta.byteLength);
    }
}

/** Skips a struct column: the shared streams up to the dictionary data stream, then the streams of each child. */
function skipStructColumn(tile: Uint8Array, offset: IntWrapper, columnMetadata: Column, blockEnd: number): void {
    let dictionaryStreamSeen = false;
    while (!dictionaryStreamSeen) {
        // The dictionary stream must lie inside the block, otherwise a malformed tile never terminates
        if (offset.get() >= blockEnd) {
            throw new Error(
                `No dictionary stream found for struct column "${columnMetadata.name}" before block end ${blockEnd}`,
            );
        }
        const meta = decodeStreamMetadata(tile, offset);
        if (meta.physicalStreamType === PhysicalStreamType.DATA) {
            const dictionaryType = meta.logicalStreamType.dictionaryType;
            if (dictionaryType === DictionaryType.SINGLE || dictionaryType === DictionaryType.SHARED) {
                dictionaryStreamSeen = true;
            }
        }
        offset.set(offset.get() + meta.byteLength);
    }

    if (columnMetadata.type !== "complexType") {
        return;
    }
    const numChildren = columnMetadata.complexType.children.length;
    for (let i = 0; i < numChildren; i++) {
        const childNumStreams = readVarint(tile, offset);
        if (childNumStreams === 0) {
            continue;
        }
        skipStreams(tile, offset, childNumStreams);
    }
}

/** Skips one property column according to its column type. */
function skipPropertyColumn(
    tile: Uint8Array,
    offset: IntWrapper,
    columnMetadata: Column,
    numStreams: number,
    blockEnd: number,
): void {
    if (columnMetadata.type === "complexType") {
        if (columnMetadata.complexType.physicalType === ComplexType.MAP) {
            // MAP columns have no fixed terminator, so walk them with decodeMapPropertyColumn
            decodeMapPropertyColumn(tile, offset, columnMetadata, numStreams);
            return;
        }
        skipStructColumn(tile, offset, columnMetadata, blockEnd);
        return;
    }

    if (!hasStreamCount(columnMetadata)) {
        // Fixed-width scalars have no stream count, a nullable one has a PRESENT and a DATA stream
        skipStreams(tile, offset, columnMetadata.nullable ? 2 : 1);
        return;
    }

    skipStreams(tile, offset, numStreams);
}

/**
 * Whether a column is kept by a `propertyColumns` projection.
 * Struct children are compared by their full name, a prefix test would keep `name` for `names`.
 */
function isColumnRequested(columnMetadata: Column, propertyFilter: ReadonlySet<string>): boolean {
    if (propertyFilter.has(columnMetadata.name)) {
        return true;
    }
    if (columnMetadata.type !== "complexType") {
        return false;
    }
    for (const child of columnMetadata.complexType.children) {
        if (propertyFilter.has(child.name ? `${columnMetadata.name}${child.name}` : columnMetadata.name)) {
            return true;
        }
    }
    return false;
}

/** Skips the geometry streams and returns the feature count, reading the type stream if it is not known yet. */
function skipGeometryColumn(
    tile: Uint8Array,
    offset: IntWrapper,
    numStreams: number,
    knownNumFeatures: number,
): number {
    const geometryTypeMetadata = decodeStreamMetadata(tile, offset);
    const numFeatures = knownNumFeatures || geometryTypeMetadata.decompressedCount;
    offset.set(offset.get() + geometryTypeMetadata.byteLength);
    skipStreams(tile, offset, numStreams - 1);
    return numFeatures;
}

export interface DecodeTileOptions {
    /** Copies each block's bytes so the feature tables do not reference the caller's buffer. */
    copyBuffer?: boolean;

    /** Names of the property columns to keep, the others are skipped. */
    propertyColumns?: ReadonlySet<string>;

    /** Set to false to skip geometry decoding, the feature count is still resolved. */
    includeGeometry?: boolean;
}

/**
 * Decodes a tile with embedded metadata (Tag 0x01 format).
 * This is the primary decoder function for MLT tiles.
 *
 * Column headers are scanned to find where everything lives, ID, geometry and property
 * columns are decoded on first access.
 *
 * @param tile The tile data to decode (will be decompressed if gzip-compressed)
 * @param geometryScaling Optional geometry scaling parameters
 * @param idWithinMaxSafeInteger If true, limits ID values to JavaScript safe integer range (53 bits)
 * @param options Optional laziness and column filtering - see DecodeTileOptions
 */
export default function decodeTile(
    tile: Uint8Array,
    geometryScaling?: GeometryScaling,
    idWithinMaxSafeInteger = true,
    options?: DecodeTileOptions,
): FeatureTable[] {
    const offset = new IntWrapper(0);
    const featureTables: FeatureTable[] = [];

    const tileLength = tile.length;
    const propertyFilter = options?.propertyColumns;
    const includeGeometry = options?.includeGeometry !== false;
    const copyBuffer = options?.copyBuffer === true;

    while (offset.get() < tileLength) {
        const blockLength = readVarint(tile, offset);
        const blockStart = offset.get();
        const blockEnd = blockStart + blockLength;
        if (blockEnd > tileLength) {
            throw new Error(`Block overruns tile: ${blockEnd} > ${tileLength}`);
        }

        const tag = readVarint(tile, offset);
        if (tag !== 1 && tag !== 2) {
            // 1 = feature table, 2 = feature table with nested properties; else skip.
            offset.set(blockEnd);
            continue;
        }

        const [metadata, extent] = decodeEmbeddedTileSetMetadata(tile, offset);
        const featureTableMetadata = metadata.featureTables[0];

        // Depends only on the tile extent
        if (geometryScaling) {
            geometryScaling.scale = geometryScaling.extent / extent;
        }
        // Snapshot, since the caller may mutate geometryScaling before the geometry is decoded
        const scalingSnapshot = geometryScaling
            ? {
                  extent: geometryScaling.extent,
                  min: geometryScaling.min,
                  max: geometryScaling.max,
                  scale: geometryScaling.scale,
              }
            : undefined;

        // Pending records point into this buffer, with `copyBuffer` it is a copy of the block
        const pendingBuffer = copyBuffer ? tile.slice(blockStart, blockEnd) : tile;
        const pendingBase = copyBuffer ? blockStart : 0;

        let idVector: PendingIdColumn | null = null;
        let geometryVector: PendingGeometryColumn | null = null;
        const pendingColumns: PendingPropertyColumn[] = [];
        let numFeatures = 0;

        const columns = featureTableMetadata.columns;
        for (let c = 0, numColumns = columns.length; c < numColumns; c++) {
            const columnMetadata = columns[c];
            const columnName = columnMetadata.name;

            if (isLogicalIdColumn(columnMetadata)) {
                let nullabilityBuffer = null;
                // Check column metadata nullable flag, not numStreams (ID columns don't have stream count)
                if (columnMetadata.nullable) {
                    const presentStreamMetadata = decodeStreamMetadata(tile, offset);
                    const streamDataStart = offset.get();
                    const values = decodeBooleanRle(
                        tile,
                        presentStreamMetadata.numValues,
                        presentStreamMetadata.byteLength,
                        offset,
                    );
                    offset.set(streamDataStart + presentStreamMetadata.byteLength);
                    nullabilityBuffer = new BitVector(values, presentStreamMetadata.numValues);
                }

                const idDataStreamMetadata = decodeStreamMetadata(tile, offset);
                // decompressedCount is the count WITHOUT nulls, but we may have nulls
                numFeatures = nullabilityBuffer ? nullabilityBuffer.size() : idDataStreamMetadata.decompressedCount;

                // Record the DATA stream position and skip it, PRESENT is decoded to resolve numFeatures
                const idStart = offset.get();
                offset.set(idStart + idDataStreamMetadata.byteLength);
                idVector = new PendingIdColumn(
                    pendingBuffer,
                    idStart - pendingBase,
                    columnMetadata,
                    columnName,
                    idDataStreamMetadata,
                    nullabilityBuffer ?? numFeatures,
                    idWithinMaxSafeInteger,
                );
            } else if (isGeometryColumn(columnMetadata)) {
                const numStreams = readVarint(tile, offset);
                const columnStart = offset.get();

                numFeatures = skipGeometryColumn(tile, offset, numStreams, numFeatures);
                if (!includeGeometry) {
                    continue;
                }

                // Record the column position and skip it
                geometryVector = new PendingGeometryColumn(
                    pendingBuffer,
                    columnStart - pendingBase,
                    numStreams,
                    numFeatures,
                    scalingSnapshot,
                );
            } else {
                const numStreams = hasStreamCount(columnMetadata) ? readVarint(tile, offset) : 1;

                if (numStreams === 0) {
                    continue;
                }

                if (propertyFilter !== undefined && !isColumnRequested(columnMetadata, propertyFilter)) {
                    skipPropertyColumn(tile, offset, columnMetadata, numStreams, blockEnd);
                    continue;
                }

                // Record the column position and skip it
                const columnStart = offset.get();
                skipPropertyColumn(tile, offset, columnMetadata, numStreams, blockEnd);
                pendingColumns.push({
                    name: columnName,
                    metadata: columnMetadata,
                    numStreams,
                    start: columnStart - pendingBase,
                    vectors: null,
                });
            }
        }

        // A wrong skip only surfaces on a later decode, so validate the walk here
        if (offset.get() > blockEnd) {
            throw new Error(`Column walk overran block: ${offset.get()} > ${blockEnd}`);
        }

        const properties = new LazyPropertyVectors(pendingBuffer, pendingColumns, numFeatures, propertyFilter);

        featureTables.push(
            new FeatureTable(
                featureTableMetadata.name,
                geometryVector,
                idVector ?? undefined,
                properties,
                extent,
                numFeatures,
            ),
        );
        offset.set(blockEnd);
    }

    return featureTables;
}
