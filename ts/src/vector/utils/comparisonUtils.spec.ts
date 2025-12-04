import { describe, it, expect } from "vitest";
import { IntFlatVector } from "../flat/intFlatVector";
import BitVector from "../flat/bitVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import {
    smallerThanOrEqualToSelected,
    smallerThanOrEqualTo,
    greaterThanOrEqualTo,
    greaterThanOrEqualToSelected
} from "./comparisonUtils";

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
function toArray(sv: { selectionValues: () => Uint32Array }): number[] {
    return Array.from(sv.selectionValues());
}

describe("ComparisonUtils Tests", () => {
    it("greaterThanOrEqualTo: IntFlatVector with and without nulls", () => {
        const v1 = createIntVector([10, 20, 30, 40, 50]);
        expect(toArray(greaterThanOrEqualTo(v1, 30))).toEqual([2, 3, 4]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        expect(toArray(greaterThanOrEqualTo(v2, 30))).toEqual([2, 4]);
    });

    it("greaterThanOrEqualToSelected: IntFlatVector with and without nulls", () => {
        const v1 = createIntVector([10, 20, 30, 40, 50]);
        const sel1 = new FlatSelectionVector(new Uint32Array([1, 2, 3, 4]));
        greaterThanOrEqualToSelected(v1, 30, sel1);
        expect(toArray(sel1)).toEqual([2, 3, 4]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        const sel2 = new FlatSelectionVector(new Uint32Array([1, 2, 3, 4]));
        greaterThanOrEqualToSelected(v2, 30, sel2);
        expect(toArray(sel2)).toEqual([2, 4]);
    });

    it("smallerThanOrEqualTo: IntFlatVector with and without nulls", () => {
        const v1 = createIntVector([10, 20, 30, 40, 50]);
        expect(toArray(smallerThanOrEqualTo(v1, 30))).toEqual([0, 1, 2]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        expect(toArray(smallerThanOrEqualTo(v2, 30))).toEqual([0, 1, 2]);
    });

    it("smallerThanOrEqualToSelected: IntFlatVector with and without nulls", () => {
        const v1 = createIntVector([10, 20, 30, 40, 50]);
        const sel1 = new FlatSelectionVector(new Uint32Array([0, 2, 3, 4]));
        smallerThanOrEqualToSelected(v1, 30, sel1);
        expect(toArray(sel1)).toEqual([0, 2]);

        const v2 = createNullableIntVector([10, 20, 30, 40, 50], 0b00010111);
        const sel2 = new FlatSelectionVector(new Uint32Array([0, 1, 2, 4]));
        smallerThanOrEqualToSelected(v2, 30, sel2);
        expect(toArray(sel2)).toEqual([0, 1, 2]);
    });
});
