import { describe, it, expect } from "vitest";
import { StringFlatVector } from "../flat/stringFlatVector";
import BitVector from "../flat/bitVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import {
    filterStringFlatByValue,
    filterStringFlatSelected,
    greaterThanOrEqualToStringFlat,
    greaterThanOrEqualToStringFlatSelected,
    smallerThanOrEqualToStringFlat,
    smallerThanOrEqualToStringFlatSelected,
    matchStringFlat,
    matchStringFlatSelected,
    noneMatchStringFlat,
    noneMatchStringFlatSelected,
    filterStringFlatNotEqual,
    filterStringFlatNotEqualSelected,
} from "./stringFlatVectorUtils";

// ============================================================================
// Helpers
// ============================================================================

function createStringVector(values: string[], name = "test"): StringFlatVector {
    const encoder = new TextEncoder();
    const encodedValues = values.map(v => encoder.encode(v));
    const totalSize = encodedValues.reduce((sum, v) => sum + v.length, 0);

    const offsetBuffer = new Int32Array(values.length + 1);
    const dataBuffer = new Uint8Array(totalSize);

    let currentOffset = 0;
    offsetBuffer[0] = 0;

    for (let i = 0; i < encodedValues.length; i++) {
        const encoded = encodedValues[i];
        dataBuffer.set(encoded, currentOffset);
        currentOffset += encoded.length;
        offsetBuffer[i + 1] = currentOffset;
    }

    return new StringFlatVector(name, offsetBuffer, dataBuffer);
}

function createNullableStringVector(values: (string | null)[], name = "test"): StringFlatVector {
    const encoder = new TextEncoder();
    const nonNullValues = values.map(v => v === null ? new Uint8Array(0) : encoder.encode(v));
    const totalSize = nonNullValues.reduce((sum, v) => sum + v.length, 0);

    const offsetBuffer = new Int32Array(values.length + 1);
    const dataBuffer = new Uint8Array(totalSize);
    const nullabilityBytes = new Uint8Array(Math.ceil(values.length / 8));

    let currentOffset = 0;
    offsetBuffer[0] = 0;

    for (let i = 0; i < values.length; i++) {
        const encoded = nonNullValues[i];
        dataBuffer.set(encoded, currentOffset);
        currentOffset += encoded.length;
        offsetBuffer[i + 1] = currentOffset;

        if (values[i] !== null) {
            const byteIndex = Math.floor(i / 8);
            const bitIndex = i % 8;
            nullabilityBytes[byteIndex] |= (1 << bitIndex);
        }
    }

    const bitVector = new BitVector(nullabilityBytes, values.length);
    return new StringFlatVector(name, offsetBuffer, dataBuffer, bitVector);
}

// ============================================================================
// Tests
// ============================================================================

describe("StringFlatVectorUtil Tests", () => {
    describe("filterStringFlatByValue", () => {
        it("filters matches and handles empty/no match/nulls", () => {
            const v1 = createStringVector(["apple", "banana", "apple"]);
            expect(filterStringFlatByValue(v1, "apple").selectionValues())
                .toEqual(new Uint32Array([0, 2]));

            const v2 = createStringVector(["apple", "banana"]);
            expect(filterStringFlatByValue(v2, "orange").selectionValues())
                .toEqual(new Uint32Array([]));

            const v3 = createStringVector([]);
            expect(filterStringFlatByValue(v3, "test").selectionValues())
                .toEqual(new Uint32Array([]));

            const v4 = createNullableStringVector(["apple", null, "apple"]);
            expect(filterStringFlatByValue(v4, "apple").selectionValues())
                .toEqual(new Uint32Array([0, 2]));
        });

        it("handles empty string, unicode, emoji, and case sensitivity", () => {
            const v1 = createStringVector(["", "a", "", "b"]);
            expect(filterStringFlatByValue(v1, "").selectionValues())
                .toEqual(new Uint32Array([0, 2]));

            const v2 = createStringVector(["café", "naïve", "café"]);
            expect(filterStringFlatByValue(v2, "café").selectionValues())
                .toEqual(new Uint32Array([0, 2]));

            const v3 = createStringVector(["🚀", "🌟", "🚀"]);
            expect(filterStringFlatByValue(v3, "🚀").selectionValues())
                .toEqual(new Uint32Array([0, 2]));

            const v4 = createStringVector(["Apple", "apple", "APPLE"]);
            expect(filterStringFlatByValue(v4, "apple").selectionValues())
                .toEqual(new Uint32Array([1]));
        });
    });

    describe("filterStringFlatSelected", () => {
        it("filters in-place and handles nulls/empty selection", () => {
            const v1 = createStringVector(["apple", "banana", "apple", "date"]);
            const sel1 = new FlatSelectionVector(new Uint32Array([0, 2, 3]));
            filterStringFlatSelected(v1, "apple", sel1);
            expect(sel1.selectionValues()).toEqual(new Uint32Array([0, 2]));

            const v2 = createStringVector(["apple", "banana", "cherry"]);
            const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            filterStringFlatSelected(v2, "orange", sel2);
            expect(sel2.selectionValues()).toEqual(new Uint32Array([]));

            const v3 = createNullableStringVector(["apple", null, "apple"]);
            const sel3 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            filterStringFlatSelected(v3, "apple", sel3);
            expect(sel3.selectionValues()).toEqual(new Uint32Array([0, 2]));

            const v4 = createStringVector(["", "a", "", "b"]);
            const sel4 = new FlatSelectionVector(new Uint32Array([0, 2, 3]));
            filterStringFlatSelected(v4, "", sel4);
            expect(sel4.selectionValues()).toEqual(new Uint32Array([0, 2]));
        });
    });

    describe("greaterThanOrEqualToStringFlat / smallerThanOrEqualToStringFlat", () => {
        it("handles basic, all/none match, prefixes, empty string, nulls, unicode, case", () => {
            const v = createStringVector(["aaa", "apple", "banana", "cherry", "date"]);
            expect(greaterThanOrEqualToStringFlat(v, "banana").selectionValues())
                .toEqual(new Uint32Array([2, 3, 4]));
            expect(smallerThanOrEqualToStringFlat(v, "banana").selectionValues())
                .toEqual(new Uint32Array([0, 1, 2]));

            const v2 = createStringVector(["aaa", "aab", "aac"]);
            expect(greaterThanOrEqualToStringFlat(v2, "banana").selectionValues())
                .toEqual(new Uint32Array([]));

            const v3 = createStringVector(["banana", "cherry"]);
            expect(greaterThanOrEqualToStringFlat(v3, "apple").selectionValues())
                .toEqual(new Uint32Array([0, 1]));

            const v4 = createStringVector(["app", "apple", "application"]);
            expect(greaterThanOrEqualToStringFlat(v4, "apple").selectionValues())
                .toEqual(new Uint32Array([1, 2]));
            expect(smallerThanOrEqualToStringFlat(v4, "apple").selectionValues())
                .toEqual(new Uint32Array([0, 1]));

            const v5 = createStringVector(["", "apple", "banana"]);
            expect(greaterThanOrEqualToStringFlat(v5, "").selectionValues())
                .toEqual(new Uint32Array([0, 1, 2]));
            expect(smallerThanOrEqualToStringFlat(v5, "apple").selectionValues())
                .toEqual(new Uint32Array([0, 1]));

            const v6 = createNullableStringVector(["apple", null, "banana", "cherry"]);
            expect(greaterThanOrEqualToStringFlat(v6, "banana").selectionValues())
                .toEqual(new Uint32Array([2, 3]));
            expect(smallerThanOrEqualToStringFlat(v6, "banana").selectionValues())
                .toEqual(new Uint32Array([0, 2]));

            const v7 = createStringVector(["café", "naïve", "résumé"]);
            expect(greaterThanOrEqualToStringFlat(v7, "naïve").selectionValues())
                .toEqual(new Uint32Array([1, 2]));
            expect(smallerThanOrEqualToStringFlat(v7, "naïve").selectionValues())
                .toEqual(new Uint32Array([0, 1]));

            const v8 = createStringVector(["Apple", "apple", "banana"]);
            expect(greaterThanOrEqualToStringFlat(v8, "apple").selectionValues())
                .toEqual(new Uint32Array([1, 2]));
            expect(smallerThanOrEqualToStringFlat(v8, "Apple").selectionValues())
                .toEqual(new Uint32Array([0]));

            // Test chunk processing (strings >= 8 bytes)
            const v9 = createStringVector(["verylongstring1", "verylongstring2", "verylongstring3"]);
            expect(greaterThanOrEqualToStringFlat(v9, "verylongstring2").selectionValues())
                .toEqual(new Uint32Array([1, 2]));
            expect(smallerThanOrEqualToStringFlat(v9, "verylongstring2").selectionValues())
                .toEqual(new Uint32Array([0, 1]));

            // Test early return in chunk processing (first byte differs)
            const v10 = createStringVector(["aaaaaaaa", "bbbbbbbb", "cccccccc"]);
            expect(greaterThanOrEqualToStringFlat(v10, "bbbbbbbb").selectionValues())
                .toEqual(new Uint32Array([1, 2]));
            expect(smallerThanOrEqualToStringFlat(v10, "bbbbbbbb").selectionValues())
                .toEqual(new Uint32Array([0, 1]));
        });
    });

    describe("greaterThanOrEqualToStringFlatSelected / smallerThanOrEqualToStringFlatSelected", () => {
        it("filters selection for >= and <=", () => {
            const v1 = createStringVector(["aaa", "apple", "banana", "cherry"]);
            const sel1 = new FlatSelectionVector(new Uint32Array([0, 2, 3]));
            greaterThanOrEqualToStringFlatSelected(v1, "banana", sel1);
            expect(sel1.selectionValues()).toEqual(new Uint32Array([2, 3]));

            const v2 = createStringVector(["aaa", "banana", "cherry"]);
            const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            smallerThanOrEqualToStringFlatSelected(v2, "banana", sel2);
            expect(sel2.selectionValues()).toEqual(new Uint32Array([0, 1]));

            const v3 = createNullableStringVector(["apple", null, "banana", "cherry"]);
            const sel3 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
            greaterThanOrEqualToStringFlatSelected(v3, "banana", sel3);
            expect(sel3.selectionValues()).toEqual(new Uint32Array([2, 3]));

            const sel4 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
            smallerThanOrEqualToStringFlatSelected(v3, "banana", sel4);
            expect(sel4.selectionValues()).toEqual(new Uint32Array([0, 2]));
        });
    });

    describe("matchStringFlat / noneMatchStringFlat", () => {
        it("matches and excludes lists, including empty list, nulls, empty string, unicode, case", () => {
            const v = createStringVector(["apple", "banana", "cherry", "apple", "date"]);
            expect(matchStringFlat(v, ["apple"]).selectionValues())
                .toEqual(new Uint32Array([0, 3]));
            expect(matchStringFlat(v, ["apple", "cherry"]).selectionValues())
                .toEqual(new Uint32Array([0, 2, 3]));
            expect(matchStringFlat(v, []).selectionValues())
                .toEqual(new Uint32Array([]));

            expect(noneMatchStringFlat(v, ["apple"]).selectionValues())
                .toEqual(new Uint32Array([1, 2, 4]));
            expect(noneMatchStringFlat(v, ["apple", "cherry"]).selectionValues())
                .toEqual(new Uint32Array([1, 4]));
            expect(noneMatchStringFlat(v, []).selectionValues())
                .toEqual(new Uint32Array([0, 1, 2, 3, 4]));

            const v2 = createNullableStringVector(["apple", null, "banana", "cherry"]);
            expect(matchStringFlat(v2, ["apple", "banana"]).selectionValues())
                .toEqual(new Uint32Array([0, 2]));
            expect(noneMatchStringFlat(v2, ["apple", "banana"]).selectionValues())
                .toEqual(new Uint32Array([1, 3]));

            const v3 = createStringVector(["", "apple", "", "banana"]);
            expect(matchStringFlat(v3, ["", "apple"]).selectionValues())
                .toEqual(new Uint32Array([0, 1, 2]));
            expect(noneMatchStringFlat(v3, [""]).selectionValues())
                .toEqual(new Uint32Array([1, 3]));

            const v4 = createStringVector(["café", "naïve", "résumé", "café"]);
            expect(matchStringFlat(v4, ["café", "résumé"]).selectionValues())
                .toEqual(new Uint32Array([0, 2, 3]));

            const v5 = createStringVector(["Apple", "apple", "APPLE", "banana"]);
            expect(matchStringFlat(v5, ["apple", "banana"]).selectionValues())
                .toEqual(new Uint32Array([1, 3]));
            expect(noneMatchStringFlat(v5, ["apple"]).selectionValues())
                .toEqual(new Uint32Array([0, 2, 3]));

            // Test groupByLength with multiple same-length strings
            const v6 = createStringVector(["abc", "def", "ghi"]);
            expect(matchStringFlat(v6, ["abc", "ghi"]).selectionValues())
                .toEqual(new Uint32Array([0, 2]));
        });
    });

    describe("matchStringFlatSelected / noneMatchStringFlatSelected", () => {
        it("filters selection by match and noneMatch", () => {
            const v = createStringVector(["apple", "banana", "cherry", "apple", "date"]);
            const sel1 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 4]));
            matchStringFlatSelected(v, ["apple", "banana"], sel1);
            expect(sel1.selectionValues()).toEqual(new Uint32Array([0, 1]));

            const sel2 = new FlatSelectionVector(new Uint32Array([0, 1]));
            matchStringFlatSelected(v, ["cherry", "date"], sel2);
            expect(sel2.selectionValues()).toEqual(new Uint32Array([]));

            const v2 = createNullableStringVector(["apple", null, "banana", "cherry"]);
            const sel3 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
            matchStringFlatSelected(v2, ["apple", "banana"], sel3);
            expect(sel3.selectionValues()).toEqual(new Uint32Array([0, 2]));

            const sel4 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
            noneMatchStringFlatSelected(v2, ["apple", "banana"], sel4);
            expect(sel4.selectionValues()).toEqual(new Uint32Array([1, 3]));

            const sel5 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            matchStringFlatSelected(v, [], sel5);
            expect(sel5.selectionValues()).toEqual(new Uint32Array([]));

            const sel6 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            noneMatchStringFlatSelected(v, [], sel6);
            expect(sel6.selectionValues()).toEqual(new Uint32Array([0, 1, 2]));
        });
    });

    describe("filterStringFlatNotEqual / filterStringFlatNotEqualSelected", () => {
        it("handles not-equal for full vector", () => {
            const v = createStringVector(["apple", "banana", "cherry", "apple"]);
            expect(filterStringFlatNotEqual(v, "apple").selectionValues())
                .toEqual(new Uint32Array([1, 2]));

            const v2 = createStringVector(["apple", "banana"]);
            expect(filterStringFlatNotEqual(v2, "orange").selectionValues())
                .toEqual(new Uint32Array([0, 1]));

            const v3 = createStringVector(["test", "test"]);
            expect(filterStringFlatNotEqual(v3, "test").selectionValues())
                .toEqual(new Uint32Array([]));

            const v4 = createNullableStringVector(["apple", null, "banana", "apple"]);
            expect(filterStringFlatNotEqual(v4, "apple").selectionValues())
                .toEqual(new Uint32Array([1, 2]));

            const v5 = createStringVector(["", "apple", "", "banana"]);
            expect(filterStringFlatNotEqual(v5, "").selectionValues())
                .toEqual(new Uint32Array([1, 3]));
        });

        it("handles not-equal in selection", () => {
            const v = createStringVector(["apple", "banana", "cherry", "apple"]);
            const sel1 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
            filterStringFlatNotEqualSelected(v, "apple", sel1);
            expect(sel1.selectionValues()).toEqual(new Uint32Array([1, 2]));

            const v2 = createStringVector(["apple", "banana", "cherry"]);
            const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            filterStringFlatNotEqualSelected(v2, "orange", sel2);
            expect(sel2.selectionValues()).toEqual(new Uint32Array([0, 1, 2]));

            const v3 = createStringVector(["apple", "banana", "apple"]);
            const sel3 = new FlatSelectionVector(new Uint32Array([0, 2]));
            filterStringFlatNotEqualSelected(v3, "apple", sel3);
            expect(sel3.selectionValues()).toEqual(new Uint32Array([]));

            const v4 = createNullableStringVector(["apple", null, "banana"]);
            const sel4 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            filterStringFlatNotEqualSelected(v4, "apple", sel4);
            expect(sel4.selectionValues()).toEqual(new Uint32Array([1, 2]));
        });
    });
});
