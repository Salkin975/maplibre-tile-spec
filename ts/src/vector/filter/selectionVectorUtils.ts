import type { SelectionVector } from "./selectionVector";
import { FlatSelectionVector } from "./flatSelectionVector";
import { ConstSelectionVector } from "./constSelectionVector";
import type BitVector from "../flat/bitVector";

/** A selection over every index in `[0, size)`, with no per-index nullability to track. */
export function createSelectionVector(size: number): SelectionVector {
    return ConstSelectionVector.full(size);
}

/** A selection over every present (non-null) index in `[0, size)`, per `nullabilityBuffer`. */
export function createNullableSelectionVector(size: number, nullabilityBuffer?: BitVector): SelectionVector {
    const selectedIndices = new Uint32Array(size);
    let writeIndex = 0;
    for (let index = 0; index < size; index++) {
        if (!nullabilityBuffer || nullabilityBuffer.get(index)) selectedIndices[writeIndex++] = index;
    }
    return new FlatSelectionVector(selectedIndices, writeIndex);
}

/** Narrows `selection` to the indices that are present in `nullabilityBuffer`, if given. */
export function updateNullableSelectionVector(
    selection: SelectionVector,
    nullabilityBuffer?: BitVector | null,
): SelectionVector {
    if (!nullabilityBuffer) return selection;

    const limit = selection.limit;
    const selectedIndices = new Uint32Array(limit);
    let writeIndex = 0;
    for (let i = 0; i < limit; i++) {
        const index = selection.getIndex(i);
        if (nullabilityBuffer.get(index)) selectedIndices[writeIndex++] = index;
    }
    return new FlatSelectionVector(selectedIndices, writeIndex);
}

/** Selects the indices in `[0, size)` for which `matches` is true, narrows `selection` in place if given. */
export function scanSelection(
    size: number,
    matches: (index: number) => boolean,
    selection?: SelectionVector,
): SelectionVector {
    if (selection instanceof ConstSelectionVector) {
        if (selection.limit === 0) return selection;
        selection = undefined;
    }

    if (!selection) {
        const selectedIndices = new Uint32Array(size);
        let writeIndex = 0;
        for (let index = 0; index < size; index++) {
            if (matches(index)) selectedIndices[writeIndex++] = index;
        }
        if (writeIndex === 0) return ConstSelectionVector.empty(size);
        if (writeIndex === size) return ConstSelectionVector.full(size);
        return new FlatSelectionVector(selectedIndices, writeIndex);
    }

    const limit = selection.limit;
    let writeIndex = 0;
    for (let i = 0; i < limit; i++) {
        const index = selection.getIndex(i);
        if (matches(index)) selection.setIndex(writeIndex++, index);
    }
    selection.setLimit(writeIndex);
    return selection;
}

export function unionSelectionVectors(vectors: SelectionVector[], size: number): SelectionVector {
    if (vectors.length === 0) {
        return ConstSelectionVector.empty(size);
    }
    if (vectors.length === 1) {
        return vectors[0];
    }
    // A vector that covers the whole range makes the union the whole range
    if (vectors.some((vector) => vector.limit === size)) {
        return ConstSelectionVector.full(size);
    }

    const isSelected = new Uint8Array(size);
    let numSelected = 0;
    for (const vector of vectors) {
        for (let i = 0; i < vector.limit; i++) {
            const index = vector.getIndex(i);
            if (isSelected[index] === 0) {
                isSelected[index] = 1;
                numSelected++;
            }
        }
    }

    if (numSelected === 0) {
        return ConstSelectionVector.empty(size);
    }
    if (numSelected === size) {
        return ConstSelectionVector.full(size);
    }

    const selectedIndices = new Uint32Array(numSelected);
    let writeIndex = 0;
    for (let i = 0; i < size; i++) {
        if (isSelected[i] !== 0) selectedIndices[writeIndex++] = i;
    }
    return new FlatSelectionVector(selectedIndices);
}

export function invertSelectionVector(selectionVector: SelectionVector, size: number): SelectionVector {
    if (selectionVector.limit === 0) {
        return ConstSelectionVector.full(size);
    }
    if (selectionVector.limit === size) {
        return ConstSelectionVector.empty(size);
    }

    const isSelected = new Uint8Array(size);
    for (let i = 0; i < selectionVector.limit; i++) {
        isSelected[selectionVector.getIndex(i)] = 1;
    }

    const selectedIndices = new Uint32Array(size - selectionVector.limit);
    let writeIndex = 0;
    for (let i = 0; i < size; i++) {
        if (isSelected[i] === 0) {
            selectedIndices[writeIndex++] = i;
        }
    }
    return new FlatSelectionVector(selectedIndices, writeIndex);
}

export function intersectSelectionVectors(left: SelectionVector, right: SelectionVector): SelectionVector {
    if (left.limit === 0 || right.limit === 0) {
        return ConstSelectionVector.empty(Math.max(left.capacity, right.capacity));
    }

    // A full ConstSelectionVector is the identity, a FlatSelectionVector filling its capacity is not
    if (left instanceof ConstSelectionVector) return right;
    if (right instanceof ConstSelectionVector) return left;

    const selectedIndices = new Uint32Array(Math.min(left.limit, right.limit));
    let writeIndex = 0;
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < left.limit && rightIndex < right.limit) {
        const leftValue = left.getIndex(leftIndex);
        const rightValue = right.getIndex(rightIndex);
        if (leftValue === rightValue) {
            selectedIndices[writeIndex++] = leftValue;
            leftIndex++;
            rightIndex++;
        } else if (leftValue < rightValue) {
            leftIndex++;
        } else {
            rightIndex++;
        }
    }
    return new FlatSelectionVector(selectedIndices, writeIndex);
}
