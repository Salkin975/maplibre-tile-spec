import { describe, it, expect } from "vitest";
import { unpackNullable, unpackNullableBoolean } from "./unpackNullableUtils";
import BitVector from "../vector/flat/bitVector";
import { packNullable, packNullableBoolean } from "../encoding/packNullableUtils";

describe("unpackNullableUtils", () => {
    describe("unpackNullable", () => {
        it("should return the original array when presentBits is null", () => {
            const dataStream = new Int32Array([1, 2, 3]);
            const packed = packNullable(dataStream, null);
            const result = unpackNullable(packed, null, 0);

            expect(result).toBe(dataStream);
            expect(result).toEqual(new Int32Array([1, 2, 3]));
        });

        it("should return the original array when presentBits is undefined", () => {
            const dataStream = new Float32Array([1.5, 2.5, 3.5]);
            const result = unpackNullable(dataStream, undefined, 0);

            expect(result).toBe(dataStream);
            expect(result).toEqual(new Float32Array([1.5, 2.5, 3.5]));
        });

        it("should return the original BigInt64Array when presentBits is null", () => {
            const dataStream = new BigInt64Array([10n, 20n, 30n]);
            const result = unpackNullable(dataStream, null, 0n);

            expect(result).toBe(dataStream);
            expect(result).toEqual(new BigInt64Array([10n, 20n, 30n]));
        });

        it("should return the original array when presentBits is fully set", () => {
            const dataStream = new BigInt64Array([10n, 20n, 30n]);
            const presentBits = new BitVector(new Uint8Array([0b111]), 3);
            const packed = packNullable(dataStream, presentBits);
            const result = unpackNullable(packed, presentBits, 0n);

            expect(result).toEqual(new BigInt64Array([10n, 20n, 30n]));
        });

        it("should return partial array when presentBits is partially set", () => {
            const dataStream = new Int32Array([0, 20, 30]); // first number is "null"
            const presentBits = new BitVector(new Uint8Array([0b110]), 3);
            const packed = packNullable(dataStream, presentBits);
            const result = unpackNullable(packed, presentBits, 0);

            expect(result).toEqual(new Int32Array([0, 20, 30]));
        });

        it("should place values across empty, full and partial bytes of presentBits", () => {
            // Positions 0-7 null, 8-15 present, 16-19 alternate starting with present
            const presentBits = new BitVector(new Uint8Array([0b00000000, 0b11111111, 0b0101]), 20);
            const expected = new Float64Array(20).fill(-1);
            let value = 1;
            for (let i = 0; i < 20; i++) {
                if (presentBits.get(i)) expected[i] = value++;
            }
            const packed = packNullable(expected, presentBits);

            expect(unpackNullable(packed, presentBits, -1)).toEqual(expected);
            expect(unpackNullable(packed, presentBits, 0)).toEqual(expected.map((v) => (v === -1 ? 0 : v)));
        });
    });

    describe("unpackNullableBoolean", () => {
        it("should return the original array when presentBits is null", () => {
            const dataStream = new Uint8Array([0b11010101]);
            const packed = packNullableBoolean(dataStream, 8, null);
            const result = unpackNullableBoolean(packed, 8, null);

            expect(result).toBe(dataStream);
            expect(result).toEqual(new Uint8Array([0b11010101]));
        });

        it("should return the original array when presentBits is undefined", () => {
            const dataStream = new Uint8Array([0b00001111]);
            const result = unpackNullableBoolean(dataStream, 8, undefined);

            expect(result).toBe(dataStream);
            expect(result).toEqual(new Uint8Array([0b00001111]));
        });

        it("should return the original array when presentBits is fully set", () => {
            const dataStream = new Uint8Array([0b11010101]);
            const presentBits = new BitVector(new Uint8Array([0b11111111]), 8);
            const packed = packNullableBoolean(dataStream, 8, presentBits);
            const result = unpackNullableBoolean(packed, 8, presentBits);

            expect(result).toEqual(new Uint8Array([0b11010101]));
        });

        it("should return partial array when presentBits is partially set", () => {
            const dataStream = new Uint8Array([0b11111111]);
            const presentBits = new BitVector(new Uint8Array([0b11110000]), 8);
            const packed = packNullableBoolean(dataStream, 8, presentBits);
            const result = unpackNullableBoolean(packed, 8, presentBits);

            expect(result).toEqual(new Uint8Array([0b11110000]));
        });
    });
});
