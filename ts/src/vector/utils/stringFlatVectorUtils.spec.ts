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

describe("filterStringFlatByValue", () => {
    it("finds exact matches in string vector", () => {
        const v = createStringVector(["apple", "banana", "apple"]);
        expect(filterStringFlatByValue(v, "apple").selectionValues())
            .toEqual(new Uint32Array([0, 2]));
    });

    it("handles unicode characters correctly", () => {
        const v = createStringVector(["café", "naïve", "café"]);
        expect(filterStringFlatByValue(v, "café").selectionValues())
            .toEqual(new Uint32Array([0, 2]));
    });

    it("handles empty strings correctly", () => {
        const v = createStringVector(["", "a", "", "b"]);
        expect(filterStringFlatByValue(v, "").selectionValues())
            .toEqual(new Uint32Array([0, 2]));
    });

    it("returns empty selection when no matches found", () => {
        const v = createStringVector(["apple", "banana"]);
        expect(filterStringFlatByValue(v, "orange").selectionValues())
            .toEqual(new Uint32Array([]));
    });

    it("skips null values and only returns non-null matches", () => {
        const v = createNullableStringVector(["apple", null, "apple"]);
        expect(filterStringFlatByValue(v, "apple").selectionValues())
            .toEqual(new Uint32Array([0, 2]));
    });
});

describe("filterStringFlatSelected", () => {
    it("filters a pre-existing selection in-place", () => {
        const v = createStringVector(["apple", "banana", "apple", "date"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 2, 3]));
        filterStringFlatSelected(v, "apple", sel);
        expect(sel.selectionValues()).toEqual(new Uint32Array([0, 2]));
    });

    it("handles null values in the selection", () => {
        const v = createNullableStringVector(["apple", null, "apple"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
        filterStringFlatSelected(v, "apple", sel);
        expect(sel.selectionValues()).toEqual(new Uint32Array([0, 2]));
    });
});

describe("greaterThanOrEqualToStringFlat", () => {
    it("finds all values greater than or equal to threshold using lexicographic order", () => {
        const v = createStringVector(["aaa", "apple", "banana", "cherry", "date"]);
        expect(greaterThanOrEqualToStringFlat(v, "banana").selectionValues())
            .toEqual(new Uint32Array([2, 3, 4]));
    });

    it("handles string prefixes correctly in comparison", () => {
        const v = createStringVector(["app", "apple", "application"]);
        expect(greaterThanOrEqualToStringFlat(v, "apple").selectionValues())
            .toEqual(new Uint32Array([1, 2]));
    });

    it("returns empty selection when no values meet threshold", () => {
        const v = createStringVector(["aaa", "aab", "aac"]);
        expect(greaterThanOrEqualToStringFlat(v, "banana").selectionValues())
            .toEqual(new Uint32Array([]));
    });

    it("returns full selection when all values meet threshold", () => {
        const v = createStringVector(["banana", "cherry"]);
        expect(greaterThanOrEqualToStringFlat(v, "apple").selectionValues())
            .toEqual(new Uint32Array([0, 1]));
    });

    it("skips null values in comparison", () => {
        const v = createNullableStringVector(["apple", null, "banana", "cherry"]);
        expect(greaterThanOrEqualToStringFlat(v, "banana").selectionValues())
            .toEqual(new Uint32Array([2, 3]));
    });

    it("processes long strings using 8-byte chunked optimization", () => {
        const v = createStringVector(["verylongstring1", "verylongstring2", "verylongstring3"]);
        expect(greaterThanOrEqualToStringFlat(v, "verylongstring2").selectionValues())
            .toEqual(new Uint32Array([1, 2]));
    });

    it("returns early when first byte differs in long strings", () => {
        const v = createStringVector(["aaaaaaaa", "bbbbbbbb", "cccccccc"]);
        expect(greaterThanOrEqualToStringFlat(v, "bbbbbbbb").selectionValues())
            .toEqual(new Uint32Array([1, 2]));
    });
});

describe("smallerThanOrEqualToStringFlat", () => {
    it("finds all values smaller than or equal to threshold using lexicographic order", () => {
        const v = createStringVector(["aaa", "apple", "banana", "cherry", "date"]);
        expect(smallerThanOrEqualToStringFlat(v, "banana").selectionValues())
            .toEqual(new Uint32Array([0, 1, 2]));
    });

    it("handles string prefixes correctly in comparison", () => {
        const v = createStringVector(["app", "apple", "application"]);
        expect(smallerThanOrEqualToStringFlat(v, "apple").selectionValues())
            .toEqual(new Uint32Array([0, 1]));
    });

    it("returns empty selection when no values meet threshold", () => {
        const v = createStringVector(["banana", "cherry"]);
        expect(smallerThanOrEqualToStringFlat(v, "apple").selectionValues())
            .toEqual(new Uint32Array([]));
    });

    it("skips null values in comparison", () => {
        const v = createNullableStringVector(["apple", null, "banana", "cherry"]);
        expect(smallerThanOrEqualToStringFlat(v, "banana").selectionValues())
            .toEqual(new Uint32Array([0, 2]));
    });

    it("processes long strings using 8-byte chunked optimization", () => {
        const v = createStringVector(["verylongstring1", "verylongstring2", "verylongstring3"]);
        expect(smallerThanOrEqualToStringFlat(v, "verylongstring2").selectionValues())
            .toEqual(new Uint32Array([0, 1]));
    });

    it("reaches remainder byte processing in <= branch with 9-byte strings", () => {
        const v = createStringVector(["123456789", "234567890", "345678901"]);
        expect(smallerThanOrEqualToStringFlat(v, "234567890").selectionValues())
            .toEqual(new Uint32Array([0, 1]));
    });
});

describe("greaterThanOrEqualToStringFlatSelected", () => {
    it("filters a pre-existing selection to values >= threshold", () => {
        const v = createStringVector(["aaa", "apple", "banana", "cherry"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 2, 3]));
        greaterThanOrEqualToStringFlatSelected(v, "banana", sel);
        expect(sel.selectionValues()).toEqual(new Uint32Array([2, 3]));
    });
});

describe("smallerThanOrEqualToStringFlatSelected", () => {
    it("filters a pre-existing selection to values <= threshold", () => {
        const v = createStringVector(["aaa", "banana", "cherry"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2]));
        smallerThanOrEqualToStringFlatSelected(v, "banana", sel);
        expect(sel.selectionValues()).toEqual(new Uint32Array([0, 1]));
    });
});

describe("matchStringFlat", () => {
    it("returns indices of values matching a single item in list", () => {
        const v = createStringVector(["apple", "banana", "cherry", "apple", "date"]);
        expect(matchStringFlat(v, ["apple"]).selectionValues())
            .toEqual(new Uint32Array([0, 3]));
    });

    it("returns indices of values matching multiple items in list", () => {
        const v = createStringVector(["apple", "banana", "cherry", "apple", "date"]);
        expect(matchStringFlat(v, ["apple", "cherry"]).selectionValues())
            .toEqual(new Uint32Array([0, 2, 3]));
    });

    it("returns empty selection when given empty match list", () => {
        const v = createStringVector(["apple", "banana", "cherry", "apple", "date"]);
        expect(matchStringFlat(v, []).selectionValues())
            .toEqual(new Uint32Array([]));
    });

    it("uses length-based grouping optimization for efficient matching", () => {
        const v = createStringVector(["abc", "def", "ghi"]);
        expect(matchStringFlat(v, ["abc", "ghi"]).selectionValues())
            .toEqual(new Uint32Array([0, 2]));
    });
});

describe("noneMatchStringFlat", () => {
    it("returns indices of values not matching a single item in exclusion list", () => {
        const v = createStringVector(["apple", "banana", "cherry", "apple", "date"]);
        expect(noneMatchStringFlat(v, ["apple"]).selectionValues())
            .toEqual(new Uint32Array([1, 2, 4]));
    });

    it("returns indices of values not matching multiple items in exclusion list", () => {
        const v = createStringVector(["apple", "banana", "cherry", "apple", "date"]);
        expect(noneMatchStringFlat(v, ["apple", "cherry"]).selectionValues())
            .toEqual(new Uint32Array([1, 4]));
    });

    it("returns all indices when given empty exclusion list", () => {
        const v = createStringVector(["apple", "banana", "cherry", "apple", "date"]);
        expect(noneMatchStringFlat(v, []).selectionValues())
            .toEqual(new Uint32Array([0, 1, 2, 3, 4]));
    });
});

describe("matchStringFlatSelected", () => {
    it("filters a pre-existing selection to only indices matching the list", () => {
        const v = createStringVector(["apple", "banana", "cherry", "apple", "date"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2, 4]));
        matchStringFlatSelected(v, ["apple", "banana"], sel);
        expect(sel.selectionValues()).toEqual(new Uint32Array([0, 1]));
    });

    it("returns empty selection when no values in selection match the list", () => {
        const v = createStringVector(["apple", "banana", "cherry", "apple", "date"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1]));
        matchStringFlatSelected(v, ["cherry", "date"], sel);
        expect(sel.selectionValues()).toEqual(new Uint32Array([]));
    });
});

describe("noneMatchStringFlatSelected", () => {
    it("filters a pre-existing selection to only indices not matching the exclusion list", () => {
        const v = createNullableStringVector(["apple", null, "banana", "cherry"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
        noneMatchStringFlatSelected(v, ["apple", "banana"], sel);
        expect(sel.selectionValues()).toEqual(new Uint32Array([1, 3]));
    });
});

describe("filterStringFlatNotEqual", () => {
    it("returns indices where values differ from target", () => {
        const v = createStringVector(["apple", "banana", "cherry", "apple"]);
        expect(filterStringFlatNotEqual(v, "apple").selectionValues())
            .toEqual(new Uint32Array([1, 2]));
    });

    it("returns all indices when no values equal target", () => {
        const v = createStringVector(["apple", "banana"]);
        expect(filterStringFlatNotEqual(v, "orange").selectionValues())
            .toEqual(new Uint32Array([0, 1]));
    });

    it("returns empty selection when all values equal target", () => {
        const v = createStringVector(["test", "test"]);
        expect(filterStringFlatNotEqual(v, "test").selectionValues())
            .toEqual(new Uint32Array([]));
    });

    it("includes null values in the result of not-equal filter", () => {
        const v = createNullableStringVector(["apple", null, "banana", "apple"]);
        expect(filterStringFlatNotEqual(v, "apple").selectionValues())
            .toEqual(new Uint32Array([1, 2]));
    });

    it("handles empty strings in not-equal filter", () => {
        const v = createStringVector(["", "apple", "", "banana"]);
        expect(filterStringFlatNotEqual(v, "").selectionValues())
            .toEqual(new Uint32Array([1, 3]));
    });
});

describe("filterStringFlatNotEqualSelected", () => {
    it("filters a pre-existing selection to indices where values differ from target", () => {
        const v = createStringVector(["apple", "banana", "cherry", "apple"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 1, 2, 3]));
        filterStringFlatNotEqualSelected(v, "apple", sel);
        expect(sel.selectionValues()).toEqual(new Uint32Array([1, 2]));
    });

    it("returns empty selection when all selected values equal target", () => {
        const v = createStringVector(["apple", "banana", "apple"]);
        const sel = new FlatSelectionVector(new Uint32Array([0, 2]));
        filterStringFlatNotEqualSelected(v, "apple", sel);
        expect(sel.selectionValues()).toEqual(new Uint32Array([]));
    });
});
