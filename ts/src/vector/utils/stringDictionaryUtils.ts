import type { SelectionVector } from "../filter/selectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import { createSelectionVector } from "../filter/selectionVectorUtils";
import type { StringDictionaryVector } from "../dictionary/stringDictionaryVector";

/**
 * Compare two UTF-8 byte arrays lexicographically
 * Returns: <0 if a<b, 0 if a==b, >0 if a>b
 */
function compareUtf8(a: Uint8Array, b: Uint8Array): number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
}

/**
 * Encode a string to UTF-8 bytes
 */
function encodeStringToUtf8(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

/**
 * Sort dictionary entries and return sorted indices
 * Returns array mapping sorted position -> original dictionary index
 */
export function sortDictionary(
    offsetBuffer: Int32Array,
    dataBuffer: Uint8Array,
    dictionarySize: number
): Uint32Array {
    const indices = new Uint32Array(dictionarySize);
    for (let i = 0; i < dictionarySize; i++) indices[i] = i;

    return indices.sort((a, b) => {
        const aData = dataBuffer.subarray(offsetBuffer[a], offsetBuffer[a + 1]);
        const bData = dataBuffer.subarray(offsetBuffer[b], offsetBuffer[b + 1]);
        return compareUtf8(aData, bData);
    });
}

/**
 * Binary search in sorted dictionary
 * Returns original dictionary index or -1 if not found
 */
export function binarySearchDictionary(
    vector: StringDictionaryVector,
    value: Uint8Array
): number {
    if (!vector.isSorted) return -1;

    const sortedIndices = vector.sorted;
    const offsetBuffer = vector.offset;
    const dataBuffer = vector.data;

    let left = 0, right = sortedIndices.length - 1;

    while (left <= right) {
        const mid = (left + right) >>> 1;
        const dictIdx = sortedIndices[mid];
        const entry = dataBuffer.subarray(offsetBuffer[dictIdx], offsetBuffer[dictIdx + 1]);
        const cmp = compareUtf8(entry, value);

        if (cmp < 0) left = mid + 1;
        else if (cmp > 0) right = mid - 1;
        else return dictIdx;
    }

    return -1;
}

/**
 * Find the dictionary index for a given UTF-8 encoded value
 * Returns -1 if not found
 */
export function findDictionaryIndex(
    vector: StringDictionaryVector,
    value: Uint8Array
): number {
    if (vector.isSorted) {
        return binarySearchDictionary(vector, value);
    }

    const offsetBuffer = vector.offset;
    const dataBuffer = vector.data;
    const dictionarySize = vector.size;
    const valueLength = value.length;

    for (let i = 1; i <= dictionarySize; i++) {
        const entryLength = offsetBuffer[i] - offsetBuffer[i - 1];
        if (entryLength !== valueLength) {
            continue;
        }

        const entry = dataBuffer.subarray(offsetBuffer[i - 1], offsetBuffer[i]);
        let match = true;
        for (let j = 0; j < valueLength; j++) {
            if (entry[j] !== value[j]) {
                match = false;
                break;
            }
        }
        if (match) return i - 1;
    }
    return -1;
}

/**
 * Filter dictionary vector by exact value match
 */
export function filterStringDictionaryByValue(
    vector: StringDictionaryVector,
    value: string
): SelectionVector {
    const valueUtf8 = encodeStringToUtf8(value);

    const valueDictionaryIndex = findDictionaryIndex(vector, valueUtf8);

    if (valueDictionaryIndex === -1) {
        return new FlatSelectionVector(new Uint32Array());
    }

    const indexBuffer = vector.index;
    const nullabilityBuffer = vector.nullability;

    const selectionVector = new Uint32Array(indexBuffer.length);
    let index = 0;
    for (let i = 0; i < indexBuffer.length; i++) {
        if (
            (!nullabilityBuffer || nullabilityBuffer.get(i)) &&
            indexBuffer[i] === valueDictionaryIndex
        ) {
            selectionVector[index++] = i;
        }
    }

    return new FlatSelectionVector(selectionVector.subarray(0, index));
}

/**
 * Filter dictionary vector by exact value match (modifies selection vector in-place)
 */
export function filterStringDictionarySelected(
    vector: StringDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const valueUtf8 = encodeStringToUtf8(value);

    const valueDictionaryIndex = findDictionaryIndex(vector, valueUtf8);

    if (valueDictionaryIndex === -1) {
        selectionVector.setLimit(0);
        return;
    }

    const indexBuffer = vector.index;
    const nullabilityBuffer = vector.nullability;
    const vectorValues = selectionVector.selectionValues();
    let limit = 0;

    for (let i = 0; i < selectionVector.limit; i++) {
        const featureIndex = vectorValues[i];
        if (
            (!nullabilityBuffer || nullabilityBuffer.get(featureIndex)) &&
            indexBuffer[featureIndex] === valueDictionaryIndex
        ) {
            vectorValues[limit++] = featureIndex;
        }
    }

    selectionVector.setLimit(limit);
}

/**
 * Binary search for value in sorted array
 * Returns true if found, false otherwise
 */
function binarySearchIncludes(sortedArray: Uint32Array, value: number): boolean {
    let left = 0, right = sortedArray.length - 1;
    while (left <= right) {
        const mid = (left + right) >>> 1;
        if (sortedArray[mid] < value) left = mid + 1;
        else if (sortedArray[mid] > value) right = mid - 1;
        else return true;
    }
    return false;
}

/**
 * Filter features by dictionary indices, creating a new selection vector
 */
function filterFeaturesByDictionaryIndices(
    vector: StringDictionaryVector,
    sortedDictIndices: Uint32Array
): SelectionVector {
    const indexBuffer = vector.index;
    const nullabilityBuffer = vector.nullability;
    const selectionVector = new Uint32Array(indexBuffer.length);
    let index = 0;

    for (let i = 0; i < indexBuffer.length; i++) {
        if ((!nullabilityBuffer || nullabilityBuffer.get(i)) &&
            binarySearchIncludes(sortedDictIndices, indexBuffer[i])) {
            selectionVector[index++] = i;
        }
    }

    return new FlatSelectionVector(selectionVector.subarray(0, index));
}

/**
 * Filter selected features by dictionary indices (modifies selection vector in-place)
 */
function filterSelectedByDictionaryIndices(
    vector: StringDictionaryVector,
    sortedDictIndices: Uint32Array,
    selectionVector: SelectionVector
): void {
    const indexBuffer = vector.index;
    const nullabilityBuffer = vector.nullability;
    const vectorValues = selectionVector.selectionValues();
    let limit = 0;

    for (let i = 0; i < selectionVector.limit; i++) {
        const featureIndex = vectorValues[i];
        if ((!nullabilityBuffer || nullabilityBuffer.get(featureIndex)) &&
            binarySearchIncludes(sortedDictIndices, indexBuffer[featureIndex])) {
            vectorValues[limit++] = featureIndex;
        }
    }

    selectionVector.setLimit(limit);
}

/**
 * Find dictionary indices for multiple values
 */
function findDictionaryIndices(
    vector: StringDictionaryVector,
    values: string[]
): Uint32Array {
    const indices = values
        .map((v) => findDictionaryIndex(vector, encodeStringToUtf8(v)))
        .filter((i) => i !== -1);

    return new Uint32Array(indices).sort();
}

/**
 * Filter dictionary vector by multiple values (IN operator)
 */
export function matchStringDictionary(
    vector: StringDictionaryVector,
    values: string[]
): SelectionVector {
    const sortedDictIndices = findDictionaryIndices(vector, values);

    if (sortedDictIndices.length === 0) {
        return new FlatSelectionVector(new Uint32Array());
    }

    const indexBuffer = vector.index;
    const nullabilityBuffer = vector.nullability;
    const size = vector.size;

    const selectionVector = new Uint32Array(size);
    let index = 0;
    for (let i = 0; i < size; i++) {
        if ((!nullabilityBuffer || nullabilityBuffer.get(i)) &&
            binarySearchIncludes(sortedDictIndices, indexBuffer[i])) {
            selectionVector[index++] = i;
        }
    }

    return new FlatSelectionVector(selectionVector.subarray(0, index));
}

/**
 * Filter dictionary vector by multiple values (modifies selection vector in-place)
 */
export function matchStringDictionarySelected(
    vector: StringDictionaryVector,
    values: string[],
    selectionVector: SelectionVector
): void {
    const sortedDictIndices = findDictionaryIndices(vector, values);

    if (sortedDictIndices.length === 0) {
        selectionVector.setLimit(0);
        return;
    }

    const indexBuffer = vector.index;
    const nullabilityBuffer = vector.nullability;
    const vectorValues = selectionVector.selectionValues();
    let limit = 0;

    for (let i = 0; i < selectionVector.limit; i++) {
        const featureIndex = vectorValues[i];
        if ((!nullabilityBuffer || nullabilityBuffer.get(featureIndex)) &&
            binarySearchIncludes(sortedDictIndices, indexBuffer[featureIndex])) {
            vectorValues[limit++] = featureIndex;
        }
    }

    selectionVector.setLimit(limit);
}

/**
 * Filter dictionary vector by NOT EQUAL
 */
export function filterStringDictionaryNotEqual(
    vector: StringDictionaryVector,
    value: string
): SelectionVector {
    const valueUtf8 = encodeStringToUtf8(value);

    const valueDictionaryIndex = findDictionaryIndex(vector, valueUtf8);

    if (valueDictionaryIndex === -1) {
        return createSelectionVector(vector.size);
    }

    const indexBuffer = vector.index;
    const nullabilityBuffer = vector.nullability;

    const selectionVector = new Uint32Array(indexBuffer.length);
    let index = 0;
    for (let i = 0; i < indexBuffer.length; i++) {
        if (
            (nullabilityBuffer && !nullabilityBuffer.get(i)) ||
            indexBuffer[i] !== valueDictionaryIndex
        ) {
            selectionVector[index++] = i;
        }
    }

    return new FlatSelectionVector(selectionVector.subarray(0, index));
}

/**
 * Filter dictionary vector by NOT EQUAL (modifies selection vector in-place)
 */
export function filterStringDictionaryNotEqualSelected(
    vector: StringDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const valueUtf8 = encodeStringToUtf8(value);

    const valueDictionaryIndex = findDictionaryIndex(vector, valueUtf8);

    if (valueDictionaryIndex === -1) {
        return;
    }

    const indexBuffer = vector.index;
    const nullabilityBuffer = vector.nullability;
    const vectorValues = selectionVector.selectionValues();
    let limit = 0;

    for (let i = 0; i < selectionVector.limit; i++) {
        const featureIndex = vectorValues[i];
        if (
            (nullabilityBuffer && !nullabilityBuffer.get(featureIndex)) ||
            indexBuffer[featureIndex] !== valueDictionaryIndex
        ) {
            vectorValues[limit++] = featureIndex;
        }
    }

    selectionVector.setLimit(limit);
}

/**
 * Filter dictionary vector by NOT IN (none match)
 */
export function noneMatchStringDictionary(
    vector: StringDictionaryVector,
    values: string[]
): SelectionVector {
    const sortedDictIndices = findDictionaryIndices(vector, values);

    if (sortedDictIndices.length === 0) {
        return createSelectionVector(vector.size);
    }

    const indexBuffer = vector.index;
    const nullabilityBuffer = vector.nullability;
    const size = vector.size;

    const selectionVector = new Uint32Array(size);
    let index = 0;
    for (let i = 0; i < size; i++) {
        if ((nullabilityBuffer && !nullabilityBuffer.get(i)) ||
            !binarySearchIncludes(sortedDictIndices, indexBuffer[i])) {
            selectionVector[index++] = i;
        }
    }

    return new FlatSelectionVector(selectionVector.subarray(0, index));
}

/**
 * Filter dictionary vector by NOT IN (modifies selection vector in-place)
 */
export function noneMatchStringDictionarySelected(
    vector: StringDictionaryVector,
    values: string[],
    selectionVector: SelectionVector
): void {
    const sortedDictIndices = findDictionaryIndices(vector, values);

    if (sortedDictIndices.length === 0) {
        return;
    }

    const indexBuffer = vector.index;
    const nullabilityBuffer = vector.nullability;
    const vectorValues = selectionVector.selectionValues();
    let limit = 0;

    for (let i = 0; i < selectionVector.limit; i++) {
        const featureIndex = vectorValues[i];
        if ((nullabilityBuffer && !nullabilityBuffer.get(featureIndex)) ||
            !binarySearchIncludes(sortedDictIndices, indexBuffer[featureIndex])) {
            vectorValues[limit++] = featureIndex;
        }
    }

    selectionVector.setLimit(limit);
}

/**
 * Filter dictionary vector by >= (lexicographic)
 */
export function greaterThanOrEqualToStringDictionary(
    vector: StringDictionaryVector,
    value: string
): SelectionVector {
    const valueUtf8 = encodeStringToUtf8(value);

    const offsetBuffer = vector.offset;
    const dataBuffer = vector.data;
    const dictionarySize = offsetBuffer.length - 1;

    // Find all dictionary indices where entry >= value (lexicographically)
    const matchingDictIndices: number[] = [];
    for (let dictIdx = 0; dictIdx < dictionarySize; dictIdx++) {
        const entry = dataBuffer.subarray(offsetBuffer[dictIdx], offsetBuffer[dictIdx + 1]);
        if (compareUtf8(entry, valueUtf8) >= 0) {
            matchingDictIndices.push(dictIdx);
        }
    }

    if (matchingDictIndices.length === 0) {
        return new FlatSelectionVector(new Uint32Array());
    }

    const sortedDictIndices = new Uint32Array(matchingDictIndices).sort();
    return filterFeaturesByDictionaryIndices(vector, sortedDictIndices);
}

/**
 * Filter dictionary vector by >= (modifies selection vector in-place)
 */
export function greaterThanOrEqualToStringDictionarySelected(
    vector: StringDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const valueUtf8 = encodeStringToUtf8(value);

    const offsetBuffer = vector.offset;
    const dataBuffer = vector.data;
    const dictionarySize = offsetBuffer.length - 1;

    // Find all dictionary indices where entry >= value (lexicographically)
    const matchingDictIndices: number[] = [];
    for (let dictIdx = 0; dictIdx < dictionarySize; dictIdx++) {
        const entry = dataBuffer.subarray(offsetBuffer[dictIdx], offsetBuffer[dictIdx + 1]);
        if (compareUtf8(entry, valueUtf8) >= 0) {
            matchingDictIndices.push(dictIdx);
        }
    }

    if (matchingDictIndices.length === 0) {
        selectionVector.setLimit(0);
        return;
    }

    const sortedDictIndices = new Uint32Array(matchingDictIndices).sort();
    filterSelectedByDictionaryIndices(vector, sortedDictIndices, selectionVector);
}

/**
 * Filter dictionary vector by <= (lexicographic)
 */
export function smallerThanOrEqualToStringDictionary(
    vector: StringDictionaryVector,
    value: string
): SelectionVector {
    const valueUtf8 = encodeStringToUtf8(value);

    const offsetBuffer = vector.offset;
    const dataBuffer = vector.data;
    const dictionarySize = offsetBuffer.length - 1;

    // Find all dictionary indices where entry <= value (lexicographically)
    const matchingDictIndices: number[] = [];
    for (let dictIdx = 0; dictIdx < dictionarySize; dictIdx++) {
        const entry = dataBuffer.subarray(offsetBuffer[dictIdx], offsetBuffer[dictIdx + 1]);
        if (compareUtf8(entry, valueUtf8) <= 0) {
            matchingDictIndices.push(dictIdx);
        }
    }

    if (matchingDictIndices.length === 0) {
        return new FlatSelectionVector(new Uint32Array());
    }

    const sortedDictIndices = new Uint32Array(matchingDictIndices).sort();
    return filterFeaturesByDictionaryIndices(vector, sortedDictIndices);
}

/**
 * Filter dictionary vector by <= (modifies selection vector in-place)
 */
export function smallerThanOrEqualToStringDictionarySelected(
    vector: StringDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const valueUtf8 = encodeStringToUtf8(value);

    const offsetBuffer = vector.offset;
    const dataBuffer = vector.data;
    const dictionarySize = offsetBuffer.length - 1;

    // Find all dictionary indices where entry <= value (lexicographically)
    const matchingDictIndices: number[] = [];
    for (let dictIdx = 0; dictIdx < dictionarySize; dictIdx++) {
        const entry = dataBuffer.subarray(offsetBuffer[dictIdx], offsetBuffer[dictIdx + 1]);
        if (compareUtf8(entry, valueUtf8) <= 0) {
            matchingDictIndices.push(dictIdx);
        }
    }

    if (matchingDictIndices.length === 0) {
        selectionVector.setLimit(0);
        return;
    }

    const sortedDictIndices = new Uint32Array(matchingDictIndices).sort();
    filterSelectedByDictionaryIndices(vector, sortedDictIndices, selectionVector);
}
