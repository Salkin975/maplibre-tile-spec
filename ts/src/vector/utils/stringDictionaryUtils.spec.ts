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
} from "./stringDictionaryUtils";

// ============================================================================
// Helpers
// ============================================================================

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
    const nullabilityBytes = values.some(v => v === null) ? new Uint8Array(Math.ceil(values.length / 8)) : undefined;

    for (let i = 0; i < values.length; i++) {
        if (values[i] !== null) {
            indexBuffer[i] = uniqueValues.indexOf(values[i]);
            if (nullabilityBytes) {
                const byteIndex = Math.floor(i / 8);
                const bitIndex = i % 8;
                nullabilityBytes[byteIndex] |= (1 << bitIndex);
            }
        } else {
            indexBuffer[i] = 0;
        }
    }

    const bitVector = nullabilityBytes ? new BitVector(nullabilityBytes, values.length) : undefined;
    return new StringDictionaryVector("test", indexBuffer, offsetBuffer, dataBuffer, bitVector);
}

// ============================================================================
// Tests
// ============================================================================

describe("StringDictionaryUtil Tests", () => {
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

    it("comparison operations", () => {
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
        expect(sel1.selectionValues())
            .toEqual(new Uint32Array([0, 2, 4]));

        const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
        filterStringDictionaryNotEqualSelected(v, "a", sel2);
        expect(sel2.selectionValues())
            .toEqual(new Uint32Array([1, 3]));
    });

    it("matchSelected and noneMatchSelected", () => {
        const v = createVector(["a", "b", "c", "a", "d"]);
        const sel1 = new FlatSelectionVector(new Uint32Array([1, 2, 3, 4]));
        matchStringDictionarySelected(v, ["a", "c"], sel1);
        expect(sel1.selectionValues())
            .toEqual(new Uint32Array([2, 3]));

        const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
        noneMatchStringDictionarySelected(v, ["a", "c"], sel2);
        expect(sel2.selectionValues())
            .toEqual(new Uint32Array([1]));
    });

    it("greaterThanOrEqualToSelected and smallerThanOrEqualToSelected", () => {
        const v = createVector(["apple", "banana", "cherry", "date"]);
        const sel1 = new FlatSelectionVector(new Uint32Array([1, 2, 3]));
        greaterThanOrEqualToStringDictionarySelected(v, "cherry", sel1);
        expect(sel1.selectionValues())
            .toEqual(new Uint32Array([2, 3]));

        const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
        smallerThanOrEqualToStringDictionarySelected(v, "banana", sel2);
        expect(sel2.selectionValues())
            .toEqual(new Uint32Array([0, 1]));
    });

    it("edge cases with not found values", () => {
        const v = createVector(["a", "b", "c"]);
        expect(filterStringDictionaryByValue(v, "x").selectionValues())
            .toEqual(new Uint32Array([]));
        expect(matchStringDictionary(v, ["x", "y"]).selectionValues())
            .toEqual(new Uint32Array([]));

        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
        filterStringDictionarySelected(v, "x", sel);
        expect(sel.selectionValues())
            .toEqual(new Uint32Array([]));
    });

    it("handles nulls with filterNotEqualSelected", () => {
        const v = createVector(["a", null, "b", "a"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
        filterStringDictionaryNotEqualSelected(v, "a", sel);
        expect(sel.selectionValues())
            .toEqual(new Uint32Array([1, 2]));
    });

    it("noneMatch includes nulls", () => {
        const v = createVector(["a", null, "b", null]);
        expect(noneMatchStringDictionary(v, ["a"]).selectionValues())
            .toEqual(new Uint32Array([1, 2, 3]));
    });

    it("matchSelected with no matches empties selection", () => {
        const v = createVector(["a", "b", "c"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
        matchStringDictionarySelected(v, ["x", "y"], sel);
        expect(sel.selectionValues())
            .toEqual(new Uint32Array([]));
    });

    it("sortDictionary sorts dictionary entries lexicographically", () => {
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
        expect(sorted)
            .toEqual(new Uint32Array([1, 2, 0])); // apple, banana, cherry
    });

    it("binarySearchDictionary finds value in sorted dictionary", () => {
        const encoder = new TextEncoder();
        const values = ["apple", "banana", "cherry"];
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

        const sortedIndices = new Uint32Array([0, 1, 2]); // Already sorted
        const indexBuffer = new Int32Array([0, 1, 2, 1]);
        const v = new StringDictionaryVector("test", indexBuffer, offsetBuffer, dataBuffer, undefined, sortedIndices);

        expect(binarySearchDictionary(v, encoder.encode("banana")))
            .toBe(1);
        expect(binarySearchDictionary(v, encoder.encode("aaa")))
            .toBe(-1); // Less than "apple"
        expect(filterStringDictionaryByValue(v, "banana").selectionValues())
            .toEqual(new Uint32Array([1, 3]));
    });
});
