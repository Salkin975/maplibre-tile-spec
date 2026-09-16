import type { SelectionVector } from "./selectionVector";

export class ConstSelectionVector implements SelectionVector {
    /**
     * Materialised form of `selectionValues()`, built on first call and then shared.
     *
     * This class exists precisely to represent "all" / "nothing" *without* an index array, so
     * materialising `[0..length)` is the one operation that contradicts its purpose — doing it
     * again on every call would make a repeated caller quadratic. Sharing the array is safe
     * under the `SelectionVector.selectionValues()` contract (view onto internal state,
     * callers must not mutate).
     */
    private materialisedValues?: Uint32Array;

    private constructor(
        private readonly fullSelection: boolean,
        private readonly length: number,
    ) {}

    getIndex(index: number): number {
        if (!this.fullSelection || index < 0 || index >= this.length) {
            throw new RangeError("Index out of bounds");
        }
        return index;
    }

    setIndex(): void {
        throw new Error("ConstSelectionVector is immutable");
    }

    setLimit(): void {
        throw new Error("ConstSelectionVector is immutable");
    }

    selectionValues(): Uint32Array {
        if (this.materialisedValues) {
            return this.materialisedValues;
        }

        if (!this.fullSelection) {
            this.materialisedValues = new Uint32Array(0);
            return this.materialisedValues;
        }

        const values = new Uint32Array(this.length);
        for (let i = 0; i < this.length; i++) {
            values[i] = i;
        }
        this.materialisedValues = values;
        return values;
    }

    get limit(): number {
        return this.fullSelection ? this.length : 0;
    }

    get capacity(): number {
        return this.length;
    }

    static full(length: number): ConstSelectionVector {
        return new ConstSelectionVector(true, length);
    }

    static empty(length: number): ConstSelectionVector {
        return new ConstSelectionVector(false, length);
    }
}
