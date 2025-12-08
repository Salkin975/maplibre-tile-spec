import type { SelectionVector } from "../filter/selectionVector";
import type { StringFlatVector } from "../flat/stringFlatVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";

function encode(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

function groupByLength(values: string[]): Map<number, Uint8Array[]> {
    const grouped = new Map<number, Uint8Array[]>();
    for (const value of values) {
        const encoded = encode(value);
        const list = grouped.get(encoded.length);
        if (list) {
            list.push(encoded);
        } else {
            grouped.set(encoded.length, [encoded]);
        }
    }
    return grouped;
}

function bytesEqual(
    dataBuffer: Uint8Array,
    offsetBuffer: Int32Array,
    index: number,
    encodedValue: Uint8Array
): boolean {
    const start = offsetBuffer[index];
    const length = offsetBuffer[index + 1] - start;

    if (length !== encodedValue.length) return false;

    for (let j = 0; j < length; j++) {
        if (dataBuffer[start + j] !== encodedValue[j]) {
            return false;
        }
    }
    return true;
}

function bytesMatchAny(
    dataBuffer: Uint8Array,
    offsetBuffer: Int32Array,
    index: number,
    encodedValuesByLength: Map<number, Uint8Array[]>
): boolean {
    const start = offsetBuffer[index];
    const length = offsetBuffer[index + 1] - start;

    const candidates = encodedValuesByLength.get(length);
    if (!candidates) return false;

    for (const encodedValue of candidates) {
        let match = true;
        for (let j = 0; j < length; j++) {
            if (dataBuffer[start + j] !== encodedValue[j]) {
                match = false;
                break;
            }
        }
        if (match) return true;
    }
    return false;
}

function compareBytes(
    dataBuffer: Uint8Array,
    offsetBuffer: Int32Array,
    index: number,
    encodedValue: Uint8Array,
    operator: '>=' | '<='
): boolean {
    const start = offsetBuffer[index];
    const length = offsetBuffer[index + 1] - start;
    const valueLength = encodedValue.length;
    const minLen = Math.min(length, valueLength);

    // Process in 8-byte chunks for better cache performance
    const chunks = (minLen >>> 3); // Faster than (minLen / 8) | 0
    let offset = start;
    let valueOffset = 0;

    if (operator === '>=') {
        for (let chunk = 0; chunk < chunks; chunk++) {
            for (let j = 0; j < 8; j++) {
                const bufferByte = dataBuffer[offset++];
                const valueByte = encodedValue[valueOffset++];
                if (bufferByte > valueByte) return true;
                if (bufferByte < valueByte) return false;
            }
        }

        while (valueOffset < minLen) {
            const bufferByte = dataBuffer[offset++];
            const valueByte = encodedValue[valueOffset++];
            if (bufferByte > valueByte) return true;
            if (bufferByte < valueByte) return false;
        }

        return length >= valueLength;
    } else {
        for (let chunk = 0; chunk < chunks; chunk++) {
            for (let j = 0; j < 8; j++) {
                const bufferByte = dataBuffer[offset++];
                const valueByte = encodedValue[valueOffset++];
                if (bufferByte < valueByte) return true;
                if (bufferByte > valueByte) return false;
            }
        }

        while (valueOffset < minLen) {
            const bufferByte = dataBuffer[offset++];
            const valueByte = encodedValue[valueOffset++];
            if (bufferByte < valueByte) return true;
            if (bufferByte > valueByte) return false;
        }

        return length <= valueLength;
    }
}

function scanVector(
    vector: StringFlatVector,
    predicate: (index: number) => boolean,
    includeNulls: boolean = false
): SelectionVector {
    const result = new Uint32Array(vector.size);
    let writeIndex = 0;

    for (let i = 0; i < vector.size; i++) {
        if (!vector.has(i)) {
            if (includeNulls) result[writeIndex++] = i;
            continue;
        }
        if (predicate(i)) {
            result[writeIndex++] = i;
        }
    }

    return new FlatSelectionVector(result, writeIndex);
}

function filterSelection(
    vector: StringFlatVector,
    selectionVector: SelectionVector,
    predicate: (index: number) => boolean,
    includeNulls: boolean = false
): void {
    const vectorValues = selectionVector.selectionValues();
    let writeIndex = 0;

    for (let i = 0; i < selectionVector.limit; i++) {
        const idx = vectorValues[i];

        if (!vector.has(idx)) {
            if (includeNulls) selectionVector.setIndex(writeIndex++, idx);
            continue;
        }
        if (predicate(idx)) {
            selectionVector.setIndex(writeIndex++, idx);
        }
    }

    selectionVector.setLimit(writeIndex);
}

// ============================================================================
// Public API
// ============================================================================

export function filterStringFlatByValue(
    vector: StringFlatVector,
    value: string
): SelectionVector {
    const encodedValue = encode(value);
    return scanVector(vector, i =>
        bytesEqual(vector.data, vector.offset, i, encodedValue)
    );
}

export function filterStringFlatNotEqual(
    vector: StringFlatVector,
    value: string
): SelectionVector {
    const encodedValue = encode(value);
    return scanVector(
        vector,
        i => !bytesEqual(vector.data, vector.offset, i, encodedValue),
        true
    );
}

export function matchStringFlat(
    vector: StringFlatVector,
    values: string[]
): SelectionVector {
    const byLength = groupByLength(values);
    return scanVector(vector, i =>
        bytesMatchAny(vector.data, vector.offset, i, byLength)
    );
}

export function noneMatchStringFlat(
    vector: StringFlatVector,
    values: string[]
): SelectionVector {
    const byLength = groupByLength(values);
    return scanVector(
        vector,
        i => !bytesMatchAny(vector.data, vector.offset, i, byLength),
        true
    );
}

export function greaterThanOrEqualToStringFlat(
    vector: StringFlatVector,
    value: string
): SelectionVector {
    const encodedValue = encode(value);
    return scanVector(vector, i =>
        compareBytes(vector.data, vector.offset, i, encodedValue, '>=')
    );
}

export function smallerThanOrEqualToStringFlat(
    vector: StringFlatVector,
    value: string
): SelectionVector {
    const encodedValue = encode(value);
    return scanVector(vector, i =>
        compareBytes(vector.data, vector.offset, i, encodedValue, '<=')
    );
}

// ============================================================================
// Public API - Selection Filtering
// ============================================================================

export function filterStringFlatSelected(
    vector: StringFlatVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const encodedValue = encode(value);
    filterSelection(vector, selectionVector, i =>
        bytesEqual(vector.data, vector.offset, i, encodedValue)
    );
}

export function filterStringFlatNotEqualSelected(
    vector: StringFlatVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const encodedValue = encode(value);
    filterSelection(
        vector,
        selectionVector,
        i => !bytesEqual(vector.data, vector.offset, i, encodedValue),
        true
    );
}

export function matchStringFlatSelected(
    vector: StringFlatVector,
    values: string[],
    selectionVector: SelectionVector
): void {
    const byLength = groupByLength(values);
    filterSelection(vector, selectionVector, i =>
        bytesMatchAny(vector.data, vector.offset, i, byLength)
    );
}

export function noneMatchStringFlatSelected(
    vector: StringFlatVector,
    values: string[],
    selectionVector: SelectionVector
): void {
    const byLength = groupByLength(values);
    filterSelection(
        vector,
        selectionVector,
        i => !bytesMatchAny(vector.data, vector.offset, i, byLength),
        true
    );
}

export function greaterThanOrEqualToStringFlatSelected(
    vector: StringFlatVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const encodedValue = encode(value);
    filterSelection(vector, selectionVector, i =>
        compareBytes(vector.data, vector.offset, i, encodedValue, '>=')
    );
}

export function smallerThanOrEqualToStringFlatSelected(
    vector: StringFlatVector,
    value: string,
    selectionVector: SelectionVector
): void {
    const encodedValue = encode(value);
    filterSelection(vector, selectionVector, i =>
        compareBytes(vector.data, vector.offset, i, encodedValue, '<=')
    );
}
