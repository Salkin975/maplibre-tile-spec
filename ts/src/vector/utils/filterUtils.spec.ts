import { describe, it, expect } from "vitest";
import { IntFlatVector } from "../flat/intFlatVector";
import { StringDictionaryVector } from "../dictionary/stringDictionaryVector";
import { StringFsstDictionaryVector } from "../fsst-dictionary/stringFsstDictionaryVector";
import BitVector from "../flat/bitVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import {
    filterByValue,
    filterSelected,
    filterNotEqual,
    filterNotEqualSelected,
    match,
    matchSelected,
    noneMatch,
    noneMatchSelected,
} from "./filterUtils";

function createIntVector(values: number[]): IntFlatVector {
    const data = new Int32Array(values);
    return new IntFlatVector("test", data, values.length);
}

function createNullableIntVector(values: number[], nullBits: number): IntFlatVector {
    const data = new Int32Array(values);
    const nullability = new Uint8Array([nullBits]);
    const bitVector = new BitVector(nullability, values.length);
    return new IntFlatVector("test", data, bitVector);
}

function createStringDictVector(values: (string | null)[]): StringDictionaryVector {
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
    for (let i = 0; i < values.length; i++) {
        if (values[i] !== null) {
            indexBuffer[i] = uniqueValues.indexOf(values[i]);
        }
    }

    return new StringDictionaryVector("test", indexBuffer, offsetBuffer, dataBuffer, undefined);
}

function createStringFsstDictVector(values: string[]): StringFsstDictionaryVector {
    const encoder = new TextEncoder();
    const uniqueValues = Array.from(new Set(values));
    const encodedDict = uniqueValues.map(v => encoder.encode(v));

    const compressedSize = encodedDict.reduce((sum, v) => sum + v.length * 2, 0);
    const dictionaryBuffer = new Uint8Array(compressedSize);
    const offsetBuffer = new Int32Array(uniqueValues.length + 1);
    let compressedOffset = 0;
    let decompressedOffset = 0;
    offsetBuffer[0] = 0;

    for (let i = 0; i < encodedDict.length; i++) {
        const encoded = encodedDict[i];
        for (let j = 0; j < encoded.length; j++) {
            dictionaryBuffer[compressedOffset++] = 255;
            dictionaryBuffer[compressedOffset++] = encoded[j];
        }
        decompressedOffset += encoded.length;
        offsetBuffer[i + 1] = decompressedOffset;
    }

    const indexBuffer = new Int32Array(values.length);
    const nullabilityBytes = new Uint8Array(Math.ceil(values.length / 8));
    for (let i = 0; i < values.length; i++) {
        indexBuffer[i] = uniqueValues.indexOf(values[i]);
        const byteIndex = Math.floor(i / 8);
        const bitIndex = i % 8;
        nullabilityBytes[byteIndex] |= (1 << bitIndex);
    }

    const symbolOffsetBuffer = new Int32Array([0, 0]);
    const symbolTableBuffer = new Uint8Array(0);
    const bitVector = new BitVector(nullabilityBytes, values.length);

    return new StringFsstDictionaryVector("test", indexBuffer, offsetBuffer, dictionaryBuffer, symbolOffsetBuffer, symbolTableBuffer, bitVector);
}

function toArray(sv: { selectionValues: () => Uint32Array }): number[] {
    return Array.from(sv.selectionValues());
}

describe("FilterUtils Tests", () => {
    it("filterByValue: basic filtering and nullability", () => {
        const v1 = createIntVector([10, 20, 30, 20, 50]);
        expect(toArray(filterByValue(v1, 20))).toEqual([1, 3]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        expect(toArray(filterByValue(v2, 30))).toEqual([2]);
    });

    it("filterByValue: StringDictionaryVector path", () => {
        const v = createStringDictVector(["a", "b", "a", "c"]);
        expect(toArray(filterByValue(v, "a"))).toEqual([0, 2]);
    });

    it("filterByValue: StringFsstDictionaryVector path", () => {
        const v = createStringFsstDictVector(["a", "b", "a", "c"]);
        expect(toArray(filterByValue(v, "a"))).toEqual([0, 2]);
    });

    it("filterSelected: basic filtering and nullability", () => {
        const v1 = createIntVector([10, 20, 30, 20, 50]);
        const sel1 = new FlatSelectionVector(new Uint32Array([0, 1, 3, 4]));
        filterSelected(v1, 20, sel1);
        expect(toArray(sel1)).toEqual([1, 3]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        const sel2 = new FlatSelectionVector(new Uint32Array([0, 2, 3, 4]));
        filterSelected(v2, 30, sel2);
        expect(toArray(sel2)).toEqual([2]);
    });

    it("filterSelected: StringDictionaryVector path", () => {
        const v = createStringDictVector(["a", "b", "a", "c"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 2, 3]));
        filterSelected(v, "a", sel);
        expect(toArray(sel)).toEqual([0, 2]);
    });

    it("filterSelected: StringFsstDictionaryVector path", () => {
        const v = createStringFsstDictVector(["a", "b", "a", "c"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 2, 3]));
        filterSelected(v, "a", sel);
        expect(toArray(sel)).toEqual([0, 2]);
    });

    it("filterNotEqual: basic filtering and nullability", () => {
        const v1 = createIntVector([10, 20, 30, 20, 50]);
        expect(toArray(filterNotEqual(v1, 20))).toEqual([0, 2, 4]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        expect(toArray(filterNotEqual(v2, 30))).toEqual([0, 1, 3, 4]);
    });

    it("filterNotEqual: StringDictionaryVector path", () => {
        const v = createStringDictVector(["a", "b", "a", "c"]);
        expect(toArray(filterNotEqual(v, "a"))).toEqual([1, 3]);
    });

    it("filterNotEqual: StringFsstDictionaryVector path", () => {
        const v = createStringFsstDictVector(["a", "b", "a", "c"]);
        expect(toArray(filterNotEqual(v, "a"))).toEqual([1, 3]);
    });

    it("filterNotEqualSelected: basic filtering and nullability", () => {
        const v1 = createIntVector([10, 20, 30, 20, 50]);
        const sel1 = new FlatSelectionVector(new Uint32Array([1, 2, 3, 4]));
        filterNotEqualSelected(v1, 20, sel1);
        expect(toArray(sel1)).toEqual([2, 4]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        const sel2 = new FlatSelectionVector(new Uint32Array([0, 2, 3, 4]));
        filterNotEqualSelected(v2, 30, sel2);
        expect(toArray(sel2)).toEqual([0, 3, 4]);
    });

    it("filterNotEqualSelected: StringDictionaryVector path", () => {
        const v = createStringDictVector(["a", "b", "a", "c"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
        filterNotEqualSelected(v, "a", sel);
        expect(toArray(sel)).toEqual([1, 3]);
    });

    it("filterNotEqualSelected: StringFsstDictionaryVector path", () => {
        const v = createStringFsstDictVector(["a", "b", "a", "c"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
        filterNotEqualSelected(v, "a", sel);
        expect(toArray(sel)).toEqual([1, 3]);
    });

    it("match: basic filtering and nullability", () => {
        const v1 = createIntVector([10, 20, 30, 20, 50]);
        expect(toArray(match(v1, [10, 50]))).toEqual([0, 4]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        expect(toArray(match(v2, [10, 40]))).toEqual([0]);
    });

    it("match: StringDictionaryVector path", () => {
        const v = createStringDictVector(["a", "b", "c", "a"]);
        expect(toArray(match(v, ["a", "c"]))).toEqual([0, 2, 3]);
    });

    it("match: StringFsstDictionaryVector path", () => {
        const v = createStringFsstDictVector(["a", "b", "c", "a"]);
        expect(toArray(match(v, ["a", "c"]))).toEqual([0, 2, 3]);
    });

    it("matchSelected: basic filtering and nullability", () => {
        const v1 = createIntVector([10, 20, 30, 40, 50]);
        const sel1 = new FlatSelectionVector(new Uint32Array([0, 1, 3, 4]));
        matchSelected(v1, [20, 40], sel1);
        expect(toArray(sel1)).toEqual([1, 3]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        const sel2 = new FlatSelectionVector(new Uint32Array([0, 2, 3, 4]));
        matchSelected(v2, [10, 50], sel2);
        expect(toArray(sel2)).toEqual([0, 4]);
    });

    it("matchSelected: StringDictionaryVector path", () => {
        const v = createStringDictVector(["a", "b", "c", "a"]);
        const sel = new FlatSelectionVector(new Uint32Array([1, 2, 3]));
        matchSelected(v, ["a", "c"], sel);
        expect(toArray(sel)).toEqual([2, 3]);
    });

    it("matchSelected: StringFsstDictionaryVector path", () => {
        const v = createStringFsstDictVector(["a", "b", "c", "a"]);
        const sel = new FlatSelectionVector(new Uint32Array([1, 2, 3]));
        matchSelected(v, ["a", "c"], sel);
        expect(toArray(sel)).toEqual([2, 3]);
    });

    it("noneMatch: basic filtering and nullability", () => {
        const v1 = createIntVector([10, 20, 30, 20, 50]);
        expect(toArray(noneMatch(v1, [20, 50]))).toEqual([0, 2]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        expect(toArray(noneMatch(v2, [20, 40]))).toEqual([0, 2, 4]);
    });

    it("noneMatch: StringDictionaryVector path", () => {
        const v = createStringDictVector(["a", "b", "c", "a"]);
        expect(toArray(noneMatch(v, ["a", "c"]))).toEqual([1]);
    });

    it("noneMatch: StringFsstDictionaryVector path", () => {
        const v = createStringFsstDictVector(["a", "b", "c", "a"]);
        expect(toArray(noneMatch(v, ["a", "c"]))).toEqual([1]);
    });

    it("noneMatchSelected: basic filtering and nullability", () => {
        const v1 = createIntVector([10, 20, 30, 40, 50]);
        const sel1 = new FlatSelectionVector(new Uint32Array([1, 3, 4]));
        noneMatchSelected(v1, [20], sel1);
        expect(toArray(sel1)).toEqual([3, 4]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 4]));
        noneMatchSelected(v2, [10], sel2);
        expect(toArray(sel2)).toEqual([1, 2, 4]);
    });

    it("noneMatchSelected: StringDictionaryVector path", () => {
        const v = createStringDictVector(["a", "b", "c", "a"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
        noneMatchSelected(v, ["a", "c"], sel);
        expect(toArray(sel)).toEqual([1]);
    });

    it("noneMatchSelected: StringFsstDictionaryVector path", () => {
        const v = createStringFsstDictVector(["a", "b", "c", "a"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
        noneMatchSelected(v, ["a", "c"], sel);
        expect(toArray(sel)).toEqual([1]);
    });
});
