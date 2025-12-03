import type Vector from "../vector";
import { type SelectionVector } from "../filter/selectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import { StringDictionaryVector } from "../dictionary/stringDictionaryVector";
import { StringFsstDictionaryVector } from "../fsst-dictionary/stringFsstDictionaryVector";
import {
    filterStringDictionaryByValue,
    filterStringDictionarySelected,
    filterStringDictionaryNotEqual,
    filterStringDictionaryNotEqualSelected,
    matchStringDictionary,
    matchStringDictionarySelected,
    noneMatchStringDictionary,
    noneMatchStringDictionarySelected,
} from "./stringDictionaryUtils";
import {
    filterStringFsstDictionaryByValue,
    filterStringFsstDictionarySelected,
    filterStringFsstDictionaryByValueNotEqual,
    filterStringFsstDictionarySelectedNotEqual,
    matchStringFsstDictionary,
    matchStringFsstDictionarySelected,
    noneMatchStringFsstDictionary,
    noneMatchStringFsstDictionarySelected,
} from "./stringFsstDictionaryUtil";

/**
 * Returns a SelectionVector containing indices of all non-null values in the vector.
 *
 * @param vector The vector to filter
 * @returns SelectionVector with indices where values are present (non-null)
 */
export function createNonNullSelectionVector<K>(vector: Vector<ArrayBufferView, K>): SelectionVector {
    const selectionVector = new Uint32Array(vector.size);
    let index = 0;
    for (let i = 0; i < vector.size; i++) {
        if (vector.has(i)) {
            selectionVector[index++] = i;
        }
    }
    return new FlatSelectionVector(selectionVector, index);
}

/**
 * Filters an existing SelectionVector to only include indices where the vector has non-null values.
 * Updates the SelectionVector in-place.
 *
 * @param vector The vector to check for non-null values
 * @param selectionVector The SelectionVector to filter (modified in-place)
 * @returns The filtered SelectionVector (same reference as input)
 */
export function filterNonNullSelected<K>(
    vector: Vector<ArrayBufferView, K>,
    selectionVector: SelectionVector
): SelectionVector {
    let writeIndex = 0;
    const vectorValues = selectionVector.selectionValues();
    for (let i = 0; i < selectionVector.limit; i++) {
        const index = vectorValues[i];
        if (vector.has(index)) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
    return selectionVector;
}

/**
 * Returns a SelectionVector containing indices of all null values in the vector.
 *
 * @param vector The vector to filter
 * @returns SelectionVector with indices where values are null
 */
export function nullableValues<K>(vector: Vector<ArrayBufferView, K>): SelectionVector {
    const selectionVector = new Uint32Array(vector.size);
    let index = 0;
    for (let i = 0; i < vector.size; i++) {
        if (!vector.has(i)) {
            selectionVector[index++] = i;
        }
    }
    return new FlatSelectionVector(selectionVector, index);
}

/**
 * Filters an existing SelectionVector to only include indices where the vector has null values.
 * Updates the SelectionVector in-place.
 *
 * @param vector The vector to check for null values
 * @param selectionVector The SelectionVector to filter (modified in-place)
 * @returns The filtered SelectionVector (same reference as input)
 */
export function filterNullSelected<K>(
    vector: Vector<ArrayBufferView, K>,
    selectionVector: SelectionVector
): SelectionVector {
    let writeIndex = 0;
    const vectorValues = selectionVector.selectionValues();
    for (let i = 0; i < selectionVector.limit; i++) {
        const index = vectorValues[i];
        if (!vector.has(index)) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
    return selectionVector;
}

/**
 * Returns a SelectionVector containing indices where the vector value equals the specified value.
 *
 * @param vector The vector to filter
 * @param value The value to match
 * @returns SelectionVector with indices where vector[i] === value
 */
export function filterByValue<K>(vector: Vector<ArrayBufferView, K>, value: K): SelectionVector {
    // Optimized path for string vectors
    if (vector instanceof StringDictionaryVector) {
        return filterStringDictionaryByValue(vector, value as string);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return filterStringFsstDictionaryByValue(vector, value as string);
    }

    // Generic fallback for all other vectors
    const selectionVector = new Uint32Array(vector.size);
    let index = 0;
    for (let i = 0; i < vector.size; i++) {
        if (vector.has(i) && vector.getValue(i) === value) {
            selectionVector[index++] = i;
        }
    }
    return new FlatSelectionVector(selectionVector, index);
}

/**
 * Filters an existing SelectionVector to only include indices where the vector value equals the specified value.
 * Updates the SelectionVector in-place.
 *
 * @param vector The vector to check
 * @param value The value to match
 * @param selectionVector The SelectionVector to filter (modified in-place)
 */
export function filterSelected<K>(
    vector: Vector<ArrayBufferView, K>,
    value: K,
    selectionVector: SelectionVector
): void {
    if (vector instanceof StringDictionaryVector) {
        return filterStringDictionarySelected(vector, value as string, selectionVector);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return filterStringFsstDictionarySelected(vector, value as string, selectionVector);
    }

    // Generic fallback for all other vectors
    let writeIndex = 0;
    const vectorValues = selectionVector.selectionValues();
    for (let i = 0; i < selectionVector.limit; i++) {
        const index = vectorValues[i];
        if (vector.has(index) && vector.getValue(index) === value) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
}

/**
 * Returns a SelectionVector containing indices where the vector value does NOT equal the specified value.
 * Includes null values in the result.
 *
 * @param vector The vector to filter
 * @param value The value to exclude
 * @returns SelectionVector with indices where vector[i] !== value
 */
export function filterNotEqual<K>(vector: Vector<ArrayBufferView, K>, value: K): SelectionVector {
    // Optimized path for string vectors
    if (vector instanceof StringDictionaryVector) {
        return filterStringDictionaryNotEqual(vector, value as string);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return filterStringFsstDictionaryByValueNotEqual(vector, value as string);
    }

    // Generic fallback for all other vectors
    const selectionVector = new Uint32Array(vector.size);
    let index = 0;
    for (let i = 0; i < vector.size; i++) {
        if (!vector.has(i) || vector.getValue(i) !== value) {
            selectionVector[index++] = i;
        }
    }
    return new FlatSelectionVector(selectionVector, index);
}

/**
 * Filters an existing SelectionVector to only include indices where the vector value does NOT equal the specified value.
 * Updates the SelectionVector in-place.
 *
 * @param vector The vector to check
 * @param value The value to exclude
 * @param selectionVector The SelectionVector to filter (modified in-place)
 */
export function filterNotEqualSelected<K>(
    vector: Vector<ArrayBufferView, K>,
    value: K,
    selectionVector: SelectionVector
): void {
    // Optimized path for string vectors
    if (vector instanceof StringDictionaryVector) {
        return filterStringDictionaryNotEqualSelected(vector, value as string, selectionVector);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return filterStringFsstDictionarySelectedNotEqual(vector, value as string, selectionVector);
    }

    // Generic fallback for all other vectors
    let writeIndex = 0;
    const vectorValues = selectionVector.selectionValues();
    for (let i = 0; i < selectionVector.limit; i++) {
        const index = vectorValues[i];
        if (!vector.has(index) || vector.getValue(index) !== value) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
}

/**
 * Returns a SelectionVector containing indices where the vector value matches any value in the provided array.
 * Duplicate matches result in duplicate indices in the output.
 *
 * @param vector The vector to filter
 * @param values Array of values to match against
 * @returns SelectionVector with indices where vector[i] is in values array
 */
export function match<K>(vector: Vector<ArrayBufferView, K>, values: K[]): SelectionVector {
    // Optimized path for string vectors
    if (vector instanceof StringDictionaryVector) {
        return matchStringDictionary(vector, values as string[]);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return matchStringFsstDictionary(vector, values as string[]);
    }

    // Generic fallback for all other vectors
    const selectionVector = new Uint32Array(vector.size * values.length);
    let index = 0;
    for (let i = 0; i < vector.size; i++) {
        if (!vector.has(i)) continue;
        const value = vector.getValue(i);
        const matchCount = values.filter(v => v === value).length;
        for (let k = 0; k < matchCount; k++) {
            selectionVector[index++] = i;
        }
    }
    return new FlatSelectionVector(selectionVector, index);
}

/**
 * Filters an existing SelectionVector to only include indices where the vector value matches any value in the provided array.
 * Updates the SelectionVector in-place. Duplicate matches result in duplicate indices in the output.
 *
 * @param vector The vector to check
 * @param values Array of values to match against
 * @param selectionVector The SelectionVector to filter (modified in-place)
 */
export function matchSelected<K>(
    vector: Vector<ArrayBufferView, K>,
    values: K[],
    selectionVector: SelectionVector
): void {
    // Optimized path for string vectors
    if (vector instanceof StringDictionaryVector) {
        return matchStringDictionarySelected(vector, values as string[], selectionVector);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return matchStringFsstDictionarySelected(vector, values as string[], selectionVector);
    }

    // Generic fallback for all other vectors
    let writeIndex = 0;
    const vectorValues = selectionVector.selectionValues();
    for (let i = 0; i < selectionVector.limit; i++) {
        const index = vectorValues[i];
        if (!vector.has(index)) continue;
        const value = vector.getValue(index);
        const matchCount = values.filter(v => v === value).length;
        for (let k = 0; k < matchCount; k++) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
}

/**
 * Returns a SelectionVector containing indices where the vector value does NOT match any value in the provided array.
 *
 * @param vector The vector to filter
 * @param values Array of values to exclude
 * @returns SelectionVector with indices where vector[i] is NOT in values array
 */
export function noneMatch<K>(vector: Vector<ArrayBufferView, K>, values: K[]): SelectionVector {
    // Optimized path for string vectors
    if (vector instanceof StringDictionaryVector) {
        return noneMatchStringDictionary(vector, values as string[]);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return noneMatchStringFsstDictionary(vector, values as string[]);
    }

    // Generic fallback for all other vectors
    const selectionVector = new Uint32Array(vector.size);
    let index = 0;
    for (let i = 0; i < vector.size; i++) {
        if (vector.has(i) && !values.includes(vector.getValue(i))) {
            selectionVector[index++] = i;
        }
    }
    return new FlatSelectionVector(selectionVector, index);
}

/**
 * Filters an existing SelectionVector to only include indices where the vector value does NOT match any value in the provided array.
 * Updates the SelectionVector in-place.
 *
 * @param vector The vector to check
 * @param values Array of values to exclude
 * @param selectionVector The SelectionVector to filter (modified in-place)
 */
export function noneMatchSelected<K>(
    vector: Vector<ArrayBufferView, K>,
    values: K[],
    selectionVector: SelectionVector
): void {
    // Optimized path for string vectors
    if (vector instanceof StringDictionaryVector) {
        return noneMatchStringDictionarySelected(vector, values as string[], selectionVector);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return noneMatchStringFsstDictionarySelected(vector, values as string[], selectionVector);
    }

    // Generic fallback for all other vectors
    let writeIndex = 0;
    const vectorValues = selectionVector.selectionValues();
    for (let i = 0; i < selectionVector.limit; i++) {
        const index = vectorValues[i];
        if (vector.has(index) && !values.includes(vector.getValue(index))) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
}
