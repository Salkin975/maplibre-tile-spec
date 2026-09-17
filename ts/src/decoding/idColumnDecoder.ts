import type { Column } from "../metadata/tileset/tilesetMetadata";
import type { StreamMetadata, RleEncodedStreamMetadata } from "../metadata/tile/streamMetadataDecoder";
import type IntWrapper from "./intWrapper";
import type BitVector from "../vector/flat/bitVector";
import type { IdVector } from "../vector/idVector";
import { VectorType } from "../vector/vectorType";
import { Int32FlatVector } from "../vector/flat/int32FlatVector";
import { Int64FlatVector } from "../vector/flat/int64FlatVector";
import { DoubleFlatVector } from "../vector/flat/doubleFlatVector";
import { Int32SequenceVector } from "../vector/sequence/int32SequenceVector";
import { Int64SequenceVector } from "../vector/sequence/int64SequenceVector";
import { Int32ConstVector } from "../vector/constant/int32ConstVector";
import { Int64ConstVector } from "../vector/constant/int64ConstVector";
import {
    decodeUnsignedConstInt32Stream,
    decodeUnsignedConstInt64Stream,
    decodeUnsignedInt64AsFloat64Stream,
    decodeUnsignedInt32Stream,
    decodeUnsignedInt64Stream,
    decodeSequenceInt32Stream,
    decodeSequenceInt64Stream,
    getVectorType,
} from "./integerStreamDecoder";

/**
 * Decodes the ID column's data stream. Called both eagerly (from decodeTile) and lazily
 * (from FeatureTable, on first `idVector` access) - it decodes fully from wherever `offset`
 * currently points, so a lazy caller passes a fresh `IntWrapper` positioned at the recorded
 * start offset rather than the tile-walk's shared cursor.
 */
export function decodeIdColumn(
    tile: Uint8Array,
    columnMetadata: Column,
    offset: IntWrapper,
    columnName: string,
    idDataStreamMetadata: StreamMetadata,
    sizeOrNullabilityBuffer: number | BitVector,
    idWithinMaxSafeInteger: boolean,
): IdVector {
    const isLongId = columnMetadata.scalarType?.longID === true;
    const nullabilityBuffer = typeof sizeOrNullabilityBuffer === "number" ? undefined : sizeOrNullabilityBuffer;

    const vectorType = getVectorType(
        idDataStreamMetadata,
        sizeOrNullabilityBuffer,
        tile,
        offset,
        isLongId ? "int64" : "int32",
    );

    if (!isLongId) {
        switch (vectorType) {
            case VectorType.FLAT: {
                const id = decodeUnsignedInt32Stream(tile, offset, idDataStreamMetadata, undefined, nullabilityBuffer);
                return new Int32FlatVector(columnName, id, sizeOrNullabilityBuffer);
            }
            case VectorType.SEQUENCE: {
                const id = decodeSequenceInt32Stream(tile, offset, idDataStreamMetadata);
                return new Int32SequenceVector(
                    columnName,
                    id[0],
                    id[1],
                    (idDataStreamMetadata as RleEncodedStreamMetadata).numRleValues,
                    false,
                );
            }
            case VectorType.CONST: {
                const id = decodeUnsignedConstInt32Stream(tile, offset, idDataStreamMetadata);
                return new Int32ConstVector(columnName, id, sizeOrNullabilityBuffer, false);
            }
        }
    }

    switch (vectorType) {
        case VectorType.FLAT: {
            if (idWithinMaxSafeInteger) {
                const id = decodeUnsignedInt64AsFloat64Stream(tile, offset, idDataStreamMetadata, nullabilityBuffer);
                return new DoubleFlatVector(columnName, id, sizeOrNullabilityBuffer);
            }
            const id = decodeUnsignedInt64Stream(tile, offset, idDataStreamMetadata, nullabilityBuffer);
            return new Int64FlatVector(columnName, id, sizeOrNullabilityBuffer);
        }
        case VectorType.SEQUENCE: {
            const id = decodeSequenceInt64Stream(tile, offset, idDataStreamMetadata);
            return new Int64SequenceVector(
                columnName,
                id[0],
                id[1],
                (idDataStreamMetadata as RleEncodedStreamMetadata).numRleValues,
                false,
            );
        }
        case VectorType.CONST: {
            const id = decodeUnsignedConstInt64Stream(tile, offset, idDataStreamMetadata);
            return new Int64ConstVector(columnName, id, sizeOrNullabilityBuffer, false);
        }
    }

    throw new Error("Vector type not supported for id column.");
}
