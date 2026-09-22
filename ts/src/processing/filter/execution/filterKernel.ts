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
        const present = operator === "has";
        return (selection) => scanVector(vector, (index) => vector.has(index) === present, selection);
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
        const data = vector.rawData;
        return resolveScanExecutor(vector, operator, values, (index) => data[index]);
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
    read: (index: number) => unknown = (index) => vector.getValue(index),
): ColumnarVectorExecutor {
    const match = createValueMatcher(operator, values);
    const nullMatches = matchesNull(operator, values);
    return (selection) =>
        scanVector(
            vector,
            (index) => {
                if (!vector.has(index)) return nullMatches;
                const value = normalizeComparable(read(index));
                return value === undefined ? nullMatches : match(value);
            },
            selection,
        );
}

function resolveDictionaryExecutor(
    vector: StringDictionaryVector | StringFsstDictionaryVector,
    operator: ValueComparisonOperator,
    values: readonly unknown[],
): ColumnarVectorExecutor {
    const offsets = vector.dictionaryOffsets;
    const dictionarySize = offsets.length - 1;
    const matchingCodes = new Uint8Array(dictionarySize);

    if (isEqualityOperator(operator)) {
        const encodedValues = encodeStringOperands(values);
        if (encodedValues.length > 0) {
            const dictionary = vector.getDictionaryBytes();
            for (let code = 0; code < dictionarySize; code++) {
                const start = offsets[code];
                const end = offsets[code + 1];
                for (const encodedValue of encodedValues) {
                    if (bytesEqual(dictionary, start, end, encodedValue)) {
                        matchingCodes[code] = 1;
                        break;
                    }
                }
            }
        }
    } else {
        const match = createValueMatcher(operator, values);
        for (let code = 0; code < dictionarySize; code++) {
            if (match(vector.getDictionaryValue(code))) matchingCodes[code] = 1;
        }
    }
    const indices = vector.indices;
    // Negation and matching a row without a value are separate, they diverge for a null operand
    const negated = isNegatedOperator(operator);
    const nullMatches = matchesNull(operator, values);
    return (selection) =>
        scanVector(
            vector,
            (index) => {
                if (!vector.has(index)) return nullMatches;
                const matches = matchingCodes[indices[index]] !== 0;
                return negated ? !matches : matches;
            },
            selection,
        );
}

const textEncoder = new TextEncoder();

function encodeStringOperands(values: readonly unknown[]): Uint8Array[] {
    const encodedValues: Uint8Array[] = [];
    for (const value of values) {
        if (typeof value === "string") encodedValues.push(textEncoder.encode(value));
    }
    return encodedValues;
}

function resolveFlatStringExecutor(
    vector: StringFlatVector,
    operator: ValueComparisonOperator,
    values: readonly unknown[],
): ColumnarVectorExecutor {
    if (!isEqualityOperator(operator)) {
        return resolveScanExecutor(vector, operator, values);
    }

    const encodedValues = encodeStringOperands(values);
    const offsets = vector.offsets;
    const data = vector.encodedValues;
    // Negation and null matching are separate, as in the dictionary kernel
    const negated = isNegatedOperator(operator);
    const nullMatches = matchesNull(operator, values);
    return (selection) =>
        scanVector(
            vector,
            (index) => {
                if (!vector.has(index)) return nullMatches;
                const start = offsets[index];
                const end = offsets[index + 1];
                let matches = false;
                for (const encodedValue of encodedValues) {
                    if (bytesEqual(data, start, end, encodedValue)) {
                        matches = true;
                        break;
                    }
                }
                return negated ? !matches : matches;
            },
            selection,
        );
}

function bytesEqual(data: Uint8Array, start: number, end: number, value: Uint8Array): boolean {
    if (end - start !== value.length) return false;
    for (let i = 0; i < value.length; i++) {
        if (data[start + i] !== value[i]) return false;
    }
    return true;
}
