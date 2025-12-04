import type { SelectionVector } from "../filter/selectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import type { StringDictionaryVector } from "../dictionary/stringDictionaryVector";

const encoder = new TextEncoder();
const encode = (v: string) => encoder.encode(v);

function compareUtf8(a: Uint8Array, b: Uint8Array): number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
}

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
        if (entryLength !== valueLength) continue;

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

function findDictionaryIndices(
    vector: StringDictionaryVector,
    values: string[]
): Uint32Array {
    const indices = values
        .map(v => findDictionaryIndex(vector, encode(v)))
        .filter(i => i !== -1);
    return new Uint32Array(indices).sort();
}

function getMatchingDictIndices(
    vector: StringDictionaryVector,
    encodedValue: Uint8Array,
    operator: '=' | '!=' | '>=' | '<='
): Uint32Array {
    const { offset, data } = vector;
    const dictSize = offset.length - 1;
    const result: number[] = [];

    for (let dictIdx = 0; dictIdx < dictSize; dictIdx++) {
        const entry = data.subarray(offset[dictIdx], offset[dictIdx + 1]);
        const cmp = compareUtf8(entry, encodedValue);

        let match = false;
        if (operator === '=') match = cmp === 0;
        else if (operator === '!=') match = cmp !== 0;
        else if (operator === '>=') match = cmp >= 0;
        else if (operator === '<=') match = cmp <= 0;

        if (match) result.push(dictIdx);
    }

    return new Uint32Array(result).sort();
}

function scan(
    vector: StringDictionaryVector,
    matchingIndices: Uint32Array,
    includeNulls: boolean = false
): SelectionVector {
    if (matchingIndices.length === 0 && !includeNulls) {
        return new FlatSelectionVector(new Uint32Array());
    }

    const { index, nullability, size } = vector;
    const result = new Uint32Array(size);
    let w = 0;

    for (let i = 0; i < size; i++) {
        const hasValue = !nullability || nullability.get(i);
        if (!hasValue) {
            if (includeNulls) result[w++] = i;
        } else if (binarySearchIncludes(matchingIndices, index[i])) {
            result[w++] = i;
        }
    }

    return new FlatSelectionVector(result.subarray(0, w));
}

function filterInPlace(
    vector: StringDictionaryVector,
    selectionVector: SelectionVector,
    matchingIndices: Uint32Array,
    includeNulls: boolean = false
): void {
    if (matchingIndices.length === 0 && !includeNulls) {
        selectionVector.setLimit(0);
        return;
    }

    const { index, nullability } = vector;
    const values = selectionVector.selectionValues();
    const limit = selectionVector.limit;
    let w = 0;

    for (let i = 0; i < limit; i++) {
        const idx = values[i];
        const hasValue = !nullability || nullability.get(idx);

        if (!hasValue) {
            if (includeNulls) values[w++] = idx;
        } else if (binarySearchIncludes(matchingIndices, index[idx])) {
            values[w++] = idx;
        }
    }

    selectionVector.setLimit(w);
}

// ============================================================================
// Public API
// ============================================================================

export function filterStringDictionaryByValue(
    vector: StringDictionaryVector,
    value: string
): SelectionVector {
    const dictIdx = findDictionaryIndex(vector, encode(value));
    if (dictIdx === -1) return new FlatSelectionVector(new Uint32Array());
    return scan(vector, new Uint32Array([dictIdx]));
}

export function filterStringDictionaryNotEqual(
    vector: StringDictionaryVector,
    value: string
): SelectionVector {
    const matchingIndices = getMatchingDictIndices(vector, encode(value), '!=');
    return scan(vector, matchingIndices, true);
}

export function matchStringDictionary(
    vector: StringDictionaryVector,
    values: string[]
): SelectionVector {
    const matchingIndices = findDictionaryIndices(vector, values);
    return scan(vector, matchingIndices);
}

export function noneMatchStringDictionary(
    vector: StringDictionaryVector,
    values: string[]
): SelectionVector {
    const matchingIndices = findDictionaryIndices(vector, values);
    const allIndices = new Set<number>();
    for (let i = 0; i < vector.offset.length - 1; i++) {
        allIndices.add(i);
    }
    for (const idx of matchingIndices) {
        allIndices.delete(idx);
    }
    const invertedIndices = new Uint32Array(Array.from(allIndices)).sort();
    return scan(vector, invertedIndices, true);
}

export function greaterThanOrEqualToStringDictionary(
    vector: StringDictionaryVector,
    value: string
): SelectionVector {
    const matchingIndices = getMatchingDictIndices(vector, encode(value), '>=');
    return scan(vector, matchingIndices);
}

export function smallerThanOrEqualToStringDictionary(
    vector: StringDictionaryVector,
    value: string
): SelectionVector {
    const matchingIndices = getMatchingDictIndices(vector, encode(value), '<=');
    return scan(vector, matchingIndices);
}

export function filterStringDictionarySelected(
    vector: StringDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const dictIdx = findDictionaryIndex(vector, encode(value));
    if (dictIdx === -1) {
        selectionVector.setLimit(0);
        return;
    }
    filterInPlace(vector, selectionVector, new Uint32Array([dictIdx]));
}

export function filterStringDictionaryNotEqualSelected(
    vector: StringDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const matchingIndices = getMatchingDictIndices(vector, encode(value), '!=');
    filterInPlace(vector, selectionVector, matchingIndices, true);
}

export function matchStringDictionarySelected(
    vector: StringDictionaryVector,
    values: string[],
    selectionVector: SelectionVector
): void {
    const matchingIndices = findDictionaryIndices(vector, values);
    filterInPlace(vector, selectionVector, matchingIndices);
}

export function noneMatchStringDictionarySelected(
    vector: StringDictionaryVector,
    values: string[],
    selectionVector: SelectionVector
): void {
    const matchingIndices = findDictionaryIndices(vector, values);
    const allIndices = new Set<number>();
    for (let i = 0; i < vector.offset.length - 1; i++) {
        allIndices.add(i);
    }
    for (const idx of matchingIndices) {
        allIndices.delete(idx);
    }
    const invertedIndices = new Uint32Array(Array.from(allIndices)).sort();
    filterInPlace(vector, selectionVector, invertedIndices, true);
}

export function greaterThanOrEqualToStringDictionarySelected(
    vector: StringDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const matchingIndices = getMatchingDictIndices(vector, encode(value), '>=');
    filterInPlace(vector, selectionVector, matchingIndices);
}

export function smallerThanOrEqualToStringDictionarySelected(
    vector: StringDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const matchingIndices = getMatchingDictIndices(vector, encode(value), '<=');
    filterInPlace(vector, selectionVector, matchingIndices);
}
