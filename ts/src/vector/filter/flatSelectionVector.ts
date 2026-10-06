import type { SelectionVector } from "./selectionVector";

export class FlatSelectionVector implements SelectionVector {
    private _limit: number;

    constructor(
        private readonly _selectedIndices: Uint32Array,
        limit?: number,
    ) {
        this._limit = limit ?? this._selectedIndices.length;
    }

    /** @inheritdoc */
    getIndex(index: number): number {
        if (index >= this._limit || index < 0) {
            throw new RangeError("Index out of bounds");
        }

        return this._selectedIndices[index];
    }

    /** @inheritdoc */
    setIndex(index: number, value: number): void {
        if (index >= this._limit || index < 0) {
            throw new RangeError("Index out of bounds");
        }

        this._selectedIndices[index] = value;
    }

    /** @inheritdoc */
    setLimit(limit: number): void {
        if (limit < 0 || limit > this.capacity) {
            throw new RangeError("Limit out of bounds");
        }
        this._limit = limit;
    }

    /** @inheritdoc */
    selectionValues(): Uint32Array {
        if (this._limit === this._selectedIndices.length) {
            return this._selectedIndices;
        }
        return this._selectedIndices.subarray(0, this._limit);
    }

    /** @inheritdoc */
    get capacity() {
        return this._selectedIndices.length;
    }

    /** @inheritdoc */
    get limit() {
        return this._limit;
    }
}
