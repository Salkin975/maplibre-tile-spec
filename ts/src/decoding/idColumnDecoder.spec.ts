import { describe, expect, it } from "vitest";
import { decodeIdColumn } from "./idColumnDecoder";
import IntWrapper from "./intWrapper";
import { createRleMetadata, createStreamMetadata } from "./decodingTestUtils";
import { encodeVarintInt64 } from "../encoding/integerEncodingUtils";
import { LogicalLevelTechnique } from "../metadata/tile/logicalLevelTechnique";
import { ColumnScope, type Column } from "../metadata/tileset/tilesetMetadata";
import { DoubleFlatVector } from "../vector/flat/doubleFlatVector";
import { Int64FlatVector } from "../vector/flat/int64FlatVector";
import { Int64SequenceVector } from "../vector/sequence/int64SequenceVector";

const LONG_ID_COLUMN: Column = {
    name: "id",
    nullable: false,
    columnScope: ColumnScope.FEATURE,
    type: "scalarType",
    scalarType: { longID: true },
};

/** Covers `idWithinMaxSafeInteger: false`, one case per 64-bit VectorType branch of decodeIdColumn. */
describe("decodeIdColumn - 64-bit ids, idWithinMaxSafeInteger: false", () => {
    it("decodes a FLAT stream of safe integers as DoubleFlatVector", () => {
        const metadata = createStreamMetadata(LogicalLevelTechnique.NONE, LogicalLevelTechnique.NONE, 2);
        const tile = encodeVarintInt64(BigUint64Array.from([100n, BigInt(Number.MAX_SAFE_INTEGER)]));
        const offset = new IntWrapper(0);

        const vector = decodeIdColumn(tile, LONG_ID_COLUMN, offset, "id", metadata, 2, false);

        expect(vector).toBeInstanceOf(DoubleFlatVector);
        expect(vector.getValue(0)).toBe(100);
        expect(vector.getValue(1)).toBe(Number.MAX_SAFE_INTEGER);
        expect(offset.get()).toBe(tile.length);
    });

    it("decodes a FLAT stream with an id above the safe range as Int64FlatVector", () => {
        const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
        const metadata = createStreamMetadata(LogicalLevelTechnique.NONE, LogicalLevelTechnique.NONE, 2);
        const tile = encodeVarintInt64(BigUint64Array.from([100n, unsafe]));
        const offset = new IntWrapper(0);

        const vector = decodeIdColumn(tile, LONG_ID_COLUMN, offset, "id", metadata, 2, false);

        expect(vector).toBeInstanceOf(Int64FlatVector);
        expect(vector.getValue(0)).toBe(100n);
        expect(vector.getValue(1)).toBe(unsafe);
        expect(offset.get()).toBe(tile.length);
    });

    it("decodes a FLAT delta stream whose sum leaves the safe range as Int64FlatVector", () => {
        // Three deltas of 2^52 - 1, each a safe varint: the third sum, 3 * 2^52 - 3, is not safe.
        const delta = 2n ** 52n - 1n;
        const zigzagDelta = delta * 2n;
        const metadata = createStreamMetadata(LogicalLevelTechnique.DELTA, LogicalLevelTechnique.NONE, 3);
        const tile = encodeVarintInt64(BigUint64Array.from([zigzagDelta, zigzagDelta, zigzagDelta]));

        const vector = decodeIdColumn(tile, LONG_ID_COLUMN, new IntWrapper(0), "id", metadata, 3, false);

        expect(vector).toBeInstanceOf(Int64FlatVector);
        expect(vector.getValue(1)).toBe(2n * delta);
        expect(vector.getValue(2)).toBe(3n * delta);
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
