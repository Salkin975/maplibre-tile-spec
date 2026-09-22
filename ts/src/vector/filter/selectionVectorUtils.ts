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
    const indices = new Uint32Array(size);
    let writeIndex = 0;
    for (let index = 0; index < size; index++) {
        if (!nullabilityBuffer || nullabilityBuffer.get(index)) indices[writeIndex++] = index;
    }
    return new FlatSelectionVector(indices, writeIndex);
}

/** Narrows `selection` to the indices that are present in `nullabilityBuffer`, if given. */
export function updateNullableSelectionVector(
    selection: SelectionVector,
    nullabilityBuffer?: BitVector | null,
): SelectionVector {
    if (!nullabilityBuffer) return selection;

    const limit = selection.limit;
    const values = new Uint32Array(limit);
    let writeIndex = 0;
    for (let i = 0; i < limit; i++) {
        const index = selection.getIndex(i);
        if (nullabilityBuffer.get(index)) values[writeIndex++] = index;
    }
    return new FlatSelectionVector(values, writeIndex);
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
        const indices = new Uint32Array(size);
        let writeIndex = 0;
        for (let index = 0; index < size; index++) {
            if (matches(index)) indices[writeIndex++] = index;
        }
        if (writeIndex === 0) return ConstSelectionVector.empty(size);
        if (writeIndex === size) return ConstSelectionVector.full(size);
        return new FlatSelectionVector(indices, writeIndex);
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

export function unionSelectionVectors(vectors: SelectionVector[], totalSize: number): SelectionVector {
    if (vectors.length === 0) {
        return ConstSelectionVector.empty(totalSize);
    }
    if (vectors.length === 1) {
        return vectors[0];
    }
    // A vector that covers the whole range makes the union the whole range
    if (vectors.some((vector) => vector.limit === totalSize)) {
        return ConstSelectionVector.full(totalSize);
    }

    const selected = new Uint8Array(totalSize);
    let selectedCount = 0;
    for (const vector of vectors) {
        for (let i = 0; i < vector.limit; i++) {
            const index = vector.getIndex(i);
            if (selected[index] === 0) {
                selected[index] = 1;
                selectedCount++;
            }
        }
    }

    if (selectedCount === 0) {
        return ConstSelectionVector.empty(totalSize);
    }
    if (selectedCount === totalSize) {
        return ConstSelectionVector.full(totalSize);
    }

    const values = new Uint32Array(selectedCount);
    let writeIndex = 0;
    for (let i = 0; i < totalSize; i++) {
        if (selected[i] !== 0) values[writeIndex++] = i;
    }
    return new FlatSelectionVector(values);
}

export function invertSelectionVector(selectionVector: SelectionVector, totalSize: number): SelectionVector {
    if (selectionVector.limit === 0) {
        return ConstSelectionVector.full(totalSize);
    }
    if (selectionVector.limit === totalSize) {
        return ConstSelectionVector.empty(totalSize);
    }

    const selected = new Uint8Array(totalSize);
    for (let i = 0; i < selectionVector.limit; i++) {
        selected[selectionVector.getIndex(i)] = 1;
    }

    const values = new Uint32Array(totalSize - selectionVector.limit);
    let writeIndex = 0;
    for (let i = 0; i < totalSize; i++) {
        if (selected[i] === 0) {
            values[writeIndex++] = i;
        }
    }
    return new FlatSelectionVector(values, writeIndex);
}

export function intersectSelectionVectors(left: SelectionVector, right: SelectionVector): SelectionVector {
    if (left.limit === 0 || right.limit === 0) {
        return ConstSelectionVector.empty(Math.max(left.capacity, right.capacity));
    }

    // A full ConstSelectionVector is the identity, a FlatSelectionVector filling its capacity is not
    if (left instanceof ConstSelectionVector) return right;
    if (right instanceof ConstSelectionVector) return left;

    const values = new Uint32Array(Math.min(left.limit, right.limit));
    let writeIndex = 0;
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < left.limit && rightIndex < right.limit) {
        const leftValue = left.getIndex(leftIndex);
        const rightValue = right.getIndex(rightIndex);
        if (leftValue === rightValue) {
            values[writeIndex++] = leftValue;
            leftIndex++;
            rightIndex++;
        } else if (leftValue < rightValue) {
            leftIndex++;
        } else {
            rightIndex++;
        }
    }
    return new FlatSelectionVector(values, writeIndex);
}
