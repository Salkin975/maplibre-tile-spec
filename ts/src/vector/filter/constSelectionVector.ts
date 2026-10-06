import type { SelectionVector } from "./selectionVector";

export class ConstSelectionVector implements SelectionVector {
    /** Built on the first selectionValues() call, so later calls do not rebuild it. */
    private cachedSelectedIndices?: Uint32Array;

    private constructor(
        private readonly isFull: boolean,
        private readonly length: number,
    ) {}

    /** @inheritdoc */
    getIndex(index: number): number {
        if (!this.isFull || index < 0 || index >= this.length) {
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
        this.cachedSelectedIndices ??= this.buildSelectedIndices();
        return this.cachedSelectedIndices;
    }

    /** Every index in `[0, length)` when full, none when empty. */
    private buildSelectedIndices(): Uint32Array {
        const numSelected = this.isFull ? this.length : 0;
        const selectedIndices = new Uint32Array(numSelected);
        for (let i = 0; i < numSelected; i++) {
            selectedIndices[i] = i;
        }
        return selectedIndices;
    }

    /** @inheritdoc */
    get limit(): number {
        return this.isFull ? this.length : 0;
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
