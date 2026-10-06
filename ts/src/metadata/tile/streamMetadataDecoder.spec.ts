import { describe, expect, it } from "vitest";
import {
    decodeStreamMetadata,
    type MortonEncodedStreamMetadata,
    type RleEncodedStreamMetadata,
} from "./streamMetadataDecoder";
import IntWrapper from "../../decoding/intWrapper";
import { concatenateBuffers } from "../../decoding/decodingTestUtils";
import { encodeVarintInt32 } from "../../encoding/integerEncodingUtils";
import { DictionaryType } from "./dictionaryType";

const DATA_ID = 1;
const LLT_NONE = 0;
const LLT_RLE = 3;
const LLT_MORTON = 4;
const PLT_NONE = 0;
const PLT_FAST_PFOR = 1;

function stream(
    physicalId: number,
    logicalId: number,
    technique1: number,
    technique2: number,
    physical: number,
    varints: number[],
    payload: number,
) {
    return concatenateBuffers(
        new Uint8Array([(physicalId << 4) | logicalId, (technique1 << 5) | (technique2 << 2) | physical]),
        encodeVarintInt32(Uint32Array.from(varints)),
        new Uint8Array(payload),
    );
}

describe("decodeStreamMetadata", () => {
    it("decodes a MORTON header with numBits and coordinateShift", () => {
        const buffer = stream(DATA_ID, 4, LLT_MORTON, LLT_NONE, PLT_FAST_PFOR, [10, 0, 17, 3], 0);
        const offset = new IntWrapper(0);

        const metadata = decodeStreamMetadata(buffer, offset) as MortonEncodedStreamMetadata;

        expect(metadata.logicalStreamType.dictionaryType).toBe(DictionaryType.MORTON);
        expect(metadata.decompressedCount).toBe(10);
        expect(metadata.numBits).toBe(17);
        expect(metadata.coordinateShift).toBe(3);
        expect(offset.get()).toBe(buffer.length);
    });

    it.each([
        [LLT_RLE, LLT_NONE],
        [LLT_NONE, LLT_RLE],
    ])("decodes an RLE header (techniques %i, %i) with the expanded count", (technique1, technique2) => {
        const buffer = stream(DATA_ID, 0, technique1, technique2, PLT_FAST_PFOR, [5, 0, 2, 40], 0);
        const offset = new IntWrapper(0);

        const metadata = decodeStreamMetadata(buffer, offset) as RleEncodedStreamMetadata;

        expect(metadata.runs).toBe(2);
        expect(metadata.numRleValues).toBe(40);
        expect(metadata.decompressedCount).toBe(40);
        expect(offset.get()).toBe(buffer.length);
    });

    it("does not read RLE info when no physical technique is applied", () => {
        const buffer = stream(DATA_ID, 0, LLT_RLE, LLT_NONE, PLT_NONE, [5, 0], 0);
        const offset = new IntWrapper(0);

        const metadata = decodeStreamMetadata(buffer, offset);

        expect(metadata.decompressedCount).toBe(5);
        expect(metadata).not.toHaveProperty("runs");
        expect(offset.get()).toBe(4);
    });
});
