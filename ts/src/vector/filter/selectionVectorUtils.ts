import { type SelectionVector } from "./selectionVector";
import { FlatSelectionVector } from "./flatSelectionVector";
import type BitVector from "../flat/bitVector";
import { SequenceSelectionVector } from "./sequenceSelectionVector";

/**
 * Creates a sequential selection vector selecting all indices [0, size).
 *
 * @param size - The number of elements to select
 * @returns A SequenceSelectionVector covering all indices
 */
export function createSelectionVector(size: number) {
    return new SequenceSelectionVector(0, 1, size);
}

/**
 * Creates a selection vector containing indices of non-null values.
 *
 * When no nullability buffer is provided, returns a dense vector selecting all indices.
 * Otherwise, scans the buffer and selects only indices where the bit is set (non-null).
 *
 * @param size - The total number of elements to consider
 * @param nullabilityBuffer - Optional bit vector where 1=non-null, 0=null. If undefined, all values are considered non-null.
 * @returns A FlatSelectionVector with the selected non-null indices
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
 *
 * Iterates over the indices in the input selection vector and keeps only those
 * where the nullability bit is set (non-null). Returns a new FlatSelectionVector.
 *
 * @param selectionVector - The input selection vector to filter
 * @param nullabilityBuffer - Optional bit vector where 1=non-null, 0=null. If undefined, all values are kept (no filtering).
 * @returns A new FlatSelectionVector with only non-null indices
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
 * Computes the union (OR) of multiple selection vectors using a bitset.
 *
 * Deduplicates indices across all input vectors. The result contains every
 * unique index that appears in at least one input vector, sorted ascending.
 * Used by the `any` compound filter operator.
 *
 * @param vectors - Array of selection vectors to union
 * @param totalSize - The total feature count (upper bound for indices)
 * @returns A SelectionVector containing all unique indices from all inputs
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
 * Inverts a selection vector (NOT operation).
 *
 * Returns all indices in [0, totalSize) that are NOT present in the input.
 * Uses a bitset for O(totalSize) time. Used by the `none`/`!` compound
 * filter operator and geometry type `!=` filters.
 *
 * @param selectionVector - The selection vector to invert
 * @param totalSize - The total feature count (defines the universe of indices)
 * @returns A FlatSelectionVector with all indices not in the input
 */
export function invertSelectionVector(selectionVector: SelectionVector, totalSize: number): SelectionVector {
    const bitset = new Uint8Array(Math.ceil(totalSize / 8));
    const values = selectionVector.selectionValues();
    for (let i = 0; i < selectionVector.limit; i++) {
        const idx = values[i];
        bitset[idx >> 3] |= 1 << (idx & 7);
    }

    const result = new Uint32Array(totalSize - selectionVector.limit);
    let writeIdx = 0;
    for (let i = 0; i < totalSize; i++) {
        if (!(bitset[i >> 3] & (1 << (i & 7)))) {
            result[writeIdx++] = i;
        }
    }

    return new FlatSelectionVector(result, writeIdx);
}

/**
 * Computes the intersection (AND) of two selection vectors.
 *
 * Returns only indices that appear in both inputs. Builds a Set from the
 * smaller vector and scans the larger one for O(n + m) time complexity.
 * Used by the `all` compound filter operator to combine child results.
 *
 * @param sel1 - First selection vector
 * @param sel2 - Second selection vector
 * @returns A FlatSelectionVector containing indices present in both inputs
 */
export function intersectSelectionVectors(sel1: SelectionVector, sel2: SelectionVector): SelectionVector {
    // Use the smaller one to build a set, scan the larger one
    const [smaller, larger] = sel1.limit <= sel2.limit ? [sel1, sel2] : [sel2, sel1];
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
