import { describe, it, expect } from "vitest";
import { StringDictionaryVector } from "../dictionary/stringDictionaryVector";
import BitVector from "../flat/bitVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import {
    filterStringDictionaryByValue,
    filterStringDictionarySelected,
    filterStringDictionaryNotEqual,
    filterStringDictionaryNotEqualSelected,
    matchStringDictionary,
    matchStringDictionarySelected,
    noneMatchStringDictionary,
    noneMatchStringDictionarySelected,
    greaterThanOrEqualToStringDictionary,
    greaterThanOrEqualToStringDictionarySelected,
    smallerThanOrEqualToStringDictionary,
    smallerThanOrEqualToStringDictionarySelected,
    sortDictionary,
    binarySearchDictionary,
    findDictionaryIndex,
} from "./stringDictionaryUtils";

function createVector(values: (string | null)[]): StringDictionaryVector {
    const encoder = new TextEncoder();
    const nonNullValues = values.filter((v): v is string => v !== null);
    const uniqueValues = Array.from(new Set(nonNullValues));
    const encodedDict = uniqueValues.map(v => encoder.encode(v));

    const dictSize = encodedDict.reduce((sum, v) => sum + v.length, 0);
    const offsetBuffer = new Int32Array(uniqueValues.length + 1);
    const dataBuffer = new Uint8Array(dictSize);

    let currentOffset = 0;
    offsetBuffer[0] = 0;
    for (let i = 0; i < encodedDict.length; i++) {
        dataBuffer.set(encodedDict[i], currentOffset);
        currentOffset += encodedDict[i].length;
        offsetBuffer[i + 1] = currentOffset;
    }

    const indexBuffer = new Int32Array(values.length);
    const nullabilityBytes = values.some(v => v === null)
        ? new Uint8Array(Math.ceil(values.length / 8))
        : undefined;

    for (let i = 0; i < values.length; i++) {
        if (values[i] !== null) {
            indexBuffer[i] = uniqueValues.indexOf(values[i]);
            if (nullabilityBytes) {
                const byteIndex = Math.floor(i / 8);
                const bitIndex = i % 8;
                nullabilityBytes[byteIndex] |= 1 << bitIndex;
            }
        } else {
            indexBuffer[i] = 0;
        }
    }

    const bitVector = nullabilityBytes
        ? new BitVector(nullabilityBytes, values.length)
        : undefined;
    return new StringDictionaryVector("test", indexBuffer, offsetBuffer, dataBuffer, bitVector);
}

describe("StringDictionaryUtil Tests", () => {
    describe("Core operations", () => {
        it("filterByValue and filterNotEqual", () => {
            const v = createVector(["a", "b", "a", "c"]);
            expect(filterStringDictionaryByValue(v, "a").selectionValues())
                .toEqual(new Uint32Array([0, 2]));
            expect(filterStringDictionaryNotEqual(v, "a").selectionValues())
                .toEqual(new Uint32Array([1, 3]));
        });

        it("match and noneMatch", () => {
            const v = createVector(["a", "b", "c", "a", "d"]);
            expect(matchStringDictionary(v, ["a", "c"]).selectionValues())
                .toEqual(new Uint32Array([0, 2, 3]));
            expect(noneMatchStringDictionary(v, ["a", "c"]).selectionValues())
                .toEqual(new Uint32Array([1, 4]));
        });

        it("comparison operations (>= and <=)", () => {
            const v = createVector(["apple", "banana", "cherry", "date"]);
            expect(greaterThanOrEqualToStringDictionary(v, "cherry").selectionValues())
                .toEqual(new Uint32Array([2, 3]));
            expect(smallerThanOrEqualToStringDictionary(v, "banana").selectionValues())
                .toEqual(new Uint32Array([0, 1]));
        });

        it("filterSelected and filterNotEqualSelected", () => {
            const v = createVector(["a", "b", "a", "c", "a"]);
            const sel1 = new FlatSelectionVector(new Uint32Array([0, 2, 3, 4]));
            filterStringDictionarySelected(v, "a", sel1);
            expect(sel1.selectionValues()).toEqual(new Uint32Array([0, 2, 4]));

            const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
            filterStringDictionaryNotEqualSelected(v, "a", sel2);
            expect(sel2.selectionValues()).toEqual(new Uint32Array([1, 3]));
        });

        it("matchSelected and noneMatchSelected", () => {
            const v = createVector(["a", "b", "c", "a", "d"]);
            const sel1 = new FlatSelectionVector(new Uint32Array([1, 2, 3, 4]));
            matchStringDictionarySelected(v, ["a", "c"], sel1);
            expect(sel1.selectionValues()).toEqual(new Uint32Array([2, 3]));

            const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            noneMatchStringDictionarySelected(v, ["a", "c"], sel2);
            expect(sel2.selectionValues()).toEqual(new Uint32Array([1]));
        });

        it("comparison selected operations", () => {
            const v = createVector(["apple", "banana", "cherry", "date"]);
            const sel1 = new FlatSelectionVector(new Uint32Array([1, 2, 3]));
            greaterThanOrEqualToStringDictionarySelected(v, "cherry", sel1);
            expect(sel1.selectionValues()).toEqual(new Uint32Array([2, 3]));

            const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            smallerThanOrEqualToStringDictionarySelected(v, "banana", sel2);
            expect(sel2.selectionValues()).toEqual(new Uint32Array([0, 1]));
        });
    });

    describe("Dictionary operations", () => {
        it("sortDictionary and binarySearch", () => {
            const encoder = new TextEncoder();
            const values = ["cherry", "apple", "banana"];
            const encoded = values.map(v => encoder.encode(v));
            const dictSize = encoded.reduce((sum, v) => sum + v.length, 0);
            const offsetBuffer = new Int32Array(values.length + 1);
            const dataBuffer = new Uint8Array(dictSize);

            let offset = 0;
            offsetBuffer[0] = 0;
            for (let i = 0; i < encoded.length; i++) {
                dataBuffer.set(encoded[i], offset);
                offset += encoded[i].length;
                offsetBuffer[i + 1] = offset;
            }

            const sorted = sortDictionary(offsetBuffer, dataBuffer, 3);
            expect(sorted).toEqual(new Uint32Array([1, 2, 0])); // apple, banana, cherry

            const sortedIndices = new Uint32Array([0, 1, 2]);
            const sortedValues = ["apple", "banana", "cherry"];
            const sortedEncoded = sortedValues.map(v => encoder.encode(v));
            const sortedDictSize = sortedEncoded.reduce((sum, v) => sum + v.length, 0);
            const sortedOffsetBuffer = new Int32Array(sortedValues.length + 1);
            const sortedDataBuffer = new Uint8Array(sortedDictSize);

            let sortedOffset = 0;
            sortedOffsetBuffer[0] = 0;
            for (let i = 0; i < sortedEncoded.length; i++) {
                sortedDataBuffer.set(sortedEncoded[i], sortedOffset);
                sortedOffset += sortedEncoded[i].length;
                sortedOffsetBuffer[i + 1] = sortedOffset;
            }

            const indexBuffer = new Int32Array([0, 1, 2]);
            const v = new StringDictionaryVector(
                "test",
                indexBuffer,
                sortedOffsetBuffer,
                sortedDataBuffer,
                undefined,
                sortedIndices,
            );

            expect(binarySearchDictionary(v, encoder.encode("banana"))).toBe(1);
            expect(binarySearchDictionary(v, encoder.encode("zebra"))).toBe(-1);
            expect(binarySearchDictionary(v, encoder.encode("aaa"))).toBe(-1);

            expect(findDictionaryIndex(v, encoder.encode("apple"))).toBe(0);
            expect(findDictionaryIndex(v, encoder.encode("banana"))).toBe(1);
        });

        it("findDictionaryIndex with unsorted vector", () => {
            const encoder = new TextEncoder();
            const unsortedValues = ["cherry", "apple", "banana"];
            const encoded = unsortedValues.map(v => encoder.encode(v));
            const dictSize = encoded.reduce((sum, v) => sum + v.length, 0);
            const offsetBuffer = new Int32Array(unsortedValues.length + 1);
            const dataBuffer = new Uint8Array(dictSize);

            let offset = 0;
            offsetBuffer[0] = 0;
            for (let i = 0; i < encoded.length; i++) {
                dataBuffer.set(encoded[i], offset);
                offset += encoded[i].length;
                offsetBuffer[i + 1] = offset;
            }

            const indexBuffer = new Int32Array([0, 1, 2]);
            const unsorted = new StringDictionaryVector(
                "test",
                indexBuffer,
                offsetBuffer,
                dataBuffer,
                undefined,
            );

            expect(findDictionaryIndex(unsorted, encoder.encode("apple"))).toBe(1);
            expect(findDictionaryIndex(unsorted, encoder.encode("notfound"))).toBe(-1);
            expect(binarySearchDictionary(unsorted, encoder.encode("apple"))).toBe(-1);
        });
    });

    describe("Edge cases", () => {
        it("handles empty and null vectors", () => {
            const empty = createVector([]);
            expect(filterStringDictionaryByValue(empty, "a").selectionValues())
                .toEqual(new Uint32Array([]));

            const allNulls = createVector([null, null, null]);
            expect(filterStringDictionaryByValue(allNulls, "a").selectionValues())
                .toEqual(new Uint32Array([]));
            expect(filterStringDictionaryNotEqual(allNulls, "a").selectionValues())
                .toEqual(new Uint32Array([0, 1, 2]));
        });

        it("handles nulls with operations", () => {
            const v = createVector(["a", null, "b", "a"]);
            const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
            filterStringDictionaryNotEqualSelected(v, "a", sel);
            expect(sel.selectionValues()).toEqual(new Uint32Array([1, 2]));

            const v2 = createVector(["a", null, "b", null]);
            expect(noneMatchStringDictionary(v2, ["a"]).selectionValues())
                .toEqual(new Uint32Array([1, 2, 3]));

            const v3 = createVector([null, "a", "b", null, "c"]);
            const sel3 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3, 4]));
            noneMatchStringDictionarySelected(v3, ["a", "b"], sel3);
            expect(sel3.selectionValues()).toEqual(new Uint32Array([0, 3, 4]));
        });

        it("handles not found values and empty arrays", () => {
            const v = createVector(["a", "b", "c"]);
            expect(filterStringDictionaryByValue(v, "x").selectionValues())
                .toEqual(new Uint32Array([]));
            expect(matchStringDictionary(v, []).selectionValues())
                .toEqual(new Uint32Array([]));
            expect(noneMatchStringDictionary(v, []).selectionValues())
                .toEqual(new Uint32Array([0, 1, 2]));

            const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            filterStringDictionarySelected(v, "x", sel);
            expect(sel.selectionValues()).toEqual(new Uint32Array([]));
        });

        it("comparison edge cases", () => {
            const v = createVector(["apple", "banana", "cherry"]);
            expect(greaterThanOrEqualToStringDictionary(v, "banana").selectionValues())
                .toEqual(new Uint32Array([1, 2]));
            expect(smallerThanOrEqualToStringDictionary(v, "banana").selectionValues())
                .toEqual(new Uint32Array([0, 1]));

            const v2 = createVector(["apple", "cherry"]);
            expect(greaterThanOrEqualToStringDictionary(v2, "banana").selectionValues())
                .toEqual(new Uint32Array([1]));
            expect(smallerThanOrEqualToStringDictionary(v2, "banana").selectionValues())
                .toEqual(new Uint32Array([0]));

            expect(greaterThanOrEqualToStringDictionary(v, "z").selectionValues())
                .toEqual(new Uint32Array([]));

            const v3 = createVector([null, "a", "b", null]);
            expect(greaterThanOrEqualToStringDictionary(v3, "a").selectionValues())
                .toEqual(new Uint32Array([1, 2]));
        });

        it("comparison selected with no matches", () => {
            const v = createVector(["b", "c", "d"]);
            const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
            greaterThanOrEqualToStringDictionarySelected(v, "z", sel);
            expect(sel.selectionValues()).toEqual(new Uint32Array([]));
        });

        it("handles duplicate values", () => {
            const v = createVector(["a", "b", "a", "a", "b"]);
            expect(filterStringDictionaryByValue(v, "a").selectionValues())
                .toEqual(new Uint32Array([0, 2, 3]));

            const v2 = createVector(["a", "b", "c"]);
            expect(matchStringDictionary(v2, ["a", "a", "c"]).selectionValues())
                .toEqual(new Uint32Array([0, 2]));
        });

        it("handles no matching edge cases", () => {
            const v = createVector(["a", "a", "a"]);
            expect(filterStringDictionaryNotEqual(v, "a").selectionValues())
                .toEqual(new Uint32Array([]));
        });

        it("handles UTF-8 multi-byte characters", () => {
            const v = createVector(["café", "naïve", "résumé"]);
            expect(filterStringDictionaryByValue(v, "café").selectionValues())
                .toEqual(new Uint32Array([0]));
            expect(greaterThanOrEqualToStringDictionary(v, "naïve").selectionValues())
                .toEqual(new Uint32Array([1, 2]));
        });

        it("handles strings of different lengths in sort", () => {
            const encoder = new TextEncoder();
            const values = ["z", "aaa", "aa"];
            const encoded = values.map(v => encoder.encode(v));
            const dictSize = encoded.reduce((sum, v) => sum + v.length, 0);
            const offsetBuffer = new Int32Array(values.length + 1);
            const dataBuffer = new Uint8Array(dictSize);

            let offset = 0;
            offsetBuffer[0] = 0;
            for (let i = 0; i < encoded.length; i++) {
                dataBuffer.set(encoded[i], offset);
                offset += encoded[i].length;
                offsetBuffer[i + 1] = offset;
            }

            const sorted = sortDictionary(offsetBuffer, dataBuffer, 3);
            expect(sorted).toEqual(new Uint32Array([2, 1, 0])); // aa, aaa, z
        });

        it("handles empty string comparisons", () => {
            const v = createVector(["", "a", "b"]);
            expect(greaterThanOrEqualToStringDictionary(v, "").selectionValues())
                .toEqual(new Uint32Array([0, 1, 2]));
        });
    });
});
