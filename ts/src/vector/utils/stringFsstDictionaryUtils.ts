import type { SelectionVector } from "../filter/selectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import type { StringFsstDictionaryVector } from "../fsst-dictionary/stringFsstDictionaryVector";

function matchDictEntry(
    dictionary: Uint8Array,
    start: number,
    length: number,
    encodedValue: Uint8Array
): boolean {
    if (length !== encodedValue.length) return false;
    for (let j = 0; j < length; j++) {
        if (dictionary[start + j] !== encodedValue[j]) return false;
    }
    return true;
}

function compareDictEntry(
    dictionary: Uint8Array,
    start: number,
    length: number,
    encodedValue: Uint8Array,
    isGte: boolean
): boolean {
    const valueLength = encodedValue.length;
    const minLength = length < valueLength ? length : valueLength;

    let cmp = 0;
    for (let j = 0; j < minLength; j++) {
        const diff = dictionary[start + j] - encodedValue[j];
        if (diff !== 0) {
            cmp = diff;
            break;
        }
    }

    if (cmp === 0) cmp = length - valueLength;
    return isGte ? cmp >= 0 : cmp <= 0;
}

function getMatchingDictIndices(
    vector: StringFsstDictionaryVector,
    encodedValues: Uint8Array[],
    invert: boolean
): Set<number> {
    const { decoded: dictionary, offset } = vector;
    const dictSize = offset.length - 1;
    const result = new Set<number>();

    for (let dictIdx = 0; dictIdx < dictSize; dictIdx++) {
        const start = offset[dictIdx];
        const length = offset[dictIdx + 1] - start;

        let isMatch = false;
        for (const ev of encodedValues) {
            if (matchDictEntry(dictionary, start, length, ev)) {
                isMatch = true;
                break;
            }
        }

        if (isMatch !== invert) result.add(dictIdx);
    }
    return result;
}

function getCompareDictIndices(
    vector: StringFsstDictionaryVector,
    encodedValue: Uint8Array,
    isGte: boolean
): Set<number> {
    const { decoded: dictionary, offset } = vector;
    const dictSize = offset.length - 1;
    const result = new Set<number>();

    for (let dictIdx = 0; dictIdx < dictSize; dictIdx++) {
        const start = offset[dictIdx];
        const length = offset[dictIdx + 1] - start;

        if (compareDictEntry(dictionary, start, length, encodedValue, isGte)) {
            result.add(dictIdx);
        }
    }
    return result;
}

function ensureDecoded(vector: StringFsstDictionaryVector): void {
    if (vector.decoded == null && vector.size > 0) vector.getValue(0);
}

function scan(
    vector: StringFsstDictionaryVector,
    matchingIndices: Set<number>
): SelectionVector {
    const { index, size } = vector;
    const result = new Uint32Array(size);
    let w = 0;

    for (let i = 0; i < size; i++) {
        if (vector.has(i) && matchingIndices.has(index[i])) {
            result[w++] = i;
        }
    }

    return new FlatSelectionVector(result, w);
}

function filterInPlace(
    vector: StringFsstDictionaryVector,
    selectionVector: SelectionVector,
    matchingIndices: Set<number>
): void {
    if (matchingIndices.size === 0) {
        selectionVector.setLimit(0);
        return;
    }

    const { index } = vector;
    const values = selectionVector.selectionValues();
    const limit = selectionVector.limit;
    let w = 0;

    for (let i = 0; i < limit; i++) {
        const idx = values[i];
        if (vector.has(idx) && matchingIndices.has(index[idx])) {
            values[w++] = idx;
        }
    }

    selectionVector.setLimit(w);
}

// ============================================================================
// Public API
// ============================================================================

const encoder = new TextEncoder();
const encode = (v: string) => encoder.encode(v);

export function filterStringFsstDictionaryByValue(
    vector: StringFsstDictionaryVector,
    value: string
): SelectionVector {
    ensureDecoded(vector);
    const matchingIndices = getMatchingDictIndices(vector, [encode(value)], false)
    return scan(vector, matchingIndices);
}

export function filterStringFsstDictionaryNotEqual(
    vector: StringFsstDictionaryVector,
    value: string
): SelectionVector {
    ensureDecoded(vector);
    const matchingIndices = getMatchingDictIndices(vector, [encode(value)], true)
    return scan(vector, matchingIndices);
}

export function matchStringFsstDictionary(
    vector: StringFsstDictionaryVector,
    values: string[]
): SelectionVector {
    ensureDecoded(vector);
    const matchingIndices = getMatchingDictIndices(vector, values.map(encode), false)
    return scan(vector, matchingIndices);
}

export function noneMatchStringFsstDictionary(
    vector: StringFsstDictionaryVector,
    values: string[]
): SelectionVector {
    ensureDecoded(vector);
    const matchingIndices = getMatchingDictIndices(vector, values.map(encode), true)
    return scan(vector, matchingIndices);
}

export function greaterThanOrEqualToStringFsstDictionary(
    vector: StringFsstDictionaryVector,
    value: string
): SelectionVector {
    ensureDecoded(vector);
    const matchingIndices = getCompareDictIndices(vector, encode(value), true)
    return scan(vector, matchingIndices);
}

export function smallerThanOrEqualToStringFsstDictionary(
    vector: StringFsstDictionaryVector,
    value: string
): SelectionVector {
    ensureDecoded(vector);
    const matchingIndices = getCompareDictIndices(vector, encode(value), false)
    return scan(vector, matchingIndices);
}

export function filterStringFsstDictionarySelected(
    vector: StringFsstDictionaryVector,
    value: string,
    sel: SelectionVector
): void {
    ensureDecoded(vector);
    const matchingIndices = getMatchingDictIndices(vector, [encode(value)], false)
    filterInPlace(vector, sel, matchingIndices);
}

export function filterStringFsstDictionaryNotEqualSelected(
    vector: StringFsstDictionaryVector,
    value: string,
    sel: SelectionVector
): void {
    ensureDecoded(vector);
    const matchingIndices = getMatchingDictIndices(vector, [encode(value)], true);
    filterInPlace(vector, sel, matchingIndices);
}

export function matchStringFsstDictionarySelected(
    vector: StringFsstDictionaryVector,
    values: string[],
    sel: SelectionVector
): void {
    ensureDecoded(vector);
    const matchingIndices = getMatchingDictIndices(vector, values.map(encode), false)
    filterInPlace(vector, sel, matchingIndices);
}

export function noneMatchStringFsstDictionarySelected(
    vector: StringFsstDictionaryVector,
    values: string[],
    sel: SelectionVector
): void {
    ensureDecoded(vector);
    const matchingIndices = getMatchingDictIndices(vector, values.map(encode), true)
    filterInPlace(vector, sel, matchingIndices);
}

export function greaterThanOrEqualToStringFsstDictionarySelected(
    vector: StringFsstDictionaryVector,
    value: string,
    sel: SelectionVector
): void {
    ensureDecoded(vector);
    const matchingIndices = getCompareDictIndices(vector, encode(value), true)
    filterInPlace(vector, sel, matchingIndices);
}

export function smallerThanOrEqualToStringFsstDictionarySelected(
    vector: StringFsstDictionaryVector,
    value: string,
    sel: SelectionVector
): void {
    ensureDecoded(vector);
    const matchingIndices = getCompareDictIndices(vector, encode(value), false);
    filterInPlace(vector, sel, matchingIndices);
}
