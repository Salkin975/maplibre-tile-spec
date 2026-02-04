import { type SelectionVector } from "./selectionVector";
import { FlatSelectionVector } from "./flatSelectionVector";
import type BitVector from "../flat/bitVector";
import { SequenceSelectionVector } from "./sequenceSelectionVector";

export function createSelectionVector(size: number) {
    return new SequenceSelectionVector(0, 1, size);
}

/**
 * Creates a selection vector containing indices of non-null values.
 * @param size - The total number of elements to consider
 * @param nullabilityBuffer - Optional bit vector where 1=not null, 0=null. If undefined/null, all values are considered non-null.
 */
export function createNullableSelectionVector(size: number, nullabilityBuffer?: BitVector): SelectionVector {
    if (!nullabilityBuffer) {
        const selectionVector = new Uint32Array(size);
        for (let i = 0; i < size; i++) {
            selectionVector[i] = i;
        }
        return new FlatSelectionVector(selectionVector);
    }
    let count = 0;
    for (let i = 0; i < size; i++) {
        if (nullabilityBuffer.get(i)) {
            count++;
        }
    }
    const selectionVector = new Uint32Array(count);
    let index = 0;
    for (let i = 0; i < size; i++) {
        if (nullabilityBuffer.get(i)) {
            selectionVector[index++] = i;
        }
    }
    return new FlatSelectionVector(selectionVector);
}

/**
 * Filters an existing selection vector to include only non-null values.
 * @param selectionVector - The input selection vector to filter
 * @param nullabilityBuffer - Optional bit vector where 1=not null, 0=null. If undefined/null, all values are considered non-null.
 */
export function updateNullableSelectionVector(
    selectionVector: SelectionVector,
    nullabilityBuffer?: BitVector,
): SelectionVector {
    const filteredIndices = new Uint32Array(selectionVector.limit);
    let index = 0;
    for (let i = 0; i < selectionVector.limit; i++) {
        const vectorIndex = selectionVector.getIndex(i);
        // Include index if no nullability buffer (all non-null) OR if bit is set (non-null)
        if (!nullabilityBuffer || nullabilityBuffer.get(vectorIndex)) {
            filteredIndices[index++] = vectorIndex;
        }
    }
    return new FlatSelectionVector(filteredIndices, index);
}

/**
 * Unions multiple selection vectors using a bitset. O(totalSize) time.
 */
export function unionSelectionVectors(vectors: SelectionVector[], totalSize: number): SelectionVector {
    if (vectors.length === 0) {
        return new FlatSelectionVector(new Uint32Array(0));
    }
    if (vectors.length === 1) {
        return vectors[0];
    }

    const bitset = new Uint8Array(Math.ceil(totalSize / 8));
    let count = 0;

    for (const sv of vectors) {
        const values = sv.selectionValues();
        for (let i = 0; i < sv.limit; i++) {
            const idx = values[i];
            const byteIdx = idx >> 3;
            const bitMask = 1 << (idx & 7);
            if (!(bitset[byteIdx] & bitMask)) {
                bitset[byteIdx] |= bitMask;
                count++;
            }
        }
    }

    const result = new Uint32Array(count);
    let writeIdx = 0;
    for (let i = 0; i < totalSize && writeIdx < count; i++) {
        if (bitset[i >> 3] & (1 << (i & 7))) {
            result[writeIdx++] = i;
        }
    }

    return new FlatSelectionVector(result);
}

/**
 * Inverts a selection vector: returns all indices in [0, totalSize) NOT in the input.
 */
export function invertSelectionVector(sv: SelectionVector, totalSize: number): SelectionVector {
    const bitset = new Uint8Array(Math.ceil(totalSize / 8));
    const values = sv.selectionValues();
    for (let i = 0; i < sv.limit; i++) {
        const idx = values[i];
        bitset[idx >> 3] |= 1 << (idx & 7);
    }

    const result = new Uint32Array(totalSize - sv.limit);
    let writeIdx = 0;
    for (let i = 0; i < totalSize; i++) {
        if (!(bitset[i >> 3] & (1 << (i & 7)))) {
            result[writeIdx++] = i;
        }
    }

    return new FlatSelectionVector(result, writeIdx);
}

/**
 * Intersects two selection vectors. Returns indices present in both.
 */
export function intersectSelectionVectors(a: SelectionVector, b: SelectionVector): SelectionVector {
    // Use the smaller one to build a set, scan the larger one
    const [smaller, larger] = a.limit <= b.limit ? [a, b] : [b, a];
    const set = new Set<number>();
    const smallerValues = smaller.selectionValues();
    for (let i = 0; i < smaller.limit; i++) {
        set.add(smallerValues[i]);
    }

    const result = new Uint32Array(smaller.limit);
    let writeIdx = 0;
    const largerValues = larger.selectionValues();
    for (let i = 0; i < larger.limit; i++) {
        const idx = largerValues[i];
        if (set.has(idx)) {
            result[writeIdx++] = idx;
        }
    }

    return new FlatSelectionVector(result, writeIdx);
}
