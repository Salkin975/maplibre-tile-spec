import FeatureTable, { PendingGeometryColumn, PendingIdColumn } from "./vector/featureTable";
import { ComplexType, type Column } from "./metadata/tileset/tilesetMetadata";
import IntWrapper from "./decoding/intWrapper";
import { decodeStreamMetadata } from "./metadata/tile/streamMetadataDecoder";
import BitVector from "./vector/flat/bitVector";
import { decodeGeometryColumn } from "./decoding/geometryDecoder";
import { decodePropertyColumn } from "./decoding/propertyDecoder";
import { decodeMapPropertyColumn } from "./decoding/mapPropertyDecoder";
import { decodeIdColumn } from "./decoding/idColumnDecoder";
import type GeometryScaling from "./decoding/geometryScaling";
import { decodeBooleanRle } from "./decoding/decodingUtils";
import { decodeEmbeddedTileSetMetadata } from "./metadata/tileset/embeddedTilesetMetadataDecoder";
import { hasStreamCount, isGeometryColumn, isLogicalIdColumn } from "./metadata/tileset/typeMap";
import { PhysicalStreamType } from "./metadata/tile/physicalStreamType";
import { DictionaryType } from "./metadata/tile/dictionaryType";
import type { GeometryVector } from "./vector/geometry/geometryVector";
import type Vector from "./vector/vector";
import type { GpuVector } from "./vector/geometry/gpuVector";
import type { IdVector } from "./vector/idVector";
import { LazyPropertyVectors, type PendingPropertyColumn } from "./vector/lazyPropertyVectors";

const MLT_TAG_FEATURE_TABLE = 1;
/** Written by test/encoding tooling that exercises nested (MAP) property columns; decodes identically. */
const MLT_TAG_FEATURE_TABLE_NESTED_PROPERTIES = 2;

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Reads one unsigned LEB128 varint (up to 5 bytes) and returns it as a number,
 * without allocating an array for the result.
 *
 * `decodeVarintInt32(tile, offset, 1)[0]` allocated a throwaway array for every scalar
 * read: twice per block (length, tag) plus once per column (stream count).
 */
function readVarintU32(buf: Uint8Array, offset: IntWrapper): number {
    let pos = offset.get();
    let b = buf[pos++];
    let value = b & 0x7f;
    if ((b & 0x80) !== 0) {
        b = buf[pos++];
        value |= (b & 0x7f) << 7;
        if ((b & 0x80) !== 0) {
            b = buf[pos++];
            value |= (b & 0x7f) << 14;
            if ((b & 0x80) !== 0) {
                b = buf[pos++];
                value |= (b & 0x7f) << 21;
                if ((b & 0x80) !== 0) {
                    b = buf[pos++];
                    // Bits 28..31: multiply rather than `<< 28` so the result does not
                    // go negative through int32 coercion.
                    value += (b & 0x0f) * 0x10000000;
                }
            }
        }
    }
    offset.set(pos);
    return value >>> 0;
}

/** Walks `numStreams` stream headers and jumps over their payloads without decoding them. */
function skipStreams(tile: Uint8Array, offset: IntWrapper, numStreams: number): void {
    for (let i = 0; i < numStreams; i++) {
        const meta = decodeStreamMetadata(tile, offset);
        offset.set(offset.get() + meta.byteLength);
    }
}

/**
 * Skips a STRUCT column (shared dictionary + per-child offset streams) without decoding it.
 *
 * A struct column's total stream count is NOT `numStreams` flat streams the way a scalar
 * column's is - `numStreams` only signals presence for this branch (see decodePropertyColumn
 * in propertyDecoder.ts, which ignores it beyond the zero-check). The real layout, mirrored
 * from decodeSharedDictionary in stringDecoder.ts, is: a run of shared streams (dictionary
 * length, optional FSST symbol length/table, then the dictionary data stream that ends the
 * run) followed by, per child field, that child's own stream-count varint and its own
 * present/offset streams. `skipStreams` alone under-consumes this and misaligns every column
 * that follows.
 */
function skipStructColumn(tile: Uint8Array, offset: IntWrapper, columnMetadata: Column, blockEnd: number): void {
    let dictionaryStreamSeen = false;
    while (!dictionaryStreamSeen) {
        // Bounded by the enclosing block: the terminating dictionary stream must lie inside it.
        // Without this, a malformed tile makes the scan run past the buffer forever, because
        // out-of-bounds reads decode to PhysicalStreamType.PRESENT and never match.
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
        const childNumStreams = readVarintU32(tile, offset);
        if (childNumStreams === 0) {
            continue;
        }
        skipStreams(tile, offset, childNumStreams);
    }
}

/** Skips one property column's payload, dispatching to the layout its column type actually has. */
function skipPropertyColumn(
    tile: Uint8Array,
    offset: IntWrapper,
    columnMetadata: Column,
    numStreams: number,
    blockEnd: number,
): void {
    if (columnMetadata.type === "complexType") {
        if (columnMetadata.complexType.physicalType === ComplexType.MAP) {
            // A MAP column's stream layout (dictionary mask byte, then a data-dependent mix of
            // dictionary/presence/value streams - see decodeMapStreams) has no fixed terminator
            // to scan for the way a STRUCT's shared dictionary does, so skipping it correctly
            // means walking the same layout decodeMapPropertyColumn does. This runs on every
            // MAP column the lazy column walk passes over on the way to a later one, not only
            // ones a `propertyColumns` projection excludes, so decoding and discarding the
            // result here (instead of a dedicated skip) costs a real allocation per column.
            decodeMapPropertyColumn(tile, offset, columnMetadata, numStreams);
            return;
        }
        skipStructColumn(tile, offset, columnMetadata, blockEnd);
        return;
    }

    if (!hasStreamCount(columnMetadata)) {
        // Fixed-shape scalar types (bool/int/float/double) have no stream-count field on the
        // wire, so the caller always passes numStreams=1 as a placeholder - it does not say how
        // many physical streams are actually there. A nullable column carries two: PRESENT then
        // DATA. See decodeScalarPropertyColumn in propertyDecoder.ts, which drives this off
        // columnMetadata.nullable rather than numStreams for exactly this reason.
        skipStreams(tile, offset, columnMetadata.nullable ? 2 : 1);
        return;
    }

    skipStreams(tile, offset, numStreams);
}

/**
 * Whether a column has to be decoded at all under a `propertyColumns` projection.
 *
 * A struct column is not addressed by its own name alone: its children are exposed as
 * `${column.name}${child.name}` (so `name` + `:de` -> `name:de`), and asking for one child has
 * to keep the parent. The check walks the declared children rather than comparing prefixes,
 * because a prefix test would let an unrelated column named `names` keep `name` alive.
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

/**
 * Jumps over a geometry column's `numStreams` streams (the type stream plus `numStreams - 1`
 * more, a flat sequence) without decoding any of them, returning the resolved feature count.
 * Used both when geometry is permanently excluded (`includeGeometry: false`) and when it is
 * merely deferred (lazy geometry) - in both cases the type stream still has to be read to learn
 * `numFeatures` if it isn't already known.
 */
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

/* -------------------------------------------------------------------------- */
/* Tile decoding                                                               */
/* -------------------------------------------------------------------------- */

export interface DecodeTileOptions {
    /**
     * Decode property columns eagerly, as the original implementation did.
     * Defaults to false - properties are decoded on first access.
     */
    eagerProperties?: boolean;

    /**
     * Copy each block's bytes so the returned feature tables no longer reference the
     * caller's buffer. Costs one allocation and one memcpy per feature table, and is
     * only needed when the tile buffer is pooled, reused, or transferred.
     * Ignored when `eagerProperties` is set.
     */
    copyBuffer?: boolean;

    /**
     * Allowlist of property column names to retain. Columns outside the set are skipped
     * outright and are not even recorded for lazy decoding.
     *
     * Caveat: a struct column with a shared dictionary (`name` with `name:en`, `name:de`
     * children) is filtered as a whole under its top-level name - the children share
     * streams and cannot be dropped individually.
     */
    propertyColumns?: ReadonlySet<string>;

    /**
     * Set to false to skip geometry decoding entirely (attribute-only passes: feature
     * indexes, queries, counts). The geometry type stream header is still read so the
     * feature count stays correct.
     */
    includeGeometry?: boolean;

    /**
     * Decode the geometry column eagerly, as the original implementation did.
     * Defaults to false - decoded on first `featureTable.geometryVector` access.
     * Ignored when `includeGeometry` is false.
     */
    eagerGeometry?: boolean;

    /**
     * Decode the ID column's data stream eagerly, as the original implementation did.
     * Defaults to false - decoded on first `featureTable.idVector` access. The PRESENT
     * (nullability) stream, when the column is nullable, is always decoded up front - it is
     * cheap and is how `numFeatures` gets resolved for a nullable ID column.
     */
    eagerId?: boolean;
}

/**
 * Decodes a tile with embedded metadata (Tag 0x01 format).
 * This is the primary decoder function for MLT tiles.
 *
 * Column headers are scanned to find where everything lives; ID, geometry, and property
 * columns are all decoded on first access by default (see the `eager*` options in
 * DecodeTileOptions to opt back into eager decoding). See LazyPropertyVectors for the buffer
 * lifetime requirement this implies - it applies equally to a deferred ID or geometry column.
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
    const lazyProperties = options?.eagerProperties !== true;
    const lazyGeometry = includeGeometry && options?.eagerGeometry !== true;
    const lazyId = options?.eagerId !== true;
    const copyBuffer = (lazyProperties || lazyGeometry || lazyId) && options?.copyBuffer === true;

    while (offset.get() < tileLength) {
        const blockLength = readVarintU32(tile, offset);
        const blockStart = offset.get();
        const blockEnd = blockStart + blockLength;
        if (blockEnd > tileLength) {
            throw new Error(`Block overruns tile: ${blockEnd} > ${tileLength}`);
        }

        const tag = readVarintU32(tile, offset);
        if (tag !== MLT_TAG_FEATURE_TABLE && tag !== MLT_TAG_FEATURE_TABLE_NESTED_PROPERTIES) {
            // Skip unknown block types
            offset.set(blockEnd);
            continue;
        }

        const [metadata, extent] = decodeEmbeddedTileSetMetadata(tile, offset);
        const featureTableMetadata = metadata.featureTables[0];

        // Depends only on the tile extent, so it is hoisted out of the column loop.
        if (geometryScaling) {
            geometryScaling.scale = geometryScaling.extent / extent;
        }
        // A snapshot, not a live reference: geometryScaling is caller-owned and may be mutated
        // again (e.g. for the next tile) before a deferred geometry decode ever reads it.
        const scalingSnapshot =
            geometryScaling && lazyGeometry
                ? {
                      extent: geometryScaling.extent,
                      min: geometryScaling.min,
                      max: geometryScaling.max,
                      scale: geometryScaling.scale,
                  }
                : undefined;

        let idVector: IdVector | PendingIdColumn | null = null;
        let geometryVector: GeometryVector | GpuVector | PendingGeometryColumn | null = null;
        const eagerVectors: Vector[] = [];
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
                const sizeOrNullabilityBuffer = nullabilityBuffer ?? numFeatures;

                if (lazyId) {
                    // Record where the DATA stream lives, then jump past it. Nothing is
                    // decoded until FeatureTable.idVector asks for it. The PRESENT stream
                    // above is always decoded eagerly - it's cheap and is how numFeatures
                    // got resolved just now for a nullable column.
                    const idStart = offset.get();
                    offset.set(idStart + idDataStreamMetadata.byteLength);
                    idVector = new PendingIdColumn(
                        tile,
                        idStart,
                        columnMetadata,
                        columnName,
                        idDataStreamMetadata,
                        sizeOrNullabilityBuffer,
                        idWithinMaxSafeInteger,
                    );
                } else {
                    idVector = decodeIdColumn(
                        tile,
                        columnMetadata,
                        offset,
                        columnName,
                        idDataStreamMetadata,
                        sizeOrNullabilityBuffer,
                        idWithinMaxSafeInteger,
                    );
                }
            } else if (isGeometryColumn(columnMetadata)) {
                const numStreams = readVarintU32(tile, offset);
                const columnStart = offset.get();

                if (!includeGeometry) {
                    numFeatures = skipGeometryColumn(tile, offset, numStreams, numFeatures);
                    continue;
                }

                if (lazyGeometry) {
                    // Record where the column lives, then jump past it. Nothing is decoded
                    // until FeatureTable.geometryVector asks for it.
                    numFeatures = skipGeometryColumn(tile, offset, numStreams, numFeatures);
                    geometryVector = new PendingGeometryColumn(
                        tile,
                        columnStart,
                        numStreams,
                        numFeatures,
                        scalingSnapshot,
                    );
                    continue;
                }

                // If no ID column, get numFeatures from geometry type stream metadata
                if (numFeatures === 0) {
                    const savedOffset = offset.get();
                    const geometryTypeMetadata = decodeStreamMetadata(tile, offset);
                    numFeatures = geometryTypeMetadata.decompressedCount;
                    offset.set(savedOffset); // Reset to re-read in decodeGeometryColumn
                }

                geometryVector = decodeGeometryColumn(tile, numStreams, offset, numFeatures, geometryScaling);
            } else {
                const numStreams = hasStreamCount(columnMetadata) ? readVarintU32(tile, offset) : 1;

                if (numStreams === 0) {
                    continue;
                }

                if (propertyFilter !== undefined && !isColumnRequested(columnMetadata, propertyFilter)) {
                    skipPropertyColumn(tile, offset, columnMetadata, numStreams, blockEnd);
                    continue;
                }

                if (lazyProperties) {
                    // Record where the column lives, then jump past it. Nothing is decoded
                    // until LazyPropertyVectors.get() asks for this name.
                    const columnStart = offset.get();
                    skipPropertyColumn(tile, offset, columnMetadata, numStreams, blockEnd);
                    pendingColumns.push({
                        name: columnName,
                        metadata: columnMetadata,
                        numStreams,
                        start: columnStart,
                        vectors: null,
                    });
                    continue;
                }

                const propertyVector = decodePropertyColumn(
                    tile,
                    offset,
                    columnMetadata,
                    numStreams,
                    numFeatures,
                    // Carried through so a struct column can drop the children that were not
                    // requested; the shared dictionary streams are decoded either way.
                    propertyFilter,
                );
                if (propertyVector) {
                    if (Array.isArray(propertyVector)) {
                        for (let p = 0, numProperties = propertyVector.length; p < numProperties; p++) {
                            eagerVectors.push(propertyVector[p]);
                        }
                    } else {
                        eagerVectors.push(propertyVector);
                    }
                }
            }
        }

        // With lazy decoding a bad skip surfaces late and far from its cause, so check that
        // the walk landed inside the block before handing out offsets to be used later.
        if (offset.get() > blockEnd) {
            throw new Error(`Column walk overran block: ${offset.get()} > ${blockEnd}`);
        }

        // Slice once per block and rebase every pending record onto it, rather than holding a
        // reference to the caller's (possibly pooled/reused) tile buffer.
        const blockBytes = copyBuffer ? tile.slice(blockStart, blockEnd) : undefined;

        let properties: Vector[] | LazyPropertyVectors;
        if (!lazyProperties) {
            properties = eagerVectors;
        } else if (blockBytes) {
            for (let i = 0; i < pendingColumns.length; i++) {
                pendingColumns[i].start -= blockStart;
            }
            properties = new LazyPropertyVectors(blockBytes, pendingColumns, numFeatures, propertyFilter);
        } else {
            properties = new LazyPropertyVectors(tile, pendingColumns, numFeatures, propertyFilter);
        }

        if (blockBytes) {
            if (idVector instanceof PendingIdColumn) {
                idVector = new PendingIdColumn(
                    blockBytes,
                    idVector.start - blockStart,
                    idVector.columnMetadata,
                    idVector.columnName,
                    idVector.idDataStreamMetadata,
                    idVector.sizeOrNullabilityBuffer,
                    idVector.idWithinMaxSafeInteger,
                );
            }
            if (geometryVector instanceof PendingGeometryColumn) {
                geometryVector = new PendingGeometryColumn(
                    blockBytes,
                    geometryVector.start - blockStart,
                    geometryVector.numStreams,
                    geometryVector.numFeatures,
                    geometryVector.scaling,
                );
            }
        }

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
