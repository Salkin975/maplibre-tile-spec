import type BitVector from "./flat/bitVector";
import { type SelectionVector } from "./filter/selectionVector";
import { FlatSelectionVector } from "./filter/flatSelectionVector";
import BaseVector from "./baseVector";

export default abstract class ComparisonVector<T extends ArrayBufferView = ArrayBufferView, K = unknown> extends BaseVector<T, K> {
    constructor(
        name: string,
        dataBuffer: T,
        sizeOrNullabilityBuffer: number | BitVector,
    ) {
        super(name, dataBuffer, sizeOrNullabilityBuffer);
    }

    greaterThanOrEqualTo(value: K): SelectionVector {
        const selectionVector = new Uint32Array(this._size);
        let index = 0;
        for (let i = 0; i < this._size; i++) {
            if (this.has(i) && this.getValue(i) >= value) {
                selectionVector[index++] = i;
            }
        }
        return new FlatSelectionVector(selectionVector, index);
    }

    smallerThanOrEqualTo(value: K): SelectionVector {
        const selectionVector = new Uint32Array(this._size);
        let index = 0;
        for (let i = 0; i < this._size; i++) {
            if (this.has(i) && this.getValue(i) <= value) {
                selectionVector[index++] = i;
            }
        }
        return new FlatSelectionVector(selectionVector, index);
    }

    greaterThanOrEqualToSelected(value: K, selectionVector: SelectionVector): void {
        let writeIndex = 0;
        const vector = selectionVector.selectionValues();
        for (let i = 0; i < selectionVector.limit; i++) {
            const index = vector[i];
            if (this.has(index) && this.getValue(index) >= value) {
                selectionVector.setIndex(writeIndex++, index);
            }
        }
        selectionVector.setLimit(writeIndex);
    }

    smallerThanOrEqualToSelected(value: K, selectionVector: SelectionVector): void {
        let writeIndex = 0;
        const vector = selectionVector.selectionValues();
        for (let i = 0; i < selectionVector.limit; i++) {
            const index = vector[i];
            if (this.has(index) && this.getValue(index) <= value) {
                selectionVector.setIndex(writeIndex++, index);
            }
        }
        selectionVector.setLimit(writeIndex);
    }
}
