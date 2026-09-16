import { describe, it, expect } from "vitest";
import { ConstSelectionVector } from "./constSelectionVector";

describe("ConstSelectionVector", () => {
    it("selects everything when full and nothing when empty", () => {
        expect(ConstSelectionVector.full(4).limit).toBe(4);
        expect(ConstSelectionVector.empty(4).limit).toBe(0);
        expect(ConstSelectionVector.full(4).capacity).toBe(4);
        expect(ConstSelectionVector.empty(4).capacity).toBe(4);
    });

    it("is immutable", () => {
        const vector = ConstSelectionVector.full(4);
        expect(() => vector.setIndex()).toThrow();
        expect(() => vector.setLimit()).toThrow();
    });

    it("maps a full selection to the identity range", () => {
        expect(Array.from(ConstSelectionVector.full(4).selectionValues())).toEqual([0, 1, 2, 3]);
        expect(Array.from(ConstSelectionVector.empty(4).selectionValues())).toEqual([]);
    });

    /**
     * The whole point of this class is representing "all"/"nothing" without an index array, so
     * materialising `[0..length)` is the one thing it should not redo. Per the
     * `SelectionVector.selectionValues()` contract the result is a shared view, which is what
     * lets it be cached.
     */
    it("materialises its index range only once", () => {
        const full = ConstSelectionVector.full(1000);
        expect(full.selectionValues()).toBe(full.selectionValues());

        const empty = ConstSelectionVector.empty(1000);
        expect(empty.selectionValues()).toBe(empty.selectionValues());
    });
});
