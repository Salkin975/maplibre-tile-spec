import { describe, it, expect } from "vitest";
import {
    createFastPforWireDecodeWorkspace,
    decodeFastPfor,
    decodeFastPforWithWorkspace,
    decodeVarintInt32,
    readVarint,
    decodeVarintInt64,
    decodeVarintFloat64,
    decodeZigZagInt32,
    decodeZigZagInt64,
    decodeZigZagFloat64,
    decodeZigZagInt32Value,
    decodeZigZagInt64Value,
    decodeUnsignedRleInt32,
    decodeUnsignedRleInt64,
    decodeUnsignedRleFloat64,
    decodeZigZagDeltaInt64,
    decodeDeltaRleInt32,
    decodeDeltaRleInt64,
    decodeUnsignedConstRleInt64,
    decodeZigZagConstRleInt64,
    decodeZigZagSequenceRleInt64,
    decodeZigZagRleInt32,
    decodeZigZagRleInt64,
    decodeZigZagRleFloat64,
    decodeZigZagRleDeltaInt32,
    fastInverseDelta,
    decodeZigZagSequenceRleInt32,
    decodeZigZagDeltaInt32,
    decodeZigZagDeltaFloat64,
    decodeRleDeltaInt32,
    decodeComponentwiseDeltaVec2,
    decodeComponentwiseDeltaVec2Scaled,
} from "./integerDecodingUtils";
import IntWrapper from "./intWrapper";
import {
    encodeVarintInt32,
    encodeVarintInt32Value,
    encodeVarintInt64,
    encodeDeltaInt32,
    encodeDeltaRleInt32,
    encodeDeltaRleInt64,
    encodeUnsignedRleFloat64,
    encodeUnsignedRleInt32,
    encodeUnsignedRleInt64,
    encodeZigZagDeltaInt64,
    encodeZigZagFloat64,
    encodeZigZagInt32,
    encodeZigZagInt32Value,
    encodeZigZagInt64,
    encodeZigZagInt64Value,
    encodeZigZagRleFloat64,
    encodeZigZagRleInt32,
    encodeZigZagRleInt64,
    encodeZigZagDeltaInt32,
    encodeZigZagDeltaFloat64,
    encodeVarintFloat64,
    encodeZigZagRleDeltaInt32,
    encodeRleDeltaInt32,
    encodeComponentwiseDeltaVec2,
    encodeComponentwiseDeltaVec2Scaled,
} from "../encoding/integerEncodingUtils";

describe("IntegerDecodingUtils", () => {
    describe("Varint decoding", () => {
        it("should decode Int32", () => {
            const value = 2 ** 10;
            const encoded = encodeVarintInt32(new Uint32Array([value]));
            const decoded = decodeVarintInt32(encoded, new IntWrapper(0), 1);
            expect(decoded[0]).toEqual(value);
        });

        it("should decode Int64", () => {
            const value = 2n ** 50n;
            const encoded = encodeVarintInt64(new BigUint64Array([value]));
            const decoded = decodeVarintInt64(encoded, new IntWrapper(0), 1);
            expect(decoded[0]).toEqual(value);
        });

        it("should return valid decoded values for varint long to float64", () => {
            const value = 2 ** 40;
            const varintEncoded = encodeVarintFloat64(new Float64Array([value]));
            const actualValues = decodeVarintFloat64(varintEncoded, new IntWrapper(0), 1);
            expect(actualValues[0]).toEqual(value);
        });
    });

    describe("ZigZag encoding", () => {
        it("should decode zigzag Int32Array", () => {
            const data = new Int32Array([0, 1, 2, 3]);
            const encoded = encodeZigZagInt32(data);
            const decoded = decodeZigZagInt32(encoded);
            expect(Array.from(decoded)).toEqual([0, 1, 2, 3]);
        });

        it("should decode zigzag BigInt64Array", () => {
            const data = new BigInt64Array([0n, 1n, 2n, 3n]);
            const encoded = encodeZigZagInt64(data);
            const decoded = decodeZigZagInt64(encoded);
            expect(Array.from(decoded)).toEqual([0n, 1n, 2n, 3n]);
        });

        it("should decode zigzag Float64Array", () => {
            const value = 2 ** 35;
            const data = new Float64Array([value]);
            encodeZigZagFloat64(data);
            decodeZigZagFloat64(data);
            expect(Array.from(data)).toEqual([value]);
        });

        it("should decode single Int32 zigzag values", () => {
            expect(encodeZigZagInt32Value(decodeZigZagInt32Value(0))).toBe(0);
            expect(encodeZigZagInt32Value(decodeZigZagInt32Value(1))).toBe(1);
            expect(encodeZigZagInt32Value(decodeZigZagInt32Value(2))).toBe(2);
        });

        it("should decode single BigInt zigzag values", () => {
            expect(encodeZigZagInt64Value(decodeZigZagInt64Value(0n))).toBe(0n);
            expect(encodeZigZagInt64Value(decodeZigZagInt64Value(1n))).toBe(1n);
        });
    });

    describe("RLE decoding", () => {
        describe("Unsigned RLE", () => {
            it("should decode empty unsigned RLE", () => {
                const data = new Uint32Array([]);
                const encodedRle = encodeUnsignedRleInt32(data);
                const decoded = decodeUnsignedRleInt32(encodedRle.data, encodedRle.runs, data.length);
                expect(Array.from(decoded)).toEqual([]);
            });

            it("should decode unsigned RLE", () => {
                const data = new Uint32Array([10, 10, 20, 20, 20]);
                const encodedRle = encodeUnsignedRleInt32(data);
                const decoded = decodeUnsignedRleInt32(encodedRle.data, encodedRle.runs, data.length);
                expect(Array.from(decoded)).toEqual([10, 10, 20, 20, 20]);
            });

            it("should decode empty unsigned RLE Int64", () => {
                const data = new BigInt64Array([]);
                const encodedRle = encodeUnsignedRleInt64(data);
                const decoded = decodeUnsignedRleInt64(encodedRle.data, encodedRle.runs, data.length);
                expect(Array.from(decoded)).toEqual([]);
            });

            it("should decode unsigned RLE Int64", () => {
                const data = new BigInt64Array([10n, 10n, 20n, 20n, 20n]);
                const encodedRle = encodeUnsignedRleInt64(data);
                const decoded = decodeUnsignedRleInt64(encodedRle.data, encodedRle.runs, data.length);
                expect(Array.from(decoded)).toEqual([10n, 10n, 20n, 20n, 20n]);
            });

            it("should decode empty unsigned RLE Float64", () => {
                const data = new Float64Array([]);
                const encodedRle = encodeUnsignedRleFloat64(data);
                const decoded = decodeUnsignedRleFloat64(encodedRle.data, encodedRle.runs, data.length);
                expect(Array.from(decoded)).toEqual([]);
            });

            it("should decode unsigned RLE Float64", () => {
                const data = new Float64Array([10.5, 10.5, 20.5, 20.5, 20.5]);
                const encodedRle = encodeUnsignedRleFloat64(data);
                const decoded = decodeUnsignedRleFloat64(encodedRle.data, encodedRle.runs, data.length);
                expect(Array.from(decoded)).toEqual([10.5, 10.5, 20.5, 20.5, 20.5]);
            });
        });

        describe("ZigZag RLE", () => {
            it("should decode empty ZigZag RLE Int32", () => {
                const data = new Int32Array([]);
                const encoded = encodeZigZagRleInt32(data);
                const decoded = decodeZigZagRleInt32(encoded.data, encoded.runs, encoded.numTotalValues);
                expect(Array.from(decoded)).toEqual([]);
            });

            it("should decode ZigZag RLE Int32", () => {
                const encoded = new Int32Array([2, 2, 3, 3, 3]);
                const encodedData = encodeZigZagRleInt32(encoded);
                const decoded = decodeZigZagRleInt32(encodedData.data, encodedData.runs, encodedData.numTotalValues);
                expect(Array.from(decoded)).toEqual([2, 2, 3, 3, 3]);
            });

            it("should decode empty ZigZag RLE Int64", () => {
                const data = new BigInt64Array([]);
                const encoded = encodeZigZagRleInt64(data);
                const decoded = decodeZigZagRleInt64(encoded.data, encoded.runs, encoded.numTotalValues);
                expect(Array.from(decoded)).toEqual([]);
            });

            it("should decode ZigZag RLE Int64", () => {
                const encoded = new BigInt64Array([2n, 2n, 3n, 3n, 3n]);
                const encodedData = encodeZigZagRleInt64(encoded);
                const decoded = decodeZigZagRleInt64(encodedData.data, encodedData.runs, encodedData.numTotalValues);
                expect(Array.from(decoded)).toEqual([2n, 2n, 3n, 3n, 3n]);
            });

            it("should decode empty ZigZag RLE Float64", () => {
                const data = new Float64Array([]);
                const encoded = encodeZigZagRleFloat64(data);
                const decoded = decodeZigZagRleFloat64(encoded.data, encoded.runs, encoded.numTotalValues);
                expect(Array.from(decoded)).toEqual([]);
            });

            it("should decode ZigZag RLE Float64", () => {
                const encoded = new Float64Array([2, 2, 3, 3, 3]);
                const encodedData = encodeZigZagRleFloat64(encoded);
                const decoded = decodeZigZagRleFloat64(encodedData.data, encodedData.runs, encodedData.numTotalValues);
                expect(Array.from(decoded)).toEqual([2, 2, 3, 3, 3]);
            });
        });
    });

    describe("Delta encoding", () => {
        describe("ZigZag Delta", () => {
            it("should decode zigzag delta Int32", () => {
                const data = new Int32Array([1, 2, 3, 5, 6, 7]);
                const encoded = encodeZigZagDeltaInt32(data);
                const decoded = decodeZigZagDeltaInt32(encoded);
                expect(Array.from(decoded)).toEqual([1, 2, 3, 5, 6, 7]);
            });

            it("should decode zigzag delta Int64", () => {
                const data = new BigInt64Array([1n, 2n, 3n, 5n, 6n, 7n]);
                const encoded = encodeZigZagDeltaInt64(data);
                const decoded = decodeZigZagDeltaInt64(encoded);
                expect(Array.from(decoded)).toEqual([1n, 2n, 3n, 5n, 6n, 7n]);
            });

            it("should decode zigzag delta Float64", () => {
                const data = new Float64Array([1.0, 2.0, 3.0, 5.0, 6.0, 7.0]);
                encodeZigZagDeltaFloat64(data);
                decodeZigZagDeltaFloat64(data);
                expect(Array.from(data)).toEqual([1.0, 2.0, 3.0, 5.0, 6.0, 7.0]);
            });
        });

        describe("Fast inverse delta", () => {
            it("should apply fast inverse delta", () => {
                const data = new Int32Array([10, 15, 18, 20]);
                fastInverseDelta(data);
                encodeDeltaInt32(data);
                expect(Array.from(data)).toEqual([10, 15, 18, 20]);
            });
        });

        describe("Componentwise Delta Vec2", () => {
            it("should decode empty array", () => {
                const data = new Int32Array([]);
                const expected = new Int32Array(data);
                const encoded = encodeComponentwiseDeltaVec2(data);
                const decoded = decodeComponentwiseDeltaVec2(encoded);
                expect(Array.from(decoded)).toEqual(Array.from(expected));
            });

            it("should decode single vertex", () => {
                const data = new Int32Array([10, 20]);
                const expected = new Int32Array(data);
                const encoded = encodeComponentwiseDeltaVec2(data);
                const decoded = decodeComponentwiseDeltaVec2(encoded);
                expect(Array.from(decoded)).toEqual(Array.from(expected));
            });

            it("should decode many vertices (unrolled loop test)", () => {
                const data = new Int32Array([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9]);
                const expected = new Int32Array(data);
                const encoded = encodeComponentwiseDeltaVec2(data);
                const decoded = decodeComponentwiseDeltaVec2(encoded);
                expect(Array.from(decoded)).toEqual(Array.from(expected));
            });
        });

        describe("Componentwise Delta Vec2 Scaled", () => {
            const scale = 2.0;
            const min = 0;
            const max = 4096;

            it("should decode empty array", () => {
                const data = new Int32Array([]);
                const expected = new Int32Array(data);
                const encoded = encodeComponentwiseDeltaVec2Scaled(data, scale);
                const decoded = decodeComponentwiseDeltaVec2Scaled(encoded, scale, min, max);
                expect(Array.from(decoded)).toEqual(Array.from(expected));
            });

            it("should decode single vertex", () => {
                const data = new Int32Array([100, 200]);
                const expected = new Int32Array(data);
                const encoded = encodeComponentwiseDeltaVec2Scaled(data, scale);
                const decoded = decodeComponentwiseDeltaVec2Scaled(encoded, scale, min, max);
                expect(Array.from(decoded)).toEqual(Array.from(expected));
            });

            it("should decode with different scale", () => {
                const testScale = 10.0;
                const data = new Int32Array([1000, 2000, 1100, 2200]);
                const expected = new Int32Array(data);
                const encoded = encodeComponentwiseDeltaVec2Scaled(data, testScale);
                const decoded = decodeComponentwiseDeltaVec2Scaled(encoded, testScale, min, max);
                expect(Array.from(decoded)).toEqual(Array.from(expected));
            });

            it("should decode many vertices (unrolled loop test)", () => {
                const numbers: number[] = [];
                for (let i = 0; i < 100; i++) {
                    numbers.push(i * 10, i * 10);
                }
                const data = new Int32Array(numbers);
                const expected = new Int32Array(data);
                const encoded = encodeComponentwiseDeltaVec2Scaled(data, scale);
                const decoded = decodeComponentwiseDeltaVec2Scaled(encoded, scale, min, max);
                expect(Array.from(decoded)).toEqual(Array.from(expected));
            });
        });

        describe("Delta RLE", () => {
            it("should decode empty delta RLE Int32", () => {
                const data = new Int32Array([]);
                const encoded = encodeDeltaRleInt32(data);
                const decoded = decodeDeltaRleInt32(encoded.data, encoded.runs, encoded.numValues);
                expect(Array.from(decoded)).toEqual([]);
            });

            it("should decode delta RLE Int32", () => {
                const data = new Int32Array([1, 2, 3, 5, 6, 7]);
                const encoded = encodeDeltaRleInt32(data);
                const decoded = decodeDeltaRleInt32(encoded.data, encoded.runs, encoded.numValues);
                expect(Array.from(decoded)).toEqual([1, 2, 3, 5, 6, 7]);
            });

            it("should decode empty delta RLE Int64", () => {
                const data = new BigInt64Array([]);
                const encoded = encodeDeltaRleInt64(data);
                const decoded = decodeDeltaRleInt64(encoded.data, encoded.runs, encoded.numValues);
                expect(Array.from(decoded)).toEqual([]);
            });

            it("should decode delta RLE Int64", () => {
                const data = new BigInt64Array([1n, 2n, 3n, 5n, 6n, 7n]);
                const encoded = encodeDeltaRleInt64(data);
                const decoded = decodeDeltaRleInt64(encoded.data, encoded.runs, encoded.numValues);
                expect(Array.from(decoded)).toEqual([1n, 2n, 3n, 5n, 6n, 7n]);
            });
        });

        describe("ZigZag RLE Delta", () => {
            it("should decode zigzag RLE delta", () => {
                const data = new Int32Array([1, 2, 3, 4]);
                const encoded = encodeZigZagRleDeltaInt32(data);
                const decoded = decodeZigZagRleDeltaInt32(encoded.data, encoded.runs, encoded.numTotalValues);
                // The decoder is adding a 0 at the start
                expect(Array.from(decoded)).toEqual([0, 1, 2, 3, 4]);
            });

            it("should decode RLE delta", () => {
                const data = new Uint32Array([1, 2, 3, 4]);
                const encoded = encodeRleDeltaInt32(data);
                const decoded = decodeRleDeltaInt32(encoded.data, encoded.runs, encoded.numTotalValues);
                // The decoder is adding a 0 at the start
                expect(Array.from(decoded)).toEqual([0, 1, 2, 3, 4]);
            });
        });
    });

    describe("Const and Sequence RLE", () => {
        it("should decode unsigned const RLE Int64", () => {
            const data = new BigInt64Array([5n, 42n]);
            expect(decodeUnsignedConstRleInt64(data)).toBe(42n);
        });

        it("should decode zigzag const RLE Int64", () => {
            const data = new BigInt64Array([5n, encodeZigZagInt64Value(2n)]);
            expect(decodeZigZagConstRleInt64(data)).toBe(2n);
        });

        it("should decode zigzag sequence RLE Int32", () => {
            const data = new Int32Array([5, 2]);
            const [base, delta] = decodeZigZagSequenceRleInt32(data);
            expect(base).toBe(1);
            expect(delta).toBe(1);
        });

        it("should decode zigzag sequence RLE Int32 with delta", () => {
            const data = new Int32Array([5, 2, 5, 2]);
            const [base, delta] = decodeZigZagSequenceRleInt32(data);
            expect(base).toBe(-3);
            expect(delta).toBe(1);
        });

        it("should decode zigzag sequence RLE Int64", () => {
            const data = new BigInt64Array([5n, 2n]);
            const [base, delta] = decodeZigZagSequenceRleInt64(data);
            expect(base).toBe(1n);
            expect(delta).toBe(1n);
        });

        it("should decode zigzag sequence RLE Int64 with delta", () => {
            const data = new BigInt64Array([5n, 2n, 5n, 2n]);
            const [base, delta] = decodeZigZagSequenceRleInt64(data);
            expect(base).toBe(-3n);
            expect(delta).toBe(1n);
        });
    });

    it("should reject FastPFOR byte lengths that are not multiple of 4", () => {
        const encoded = new Uint8Array([0x01, 0x02, 0x03]);
        const offset = new IntWrapper(0);

        expect(() => decodeFastPfor(encoded, 0, encoded.length, offset)).toThrow(/invalid encodedByteLength=3/);
        expect(offset.get()).toBe(0);
    });

    it("should reject FastPFOR byte lengths with workspace API when not multiple of 4", () => {
        const encoded = new Uint8Array([0x01, 0x02, 0x03]);
        const offset = new IntWrapper(0);
        const workspace = createFastPforWireDecodeWorkspace();

        expect(() => decodeFastPforWithWorkspace(encoded, 0, encoded.length, offset, workspace)).toThrow(
            /invalid encodedByteLength=3/,
        );
        expect(offset.get()).toBe(0);
    });
});

/** Test numbers taken from https://github.com/mapbox/pbf/blob/main/test/pbf.test.js */
describe("readVarint", () => {
    const testNumbers = [
        1, 0, 0, 4, 14, 23, 40, 86, 127, 141, 113, 925, 258, 1105, 1291, 6872, 12545, 16256, 65521, 126522, 133028,
        444205, 846327, 1883372, 2080768, 266338304, 34091302912, 17179869184, 3716678, 674158, 15203102, 27135056,
        42501689, 110263473, 6449928, 65474499, 943840723, 1552431153, 407193337, 2193544970, 8167778088, 5502125480,
        14014009728, 56371207648, 9459068416, 410595966336, 673736830976, 502662539776, 2654996269056, 5508583663616,
        6862782705664, 34717688324096, 1074895093760, 95806297440256, 130518477701120, 197679237955584, 301300890730496,
        1310140661760000, 2883205519638528, 2690669862715392, 3319292539961344,
    ];

    /** LEB128 writer for whole numbers up to 2^64; negatives are written as 10-byte two's complement, like pbf. */
    function writeVarints(values: number[]): Uint8Array {
        const bytes: number[] = [];
        for (const value of values) {
            let v = BigInt(value);
            if (v < 0n) v += 1n << 64n;
            while (v >= 0x80n) {
                bytes.push(Number(v & 0x7fn) | 0x80);
                v >>= 7n;
            }
            bytes.push(Number(v));
        }
        return Uint8Array.from(bytes);
    }

    it("reads and writes varints, unsigned and signed", () => {
        const values: number[] = [];
        for (const n of testNumbers) {
            values.push(n);
            if (n) values.push(-n);
        }
        const buf = writeVarints(values);
        expect(buf.length).toBe(839);

        const offset = new IntWrapper(0);
        let i = 0;
        while (offset.get() < buf.length) {
            expect(readVarint(buf, offset)).toBe(testNumbers[i]);
            if (testNumbers[i]) expect(readVarint(buf, offset, true)).toBe(-testNumbers[i]);
            i++;
        }
    });

    it("reads signed values", () => {
        expect(
            readVarint(
                Uint8Array.from([0xc8, 0xe8, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]),
                new IntWrapper(0),
                true,
            ),
        ).toBe(-3000);
        expect(
            readVarint(
                Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]),
                new IntWrapper(0),
                true,
            ),
        ).toBe(-1);
        expect(readVarint(Uint8Array.from([0xc8, 0x01]), new IntWrapper(0), true)).toBe(200);
    });

    it("handles really big numbers", () => {
        const bigNum1 = 2 ** 60;
        const bigNum2 = 2 ** 63;
        const buf = writeVarints([bigNum1, bigNum2]);
        const offset = new IntWrapper(0);
        expect(readVarint(buf, offset)).toBe(bigNum1);
        expect(readVarint(buf, offset)).toBe(bigNum2);
        expect(offset.get()).toBe(buf.length);
    });

    it("throws on a varint longer than 10 bytes", () => {
        const buf = new Uint8Array(12).fill(0xff);
        expect(() => readVarint(buf, new IntWrapper(0))).toThrow();
    });

    // Header reads replaced allocating decodeVarintInt32 calls, so pin the two to each other.
    const BOUNDARY_VALUES = [
        0, 1, 0x7f, 0x80, 0x81, 0x3fff, 0x4000, 0x1fffff, 0x200000, 0x0fffffff, 0x10000000, 0x7fffffff, 0x80000000,
        0xfffffffe, 0xffffffff,
    ];

    it.each(BOUNDARY_VALUES)("agrees with decodeVarintInt32 at %i", (value) => {
        const buffer = new Uint8Array(5);
        const writeOffset = new IntWrapper(0);
        encodeVarintInt32Value(value, buffer, writeOffset);
        const encoded = buffer.slice(0, writeOffset.get());

        const fastOffset = new IntWrapper(0);
        const referenceOffset = new IntWrapper(0);
        expect(readVarint(encoded, fastOffset)).toBe(value);
        expect(decodeVarintInt32(encoded, referenceOffset, 1)[0]).toBe(value);
        expect(fastOffset.get()).toBe(referenceOffset.get());
        expect(fastOffset.get()).toBe(encoded.length);
    });

    it("reads a run of values sequentially, leaving the offset where the batch decoder does", () => {
        const values = Uint32Array.from([0, 0x7f, 0x80, 300, 0x10000000, 0xffffffff, 42]);
        const buffer = encodeVarintInt32(values);
        const offset = new IntWrapper(0);
        const read = Array.from(values, () => readVarint(buffer, offset));

        const referenceOffset = new IntWrapper(0);
        expect(read).toEqual([...decodeVarintInt32(buffer, referenceOffset, values.length)]);
        expect(offset.get()).toBe(referenceOffset.get());
        expect(offset.get()).toBe(buffer.length);
    });
});
