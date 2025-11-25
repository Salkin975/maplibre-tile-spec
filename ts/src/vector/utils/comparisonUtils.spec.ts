import { describe, it, expect } from "vitest";
import { IntFlatVector } from "../flat/intFlatVector";
import BitVector from "../flat/bitVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import {
    smallerThanOrEqualToSelected,
    smallerThanOrEqualTo,
    greaterThanOrEqualTo,
    greaterThanOrEqualToSelected
} from "./index";


function createVector(values: number[], name = "test"): IntFlatVector {
    const data = new Int32Array(values);
    return new IntFlatVector(name, data, values.length);
}

function createNullableVector(values: number[], nullBits: number, name = "test"): IntFlatVector {
    const data = new Int32Array(values);
    const nullability = new Uint8Array([nullBits]);
    const bitVector = new BitVector(nullability, values.length);
    return new IntFlatVector(name, data, bitVector);
}

// int is used for base testing since it is the simplest datatype. Edge cases are tested separately in the according vector classes
describe("ComparisonVector tests", () => {
    describe("greaterThanOrEqualTo", () => {
        it("should filter >= threshold in simple vector", () => {
            const simpleVector: IntFlatVector = createVector([10, 20, 30, 40, 50, 60, 70, 80, 90]);
            const result = greaterThanOrEqualTo(simpleVector, 70);
            expect(result.selectionValues()).toEqual(new Uint32Array([6, 7, 8]));
        });

        it("should filter >= threshold with duplicates", () => {
            const withDuplicates = createVector([10, 20, 30, 20, 50, 10]);
            const result = greaterThanOrEqualTo(withDuplicates, 20);
            expect(result.selectionValues()).toEqual(new Uint32Array([1, 2, 3, 4]));
        });

        it("should filter >= threshold with nullability", () => {
            const withNulls = createNullableVector([10, 20, 30, 40, 50], 0b00010111);
            const result = greaterThanOrEqualTo(withNulls, 30);
            expect(result.selectionValues()).toEqual(new Uint32Array([2, 4]));
        });
    });

    describe("greaterThanOrEqualToSelected", () => {
        it("should filter >= from selection", () => {
            const simpleVector: IntFlatVector = createVector([10, 20, 30, 40, 50, 60, 70, 80, 90]);
            const selection = new FlatSelectionVector(new Uint32Array([0, 1, 3, 4, 6]));
            greaterThanOrEqualToSelected(simpleVector, 40, selection);
            expect(selection.selectionValues()).toEqual(new Uint32Array([3, 4, 6]));
        });

        it("should filter >= from selection with duplicates", () => {
            const withDuplicates = createVector([10, 20, 30, 20, 50, 10]);
            const selection = new FlatSelectionVector(new Uint32Array([1, 2, 3, 4, 5]));
            greaterThanOrEqualToSelected(withDuplicates, 20, selection);
            expect(selection.selectionValues()).toEqual(new Uint32Array([1, 2, 3, 4]));
        });

        it("should filter >= from selection with nullability", () => {
            const withNulls = createNullableVector([10, 20, 30, 40, 50], 0b00010111);
            const selection = new FlatSelectionVector(new Uint32Array([1, 2, 3, 4]));
            greaterThanOrEqualToSelected(withNulls, 30, selection);
            expect(selection.selectionValues()).toEqual(new Uint32Array([2, 4]));
        });
    });

    describe("smallerThanOrEqualTo", () => {
        it("should filter <= threshold in simple vector", () => {
            const simpleVector: IntFlatVector = createVector([10, 20, 30, 40, 50, 60, 70, 80, 90]);
            const result = smallerThanOrEqualTo(simpleVector, 50);
            expect(result.selectionValues()).toEqual(new Uint32Array([0, 1, 2, 3, 4]));
        });

        it("should filter <= threshold with duplicates", () => {
            const withDuplicates = createVector([10, 20, 30, 20, 50, 10]);
            const result = smallerThanOrEqualTo(withDuplicates, 30);
            expect(result.selectionValues()).toEqual(new Uint32Array([0, 1, 2, 3, 5]));
        });

        it("should filter <= threshold with nullability", () => {
            const withNulls = createNullableVector([10, 20, 30, 40, 50], 0b00010111);
            const result = smallerThanOrEqualTo(withNulls, 30);
            expect(result.selectionValues()).toEqual(new Uint32Array([0, 1, 2]));
        });
    });

    describe("smallerThanOrEqualToSelected", () => {
        it("should filter <= from selection", () => {
            const simpleVector: IntFlatVector = createVector([10, 20, 30, 40, 50, 60, 70, 80, 90]);
            const selection = new FlatSelectionVector(new Uint32Array([0, 2, 4, 6, 8]));
            smallerThanOrEqualToSelected(simpleVector, 50, selection);
            expect(selection.selectionValues()).toEqual(new Uint32Array([0, 2, 4]));
        });

        it("should filter <= from selection with duplicates", () => {
            const withDuplicates = createVector([10, 20, 30, 20, 50, 10]);
            const selection = new FlatSelectionVector(new Uint32Array([0, 1, 2, 4, 5]));
            smallerThanOrEqualToSelected(withDuplicates, 30, selection);
            expect(selection.selectionValues()).toEqual(new Uint32Array([0, 1, 2, 5]));
        });

        it("should filter <= from selection with nullability", () => {
            const withNulls = createNullableVector([10, 20, 30, 40, 50], 0b00010111);
            const selection = new FlatSelectionVector(new Uint32Array([0, 2, 3, 4]));
            smallerThanOrEqualToSelected(withNulls, 30, selection);
            expect(selection.selectionValues()).toEqual(new Uint32Array([0, 2]));
        });
    });
});
