import FeatureTable, { LazyGeometryColumn, LazyIdColumn } from "./vector/featureTable";
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
import { LazyPropertyVectors, type LazyPropertyColumn } from "./vector/lazyPropertyVectors";
import { readVarint } from "./decoding/integerDecodingUtils";

/** Walks `numStreams` stream headers and jumps over their payloads without decoding them. */
function skipStreams(tile: Uint8Array, offset: IntWrapper, numStreams: number): void {
    for (let i = 0; i < numStreams; i++) {
        const streamMetadata = decodeStreamMetadata(tile, offset);
        offset.set(offset.get() + streamMetadata.byteLength);
    }
}

/** Skips a struct column: the shared streams up to the dictionary data stream, then the streams of each child. */
function skipStructColumn(tile: Uint8Array, offset: IntWrapper, columnMetadata: Column, blockEnd: number): void {
    let hasSeenDictionaryStream = false;
    while (!hasSeenDictionaryStream) {
        // The dictionary stream must lie inside the block, otherwise a malformed tile never terminates
        if (offset.get() >= blockEnd) {
            throw new Error(
                `No dictionary stream found for struct column "${columnMetadata.name}" before block end ${blockEnd}`,
            );
        }
        const streamMetadata = decodeStreamMetadata(tile, offset);
        if (streamMetadata.physicalStreamType === PhysicalStreamType.DATA) {
            const dictionaryType = streamMetadata.logicalStreamType.dictionaryType;
            if (dictionaryType === DictionaryType.SINGLE || dictionaryType === DictionaryType.SHARED) {
                hasSeenDictionaryStream = true;
            }
        }
        offset.set(offset.get() + streamMetadata.byteLength);
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
 * Whether a column is kept by a `propertyColumnNames` projection.
 * Struct children are compared by their full name, a prefix test would keep `name` for `names`.
 */
function isColumnRequested(columnMetadata: Column, propertyColumnNames: ReadonlySet<string>): boolean {
    if (propertyColumnNames.has(columnMetadata.name)) {
        return true;
    }
    if (columnMetadata.type !== "complexType") {
        return false;
    }
    for (const child of columnMetadata.complexType.children) {
        if (propertyColumnNames.has(child.name ? `${columnMetadata.name}${child.name}` : columnMetadata.name)) {
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

/** Where one block of a tile starts and ends, and what kind of block it is. */
interface BlockPrefix {
    /** Offset of the block's length varint, so a slice from here is a tile of its own. */
    prefixStart: number;
    /** Offset right after the length varint, where the counted block content begins. */
    contentStart: number;
    /** Offset one past the block's content, where the next block's length varint begins. */
    blockEnd: number;
    /** `1` is a feature table, `2` a feature table with nested properties. */
    tag: number;
}

/** Whether a block tag marks a feature table, any other block is skipped. */
function isFeatureTableTag(tag: number): boolean {
    return tag === 1 || tag === 2;
}

/**
 * Reads one block's length varint and tag, and checks that the block ends inside the tile.
 *
 * `decodeTile` and `scanLayerBlocks` both read this prefix and then diverge: the first decodes the
 * block's metadata and column headers, the second reads only the layer name.
 */
function readBlockPrefix(tile: Uint8Array, offset: IntWrapper): BlockPrefix {
    const prefixStart = offset.get();
    const blockLength = readVarint(tile, offset);
    const contentStart = offset.get();
    const blockEnd = contentStart + blockLength;
    if (blockEnd > tile.length) {
        throw new Error(`Block overruns tile: ${blockEnd} > ${tile.length}`);
    }
    const tag = readVarint(tile, offset);
    return { prefixStart, contentStart, blockEnd, tag };
}

/** One layer block of a tile, located by {@link scanLayerBlocks} but not decoded. */
export interface LayerBlock {
    /** The layer name, the first field of the block's embedded metadata. */
    name: string;
    /** The block including its length varint, so `decodeTile` reads it as a tile with one layer. */
    bytes: Uint8Array;
}

const textDecoder = new TextDecoder();

/**
 * Locates the layer blocks of a tile and reads each layer name, without decoding any column.
 *
 * Only the length varint, the tag and the name are read per block. `decodeTile` reads the same
 * name but then always decodes the full column list after it, so listing the layers of a tile is
 * proportional to the number of layers here, and to the number of columns there.
 */
export function scanLayerBlocks(tile: Uint8Array): LayerBlock[] {
    const layerBlocks: LayerBlock[] = [];
    const offset = new IntWrapper(0);

    while (offset.get() < tile.length) {
        const { prefixStart, blockEnd, tag } = readBlockPrefix(tile, offset);
        if (isFeatureTableTag(tag)) {
            const nameByteLength = readVarint(tile, offset);
            const nameStart = offset.get();
            const name = textDecoder.decode(tile.subarray(nameStart, nameStart + nameByteLength));
            layerBlocks.push({ name, bytes: tile.subarray(prefixStart, blockEnd) });
        }
        offset.set(blockEnd);
    }

    return layerBlocks;
}

/** Copies the scaling values, since the caller may mutate `geometryScaling` before the geometry is decoded. */
function snapshotGeometryScaling(geometryScaling: GeometryScaling | undefined): GeometryScaling | undefined {
    if (!geometryScaling) {
        return undefined;
    }
    const { extent, min, max, scale } = geometryScaling;
    return { extent, min, max, scale };
}

/**
 * Decodes the ID column's PRESENT stream to resolve the feature count, and records where the DATA
 * stream lies without decoding it.
 */
function parseIdColumn(
    tile: Uint8Array,
    offset: IntWrapper,
    columnMetadata: Column,
    columnBuffer: Uint8Array,
    columnBaseOffset: number,
    idWithinMaxSafeInteger: boolean,
): { lazyIdColumn: LazyIdColumn; numFeatures: number } {
    let nullabilityBuffer: BitVector | null = null;
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
    const numFeatures = nullabilityBuffer ? nullabilityBuffer.size() : idDataStreamMetadata.decompressedCount;

    const idStart = offset.get();
    offset.set(idStart + idDataStreamMetadata.byteLength);
    const lazyIdColumn = new LazyIdColumn(
        columnBuffer,
        idStart - columnBaseOffset,
        columnMetadata,
        columnMetadata.name,
        idDataStreamMetadata,
        nullabilityBuffer ?? numFeatures,
        idWithinMaxSafeInteger,
    );
    return { lazyIdColumn, numFeatures };
}

export interface DecodeTileOptions {
    /** Copies each block's bytes so the feature tables do not reference the caller's buffer. */
    copyBuffer?: boolean;

    /** Names of the property columns to keep, the others are skipped. */
    propertyColumnNames?: ReadonlySet<string>;

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
    const propertyColumnNames = options?.propertyColumnNames;
    const includeGeometry = options?.includeGeometry !== false;
    const copyBuffer = options?.copyBuffer === true;

    while (offset.get() < tileLength) {
        const { contentStart: blockStart, blockEnd, tag } = readBlockPrefix(tile, offset);
        if (!isFeatureTableTag(tag)) {
            offset.set(blockEnd);
            continue;
        }

        const [metadata, extent] = decodeEmbeddedTileSetMetadata(tile, offset);
        const featureTableMetadata = metadata.featureTables[0];

        // Depends only on the tile extent
        if (geometryScaling) {
            geometryScaling.scale = geometryScaling.extent / extent;
        }
        const scalingSnapshot = snapshotGeometryScaling(geometryScaling);

        // Lazy columns point into this buffer, with `copyBuffer` it is a copy of the block
        const columnBuffer = copyBuffer ? tile.slice(blockStart, blockEnd) : tile;
        const columnBaseOffset = copyBuffer ? blockStart : 0;

        let lazyIdColumn: LazyIdColumn | null = null;
        let lazyGeometryColumn: LazyGeometryColumn | null = null;
        const lazyPropertyColumns: LazyPropertyColumn[] = [];
        let numFeatures = 0;

        for (const columnMetadata of featureTableMetadata.columns) {
            if (isLogicalIdColumn(columnMetadata)) {
                ({ lazyIdColumn, numFeatures } = parseIdColumn(
                    tile,
                    offset,
                    columnMetadata,
                    columnBuffer,
                    columnBaseOffset,
                    idWithinMaxSafeInteger,
                ));
            } else if (isGeometryColumn(columnMetadata)) {
                const numStreams = readVarint(tile, offset);
                const columnStart = offset.get();

                numFeatures = skipGeometryColumn(tile, offset, numStreams, numFeatures);
                if (includeGeometry) {
                    lazyGeometryColumn = new LazyGeometryColumn(
                        columnBuffer,
                        columnStart - columnBaseOffset,
                        numStreams,
                        numFeatures,
                        scalingSnapshot,
                    );
                }
            } else {
                const numStreams = hasStreamCount(columnMetadata) ? readVarint(tile, offset) : 1;
                if (numStreams === 0) {
                    continue;
                }

                // Record the column position and skip it, an unrequested column is only skipped
                const columnStart = offset.get();
                skipPropertyColumn(tile, offset, columnMetadata, numStreams, blockEnd);
                if (propertyColumnNames === undefined || isColumnRequested(columnMetadata, propertyColumnNames)) {
                    lazyPropertyColumns.push({
                        name: columnMetadata.name,
                        metadata: columnMetadata,
                        numStreams,
                        start: columnStart - columnBaseOffset,
                        vectors: null,
                    });
                }
            }
        }

        // A wrong skip only surfaces on a later decode, so validate the walk here
        if (offset.get() > blockEnd) {
            throw new Error(`Column walk overran block: ${offset.get()} > ${blockEnd}`);
        }

        const propertyVectors = new LazyPropertyVectors(
            columnBuffer,
            lazyPropertyColumns,
            numFeatures,
            propertyColumnNames,
        );

        featureTables.push(
            new FeatureTable(
                featureTableMetadata.name,
                lazyGeometryColumn,
                lazyIdColumn ?? undefined,
                propertyVectors,
                extent,
                numFeatures,
            ),
        );
        offset.set(blockEnd);
    }

    return featureTables;
}
