import { describe, it, expect } from "vitest";
import { StringFsstDictionaryVector } from "../fsst-dictionary/stringFsstDictionaryVector";
import BitVector from "../flat/bitVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import {
    filterStringFsstDictionaryByValue,
    filterStringFsstDictionarySelected,
    filterStringFsstDictionaryNotEqual,
    filterStringFsstDictionaryNotEqualSelected,
    matchStringFsstDictionary,
    matchStringFsstDictionarySelected,
    noneMatchStringFsstDictionary,
    noneMatchStringFsstDictionarySelected,
    greaterThanOrEqualToStringFsstDictionary,
    greaterThanOrEqualToStringFsstDictionarySelected,
    smallerThanOrEqualToStringFsstDictionary,
    smallerThanOrEqualToStringFsstDictionarySelected,
} from "./stringFsstDictionaryUtils";

// ============================================================================
// Helpers
// ============================================================================

function createVector(values: (string | null)[], name = "test"): StringFsstDictionaryVector {
    const encoder = new TextEncoder();
    const nonNullValues = values.filter((v): v is string => v !== null);
    const uniqueValues = Array.from(new Set(nonNullValues));
    const encodedDict = uniqueValues.map(v => encoder.encode(v));

    // Create FSST-compressed dictionary
    const compressedSize = encodedDict.reduce((sum, v) => sum + v.length * 2, 0);
    const dictionaryBuffer = new Uint8Array(compressedSize);
    const offsetBuffer = new Int32Array(uniqueValues.length + 1);
    let compressedOffset = 0;
    let decompressedOffset = 0;
    offsetBuffer[0] = 0;

    for (let i = 0; i < encodedDict.length; i++) {
        const encoded = encodedDict[i];
        for (let j = 0; j < encoded.length; j++) {
            dictionaryBuffer[compressedOffset++] = 255; // Escape code
            dictionaryBuffer[compressedOffset++] = encoded[j];
        }
        decompressedOffset += encoded.length;
        offsetBuffer[i + 1] = decompressedOffset;
    }

    // Create index and nullability buffers
    const indexBuffer = new Int32Array(values.length);
    const nullabilityBytes = new Uint8Array(Math.ceil(values.length / 8));

    for (let i = 0; i < values.length; i++) {
        if (values[i] !== null) {
            indexBuffer[i] = uniqueValues.indexOf(values[i]);
            const byteIndex = Math.floor(i / 8);
            const bitIndex = i % 8;
            nullabilityBytes[byteIndex] |= (1 << bitIndex);
        } else {
            indexBuffer[i] = 0;
        }
    }

    const symbolOffsetBuffer = new Int32Array([0, 0]);
    const symbolTableBuffer = new Uint8Array(0);
    const bitVector = new BitVector(nullabilityBytes, values.length);

    return new StringFsstDictionaryVector(
        name,
        indexBuffer,
        offsetBuffer,
        dictionaryBuffer,
        symbolOffsetBuffer,
        symbolTableBuffer,
        bitVector
    );
}

// ============================================================================
// Tests
// ============================================================================

describe("stringFsstDictionaryUtil Tests", () => {
    describe("StringFsstDictionaryUtil - Core Filtering", () => {
        it("filterByValue: matches and skips nulls", () => {
            const v = createVector(["a", null, "a", "b"]);
            expect(filterStringFsstDictionaryByValue(v, "a").selectionValues())
                .toEqual(new Uint32Array([0, 2]));
            expect(filterStringFsstDictionaryByValue(v, "x").selectionValues())
                .toEqual(new Uint32Array([]));
        });

        it("filterByValue: empty vector", () => {
            const v = createVector([]);
            expect(filterStringFsstDictionaryByValue(v, "x").selectionValues())
                .toEqual(new Uint32Array([]));
        });

        it("filterNotEqual: basic and none-excluded", () => {
            const v1 = createVector(["a", "b", "a", "c"]);
            expect(filterStringFsstDictionaryNotEqual(v1, "a").selectionValues())
                .toEqual(new Uint32Array([1, 3]));

            const v2 = createVector(["a", "b", "c"]);
            expect(filterStringFsstDictionaryNotEqual(v2, "x").selectionValues())
                .toEqual(new Uint32Array([0, 1, 2]));
        });
    });

    describe("StringFsstDictionaryUtil - Match Operations", () => {
        it("match / noneMatch with multiple values", () => {
            const v = createVector(["a", "b", "c", "a", "d"]);
            expect(matchStringFsstDictionary(v, ["a", "c"]).selectionValues())
                .toEqual(new Uint32Array([0, 2, 3]));
            expect(noneMatchStringFsstDictionary(v, ["a", "c"]).selectionValues())
                .toEqual(new Uint32Array([1, 4]));
        });

        it("match / noneMatch: no matches and empty values array", () => {
            const v = createVector(["a", "b", "c"]);
            expect(matchStringFsstDictionary(v, ["x", "y"]).selectionValues())
                .toEqual(new Uint32Array([]));
            expect(matchStringFsstDictionary(v, []).selectionValues())
                .toEqual(new Uint32Array([]));
            expect(noneMatchStringFsstDictionary(v, ["a", "b", "c"]).selectionValues())
                .toEqual(new Uint32Array([]));
        });
    });

    describe("StringFsstDictionaryUtil - Comparison Operations", () => {
        it("greaterThanOrEqualTo and smallerThanOrEqualTo basic", () => {
            const v = createVector(["apple", "banana", "cherry", "date"]);
            expect(greaterThanOrEqualToStringFsstDictionary(v, "cherry").selectionValues())
                .toEqual(new Uint32Array([2, 3]));
            expect(smallerThanOrEqualToStringFsstDictionary(v, "banana").selectionValues())
                .toEqual(new Uint32Array([0, 1]));
        });

        it("comparison: none and all match", () => {
            const v1 = createVector(["apple", "banana"]);
            expect(greaterThanOrEqualToStringFsstDictionary(v1, "zebra").selectionValues())
                .toEqual(new Uint32Array([]));

            const v2 = createVector(["banana", "cherry", "date"]);
            expect(greaterThanOrEqualToStringFsstDictionary(v2, "apple").selectionValues())
                .toEqual(new Uint32Array([0, 1, 2]));

            const v3 = createVector(["apple", "banana", "cherry"]);
            expect(smallerThanOrEqualToStringFsstDictionary(v3, "zebra").selectionValues())
                .toEqual(new Uint32Array([0, 1, 2]));
        });

        it("comparison handles length differences", () => {
            const v = createVector(["a", "aa", "aaa"]);
            expect(greaterThanOrEqualToStringFsstDictionary(v, "aa").selectionValues())
                .toEqual(new Uint32Array([1, 2]));
        });
    });

    describe("StringFsstDictionaryUtil - Selected Filtering", () => {
        it("filterSelected and filterNotEqualSelected", () => {
            const v = createVector(["a", "b", "a", "c", "a"]);
            const sel1 = new FlatSelectionVector(new Uint32Array([0, 2, 3, 4]));
            filterStringFsstDictionarySelected(v, "a", sel1);
            expect(sel1.selectionValues())
                .toEqual(new Uint32Array([0, 2, 4]));

            const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
            filterStringFsstDictionaryNotEqualSelected(v, "a", sel2);
            expect(sel2.selectionValues())
                .toEqual(new Uint32Array([1, 3]));
        });

        it("matchSelected / noneMatchSelected", () => {
            const v = createVector(["a", "b", "c", "a", "d"]);
            const sel1 = new FlatSelectionVector(new Uint32Array([1, 2, 3, 4]));
            matchStringFsstDictionarySelected(v, ["a", "c"], sel1);
            expect(sel1.selectionValues())
                .toEqual(new Uint32Array([2, 3]));

            const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            noneMatchStringFsstDictionarySelected(v, ["a", "c"], sel2);
            expect(sel2.selectionValues())
                .toEqual(new Uint32Array([1]));
        });

        it("greaterThanOrEqualToSelected / smallerThanOrEqualToSelected", () => {
            const v = createVector(["apple", "banana", "cherry", "date"]);
            const sel1 = new FlatSelectionVector(new Uint32Array([1, 2, 3]));
            greaterThanOrEqualToStringFsstDictionarySelected(v, "cherry", sel1);
            expect(sel1.selectionValues())
                .toEqual(new Uint32Array([2, 3]));

            const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            smallerThanOrEqualToStringFsstDictionarySelected(v, "banana", sel2);
            expect(sel2.selectionValues())
                .toEqual(new Uint32Array([0, 1]));
        });

        it("matchSelected with no matching values empties selection", () => {
            const v = createVector(["a", "b", "c"]);
            const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            matchStringFsstDictionarySelected(v, ["x", "y"], sel);
            expect(sel.selectionValues())
                .toEqual(new Uint32Array([]));
        });
    });

    describe("StringFsstDictionaryUtil - Edge Cases", () => {
        it("handles unicode, emoji, empty strings, and case sensitivity", () => {
            const v1 = createVector(["café", "naïve", "café"]);
            expect(filterStringFsstDictionaryByValue(v1, "café").selectionValues())
                .toEqual(new Uint32Array([0, 2]));

            const v2 = createVector(["🚀", "🌟", "🚀"]);
            expect(filterStringFsstDictionaryByValue(v2, "🚀").selectionValues())
                .toEqual(new Uint32Array([0, 2]));

            const v3 = createVector(["", "a", "", "b"]);
            expect(filterStringFsstDictionaryByValue(v3, "").selectionValues())
                .toEqual(new Uint32Array([0, 2]));

            const v4 = createVector(["Apple", "apple", "APPLE"]);
            expect(filterStringFsstDictionaryByValue(v4, "apple").selectionValues())
                .toEqual(new Uint32Array([1]));
        });
    });
});
