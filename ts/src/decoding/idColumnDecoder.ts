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
 * Decodes the ID column's data stream starting at `offset`.
 * Called from FeatureTable on the first `idVector` access.
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
                const ids = decodeUnsignedInt32Stream(tile, offset, idDataStreamMetadata, undefined, nullabilityBuffer);
                return new Int32FlatVector(columnName, ids, sizeOrNullabilityBuffer);
            }
            case VectorType.SEQUENCE: {
                const [baseValue, delta] = decodeSequenceInt32Stream(tile, offset, idDataStreamMetadata);
                return new Int32SequenceVector(
                    columnName,
                    baseValue,
                    delta,
                    (idDataStreamMetadata as RleEncodedStreamMetadata).numRleValues,
                    false,
                );
            }
            case VectorType.CONST: {
                const constValue = decodeUnsignedConstInt32Stream(tile, offset, idDataStreamMetadata);
                return new Int32ConstVector(columnName, constValue, sizeOrNullabilityBuffer, false);
            }
        }
    }

    switch (vectorType) {
        case VectorType.FLAT: {
            if (idWithinMaxSafeInteger) {
                const ids = decodeUnsignedInt64AsFloat64Stream(tile, offset, idDataStreamMetadata, nullabilityBuffer);
                return new DoubleFlatVector(columnName, ids, sizeOrNullabilityBuffer);
            }
            const ids = decodeUnsignedInt64Stream(tile, offset, idDataStreamMetadata, nullabilityBuffer);
            return new Int64FlatVector(columnName, ids, sizeOrNullabilityBuffer);
        }
        case VectorType.SEQUENCE: {
            const [baseValue, delta] = decodeSequenceInt64Stream(tile, offset, idDataStreamMetadata);
            return new Int64SequenceVector(
                columnName,
                baseValue,
                delta,
                (idDataStreamMetadata as RleEncodedStreamMetadata).numRleValues,
                false,
            );
        }
        case VectorType.CONST: {
            const constValue = decodeUnsignedConstInt64Stream(tile, offset, idDataStreamMetadata);
            return new Int64ConstVector(columnName, constValue, sizeOrNullabilityBuffer, false);
        }
    }

    throw new Error("Vector type not supported for id column.");
}
