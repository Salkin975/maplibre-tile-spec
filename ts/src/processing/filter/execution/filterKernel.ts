import { scanSelection } from "../../../vector/filter/selectionVectorUtils";
import { StringDictionaryVector } from "../../../vector/dictionary/stringDictionaryVector";
import { DoubleFlatVector } from "../../../vector/flat/doubleFlatVector";
import { FloatFlatVector } from "../../../vector/flat/floatFlatVector";
import { Int32FlatVector } from "../../../vector/flat/int32FlatVector";
import { Int64FlatVector } from "../../../vector/flat/int64FlatVector";
import { StringFlatVector } from "../../../vector/flat/stringFlatVector";
import { StringFsstDictionaryVector } from "../../../vector/fsst-dictionary/stringFsstDictionaryVector";
import {
    createValueMatcher,
    isNegatedOperator,
    matchesNull,
    normalizeComparable,
    type ColumnarComparisonOperator,
    type ValueComparisonOperator,
} from "../filterUtils";
import type { SelectionVector } from "../../../vector/filter/selectionVector";
import type Vector from "../../../vector/vector";

type ColumnarVectorExecutor = (selection?: SelectionVector) => SelectionVector;

function scanVector(vector: Vector, matches: (index: number) => boolean, selection?: SelectionVector): SelectionVector {
    return scanSelection(vector.size, matches, selection);
}

/** Returns the executor for the vector type, e.g. once per dictionary code for dictionary vectors. */
export function resolveVectorExecutor(
    vector: Vector,
    operator: ColumnarComparisonOperator,
    values: readonly unknown[],
): ColumnarVectorExecutor {
    if (operator === "has" || operator === "!has") {
        const shouldBePresent = operator === "has";
        return (selection) => scanVector(vector, (index) => vector.has(index) === shouldBePresent, selection);
    }

    if (vector instanceof StringDictionaryVector || vector instanceof StringFsstDictionaryVector) {
        return resolveDictionaryExecutor(vector, operator, values);
    }
    if (vector instanceof StringFlatVector) {
        return resolveFlatStringExecutor(vector, operator, values);
    }
    if (
        vector instanceof Int32FlatVector ||
        vector instanceof Int64FlatVector ||
        vector instanceof FloatFlatVector ||
        vector instanceof DoubleFlatVector
    ) {
        const rawValues = vector.rawData;
        return resolveScanExecutor(vector, operator, values, (index) => rawValues[index]);
    }
    return resolveScanExecutor(vector, operator, values);
}

function isEqualityOperator(operator: ValueComparisonOperator): boolean {
    return operator === "==" || operator === "!=" || operator === "in" || operator === "!in";
}

function resolveScanExecutor(
    vector: Vector,
    operator: ValueComparisonOperator,
    values: readonly unknown[],
    readValue: (index: number) => unknown = (index) => vector.getValue(index),
): ColumnarVectorExecutor {
    const matchesValue = createValueMatcher(operator, values);
    const isNullMatch = matchesNull(operator, values);
    return (selection) =>
        scanVector(
            vector,
            (index) => {
                if (!vector.has(index)) return isNullMatch;
                const value = normalizeComparable(readValue(index));
                return value === undefined ? isNullMatch : matchesValue(value);
            },
            selection,
        );
}

function resolveDictionaryExecutor(
    vector: StringDictionaryVector | StringFsstDictionaryVector,
    operator: ValueComparisonOperator,
    values: readonly unknown[],
): ColumnarVectorExecutor {
    const dictionaryOffsets = vector.dictionaryOffsets;
    const numDictionaryEntries = dictionaryOffsets.length - 1;
    const matchingCodes = new Uint8Array(numDictionaryEntries);

    if (isEqualityOperator(operator)) {
        const encodedOperands = encodeStringOperands(values);
        if (encodedOperands.length > 0) {
            const dictionaryBytes = vector.getDictionaryBytes();
            for (let code = 0; code < numDictionaryEntries; code++) {
                const entryStart = dictionaryOffsets[code];
                const entryEnd = dictionaryOffsets[code + 1];
                if (matchesAnyOperand(dictionaryBytes, entryStart, entryEnd, encodedOperands)) {
                    matchingCodes[code] = 1;
                }
            }
        }
    } else {
        const matchesValue = createValueMatcher(operator, values);
        for (let code = 0; code < numDictionaryEntries; code++) {
            if (matchesValue(vector.getDictionaryValue(code))) matchingCodes[code] = 1;
        }
    }
    const indices = vector.indices;
    // Negation and matching a row without a value are separate, they diverge for a null operand
    const isNegated = isNegatedOperator(operator);
    const isNullMatch = matchesNull(operator, values);
    return (selection) =>
        scanVector(
            vector,
            (index) => {
                if (!vector.has(index)) return isNullMatch;
                const isMatch = matchingCodes[indices[index]] !== 0;
                return isNegated ? !isMatch : isMatch;
            },
            selection,
        );
}

const textEncoder = new TextEncoder();

function encodeStringOperands(values: readonly unknown[]): Uint8Array[] {
    const encodedOperands: Uint8Array[] = [];
    for (const value of values) {
        if (typeof value === "string") encodedOperands.push(textEncoder.encode(value));
    }
    return encodedOperands;
}

function resolveFlatStringExecutor(
    vector: StringFlatVector,
    operator: ValueComparisonOperator,
    values: readonly unknown[],
): ColumnarVectorExecutor {
    if (!isEqualityOperator(operator)) {
        return resolveScanExecutor(vector, operator, values);
    }

    const encodedOperands = encodeStringOperands(values);
    const valueOffsets = vector.offsets;
    const encodedValues = vector.encodedValues;
    // Negation and null matching are separate, as in the dictionary kernel
    const isNegated = isNegatedOperator(operator);
    const isNullMatch = matchesNull(operator, values);
    return (selection) =>
        scanVector(
            vector,
            (index) => {
                if (!vector.has(index)) return isNullMatch;
                const isMatch = matchesAnyOperand(
                    encodedValues,
                    valueOffsets[index],
                    valueOffsets[index + 1],
                    encodedOperands,
                );
                return isNegated ? !isMatch : isMatch;
            },
            selection,
        );
}

/** Whether the UTF-8 bytes in `[start, end)` equal one of the encoded operands. */
function matchesAnyOperand(
    bytes: Uint8Array,
    start: number,
    end: number,
    encodedOperands: readonly Uint8Array[],
): boolean {
    for (const encodedOperand of encodedOperands) {
        if (bytesEqual(bytes, start, end, encodedOperand)) return true;
    }
    return false;
}

function bytesEqual(bytes: Uint8Array, start: number, end: number, expectedBytes: Uint8Array): boolean {
    if (end - start !== expectedBytes.length) return false;
    for (let i = 0; i < expectedBytes.length; i++) {
        if (bytes[start + i] !== expectedBytes[i]) return false;
    }
    return true;
}
