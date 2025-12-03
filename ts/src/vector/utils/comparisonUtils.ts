import { type SelectionVector } from "../filter/selectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import type { IntFlatVector } from "../flat/intFlatVector";
import type { LongFlatVector } from "../flat/longFlatVector";
import type { FloatFlatVector } from "../flat/floatFlatVector";
import type { DoubleFlatVector } from "../flat/doubleFlatVector";
import type { IntConstVector } from "../constant/intConstVector";
import type { LongConstVector } from "../constant/longConstVector";
import type { IntSequenceVector } from "../sequence/intSequenceVector";
import type { LongSequenceVector } from "../sequence/longSequenceVector";
import { type StringFlatVector } from "../flat/stringFlatVector";
import { StringDictionaryVector } from "../dictionary/stringDictionaryVector";
import {
    greaterThanOrEqualToStringDictionary,
    greaterThanOrEqualToStringDictionarySelected,
    smallerThanOrEqualToStringDictionary,
    smallerThanOrEqualToStringDictionarySelected,
} from "./stringDictionaryUtils";
import {
    greaterThanOrEqualToStringFsstDictionary,
    greaterThanOrEqualToStringFsstDictionarySelected,
    smallerThanOrEqualToStringFsstDictionary,
    smallerThanOrEqualToStringFsstDictionarySelected,
} from "./stringFsstDictionaryUtil";
import { StringFsstDictionaryVector } from "../fsst-dictionary/stringFsstDictionaryVector";

/**
 * Union type of all vector types that support comparison operations.
 * These vectors contain numeric values that can be compared using >= and <= operators.
 */
export type ComparableVector =
    | IntFlatVector
    | StringFlatVector
    | StringDictionaryVector
    | LongFlatVector
    | FloatFlatVector
    | DoubleFlatVector
    | IntConstVector
    | LongConstVector
    | IntSequenceVector
    | LongSequenceVector;

/**
 * Returns a SelectionVector containing indices where the vector value is greater than or equal to the specified value.
 *
 * @param vector The vector to filter (must be a numeric or string vector type)
 * @param value The threshold value to compare against
 * @returns SelectionVector with indices where vector[i] >= value
 */
export function greaterThanOrEqualTo<K>(vector: ComparableVector, value: K): SelectionVector {
    // Optimized path for StringFlatVector
    if (vector instanceof StringDictionaryVector) {
        return greaterThanOrEqualToStringDictionary(vector, value as string);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return greaterThanOrEqualToStringFsstDictionary(vector, value as string);
    }

    // Generic fallback for numeric vectors
    const selectionVector = new Uint32Array(vector.size);
    let index = 0;
    for (let i = 0; i < vector.size; i++) {
        if (vector.has(i) && (vector.getValue(i) as any) >= value) {
            selectionVector[index++] = i;
        }
    }
    return new FlatSelectionVector(selectionVector, index);
}

/**
 * Filters an existing SelectionVector to only include indices where the vector value is greater than or equal to the specified value.
 * Updates the SelectionVector in-place.
 *
 * @param vector The vector to check (must be a numeric or string vector type)
 * @param value The threshold value to compare against
 * @param selectionVector The SelectionVector to filter (modified in-place)
 */
export function greaterThanOrEqualToSelected<K>(
    vector: ComparableVector,
    value: K,
    selectionVector: SelectionVector
): void {
    // Optimized path for StringFlatVector
    if (vector instanceof StringDictionaryVector) {
        return greaterThanOrEqualToStringDictionarySelected(vector, value as string, selectionVector);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return greaterThanOrEqualToStringFsstDictionarySelected(vector, value as string, selectionVector);
    }

    // Generic fallback for numeric vectors
    let writeIndex = 0;
    const vectorValues = selectionVector.selectionValues();
    for (let i = 0; i < selectionVector.limit; i++) {
        const index = vectorValues[i];
        if (vector.has(index) && (vector.getValue(index) as any) >= value) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
}

/**
 * Returns a SelectionVector containing indices where the vector value is less than or equal to the specified value.
 *
 * @param vector The vector to filter (must be a numeric or string vector type)
 * @param value The threshold value to compare against
 * @returns SelectionVector with indices where vector[i] <= value
 */
export function smallerThanOrEqualTo<K>(vector: ComparableVector, value: K): SelectionVector {
    // Optimized path for StringFlatVector
    if (vector instanceof StringDictionaryVector) {
        return smallerThanOrEqualToStringDictionary(vector, value as string);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return smallerThanOrEqualToStringFsstDictionary(vector, value as string);
    }

    // Generic fallback for numeric vectors
    const selectionVector = new Uint32Array(vector.size);
    let index = 0;
    for (let i = 0; i < vector.size; i++) {
        if (vector.has(i) && (vector.getValue(i) as any) <= value) {
            selectionVector[index++] = i;
        }
    }
    return new FlatSelectionVector(selectionVector, index);
}

/**
 * Filters an existing SelectionVector to only include indices where the vector value is less than or equal to the specified value.
 * Updates the SelectionVector in-place.
 *
 * @param vector The vector to check (must be a numeric or string vector type)
 * @param value The threshold value to compare against
 * @param selectionVector The SelectionVector to filter (modified in-place)
 */
export function smallerThanOrEqualToSelected<K>(
    vector: ComparableVector,
    value: K,
    selectionVector: SelectionVector
): void {
    // Optimized path for StringFlatVector
    if (vector instanceof StringDictionaryVector) {
        return smallerThanOrEqualToStringDictionarySelected(vector, value as string, selectionVector);
    }
    if (vector instanceof StringFsstDictionaryVector) {
        return smallerThanOrEqualToStringFsstDictionarySelected(vector, value as string, selectionVector);
    }

    // Generic fallback for numeric vectors
    let writeIndex = 0;
    const vectorValues = selectionVector.selectionValues();
    for (let i = 0; i < selectionVector.limit; i++) {
        const index = vectorValues[i];
        if (vector.has(index) && (vector.getValue(index) as any) <= value) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
}
