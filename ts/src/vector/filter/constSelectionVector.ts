import type { SelectionVector } from "./selectionVector";

export class ConstSelectionVector implements SelectionVector {
    // materialized values are cached to avoid re-creating the array on every call to selectionValues()
    private materialisedValues?: Uint32Array;

    private constructor(
        private readonly fullSelection: boolean,
        private readonly length: number,
    ) {}

    /** @inheritdoc */
    getIndex(index: number): number {
        if (!this.fullSelection || index < 0 || index >= this.length) {
            throw new RangeError("Index out of bounds");
        }
        return index;
    }

    /** @inheritdoc */
    setIndex(): void {
        throw new Error("ConstSelectionVector is immutable");
    }

    /** @inheritdoc */
    setLimit(): void {
        throw new Error("ConstSelectionVector is immutable");
    }

    /** @inheritdoc */
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

    /** @inheritdoc */
    get limit(): number {
        return this.fullSelection ? this.length : 0;
    }

    /** @inheritdoc */
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
