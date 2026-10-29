import { describe, expect, it } from "vitest";
import { decodeIdColumn } from "./idColumnDecoder";
import IntWrapper from "./intWrapper";
import { createRleMetadata, createStreamMetadata } from "./decodingTestUtils";
import { encodeVarintInt64 } from "../encoding/integerEncodingUtils";
import { LogicalLevelTechnique } from "../metadata/tile/logicalLevelTechnique";
import { ColumnScope, type Column } from "../metadata/tileset/tilesetMetadata";
import { Int64FlatVector } from "../vector/flat/int64FlatVector";
import { Int64SequenceVector } from "../vector/sequence/int64SequenceVector";

const LONG_ID_COLUMN: Column = {
    name: "id",
    nullable: false,
    columnScope: ColumnScope.FEATURE,
    type: "scalarType",
    scalarType: { longID: true },
};

/**
 * `idWithinMaxSafeInteger: false` for a 64-bit id column is the one path mltDecoder.spec.ts never
 * exercises (every fixture there decodes with the default `true`), so it's covered directly here
 * instead - each case pins one VectorType branch of decodeIdColumn's 64-bit switch.
 */
describe("decodeIdColumn - 64-bit ids, idWithinMaxSafeInteger: false", () => {
    it("decodes a FLAT stream as Int64FlatVector instead of DoubleFlatVector", () => {
        const metadata = createStreamMetadata(LogicalLevelTechnique.NONE, LogicalLevelTechnique.NONE, 2);
        const tile = encodeVarintInt64(BigUint64Array.from([100n, 200n]));

        const vector = decodeIdColumn(tile, LONG_ID_COLUMN, new IntWrapper(0), "id", metadata, 2, false);

        expect(vector).toBeInstanceOf(Int64FlatVector);
        expect(vector.getValue(0)).toBe(100n);
        expect(vector.getValue(1)).toBe(200n);
    });

    it("decodes a single-run RLE stream as Int64SequenceVector", () => {
        const metadata = createRleMetadata(LogicalLevelTechnique.DELTA, LogicalLevelTechnique.RLE, 1, 3);
        // decodeZigZagSequenceRleInt64 reads only the second raw value for a single run; zigzag(5n) = 10n.
        const tile = encodeVarintInt64(BigUint64Array.from([0n, 10n]));

        const vector = decodeIdColumn(tile, LONG_ID_COLUMN, new IntWrapper(0), "id", metadata, 3, false);

        expect(vector).toBeInstanceOf(Int64SequenceVector);
        expect(vector.getValue(0)).toBe(5n);
        expect(vector.getValue(1)).toBe(10n);
        expect(vector.getValue(2)).toBe(15n);
    });
});
