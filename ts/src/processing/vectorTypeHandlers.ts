import type Vector from "../vector/vector";
import { type SelectionVector } from "../vector/filter/selectionVector";

import {
    filterByValue,
    filterSelected,
    filterNotEqual,
    filterNotEqualSelected,
    match,
    matchSelected,
    noneMatch,
    noneMatchSelected,
    greaterThanOrEqualTo,
    greaterThanOrEqualToSelected,
    smallerThanOrEqualTo,
    smallerThanOrEqualToSelected,
    type ComparableVector,
    filterStringDictionaryByValue,
    filterStringDictionaryNotEqual,
    matchStringDictionary,
    noneMatchStringDictionary,
    greaterThanOrEqualToStringDictionary,
    smallerThanOrEqualToStringDictionary,
    filterStringDictionarySelected,
    filterStringDictionaryNotEqualSelected,
    matchStringDictionarySelected,
    noneMatchStringDictionarySelected,
    greaterThanOrEqualToStringDictionarySelected,
    smallerThanOrEqualToStringDictionarySelected,
    filterStringFlatByValue,
    filterStringFlatNotEqual,
    matchStringFlat,
    noneMatchStringFlat,
    greaterThanOrEqualToStringFlat,
    smallerThanOrEqualToStringFlat,
    filterStringFlatSelected,
    filterStringFlatNotEqualSelected,
    matchStringFlatSelected,
    noneMatchStringFlatSelected,
    greaterThanOrEqualToStringFlatSelected,
    smallerThanOrEqualToStringFlatSelected,
    filterStringFsstDictionaryByValue,
    filterStringFsstDictionaryNotEqual,
    matchStringFsstDictionary,
    noneMatchStringFsstDictionary,
    greaterThanOrEqualToStringFsstDictionary,
    smallerThanOrEqualToStringFsstDictionary,
    filterStringFsstDictionarySelected,
    filterStringFsstDictionaryNotEqualSelected,
    matchStringFsstDictionarySelected,
    noneMatchStringFsstDictionarySelected,
    greaterThanOrEqualToStringFsstDictionarySelected,
    smallerThanOrEqualToStringFsstDictionarySelected,
} from "../vector/utils";

import { StringDictionaryVector } from "../vector/dictionary/stringDictionaryVector";
import { StringFlatVector } from "../vector/flat/stringFlatVector";
import { StringFsstDictionaryVector } from "../vector/fsst-dictionary/stringFsstDictionaryVector";
import { BooleanFlatVector } from "../vector/flat/booleanFlatVector";

export type FilterFn = (vector: Vector, value: unknown) => SelectionVector;
export type FilterSelectedFn = (vector: Vector, value: unknown, sv: SelectionVector) => void;
export type MatchFn = (vector: Vector, values: unknown[]) => SelectionVector;
export type MatchSelectedFn = (vector: Vector, values: unknown[], sv: SelectionVector) => void;

export interface VectorTypeHandlers {
    filter: FilterFn;
    filterSelected: FilterSelectedFn;
    filterNotEqual: FilterFn;
    filterNotEqualSelected: FilterSelectedFn;
    match: MatchFn;
    matchSelected: MatchSelectedFn;
    noneMatch: MatchFn;
    noneMatchSelected: MatchSelectedFn;
    greaterThanOrEqual: FilterFn;
    greaterThanOrEqualSelected: FilterSelectedFn;
    lessThanOrEqual: FilterFn;
    lessThanOrEqualSelected: FilterSelectedFn;
}

const stringDictionaryHandlers: VectorTypeHandlers = {
    filter: (vector, value) =>
        filterStringDictionaryByValue(vector as StringDictionaryVector, value as string),
    filterSelected: (vector, value, selectionVector) =>
        filterStringDictionarySelected(vector as StringDictionaryVector, value as string, selectionVector),
    filterNotEqual: (vector, value) =>
        filterStringDictionaryNotEqual(vector as StringDictionaryVector, value as string),
    filterNotEqualSelected: (vector, value, selectionVector) =>
        filterStringDictionaryNotEqualSelected(vector as StringDictionaryVector, value as string, selectionVector),
    match: (vector, values) =>
        matchStringDictionary(vector as StringDictionaryVector, values as string[]),
    matchSelected: (vector, values, selectionVector) =>
        matchStringDictionarySelected(vector as StringDictionaryVector, values as string[], selectionVector),
    noneMatch: (vector, values) =>
        noneMatchStringDictionary(vector as StringDictionaryVector, values as string[]),
    noneMatchSelected: (vector, values, selectionVector) =>
        noneMatchStringDictionarySelected(vector as StringDictionaryVector, values as string[], selectionVector),
    greaterThanOrEqual: (vector, value) =>
        greaterThanOrEqualToStringDictionary(vector as StringDictionaryVector, value as string),
    greaterThanOrEqualSelected: (vector, value, selectionVector) =>
        greaterThanOrEqualToStringDictionarySelected(vector as StringDictionaryVector, value as string, selectionVector),
    lessThanOrEqual: (vector, value) =>
        smallerThanOrEqualToStringDictionary(vector as StringDictionaryVector, value as string),
    lessThanOrEqualSelected: (vector, value, selectionVector) =>
        smallerThanOrEqualToStringDictionarySelected(vector as StringDictionaryVector, value as string, selectionVector),
};

const stringFlatHandlers: VectorTypeHandlers = {
    filter: (vector, value) => filterStringFlatByValue(vector as StringFlatVector, value as string),
    filterSelected: (vector, value, selectionVector) =>
        filterStringFlatSelected(vector as StringFlatVector, value as string, selectionVector),
    filterNotEqual: (vector, value) => filterStringFlatNotEqual(vector as StringFlatVector, value as string),
    filterNotEqualSelected: (vector, value, selectionVector) =>
        filterStringFlatNotEqualSelected(vector as StringFlatVector, value as string, selectionVector),
    match: (vector, values) => matchStringFlat(vector as StringFlatVector, values as string[]),
    matchSelected: (vector, values, selectionVector) =>
        matchStringFlatSelected(vector as StringFlatVector, values as string[], selectionVector),
    noneMatch: (vector, values) => noneMatchStringFlat(vector as StringFlatVector, values as string[]),
    noneMatchSelected: (vector, values, selectionVector) =>
        noneMatchStringFlatSelected(vector as StringFlatVector, values as string[], selectionVector),
    greaterThanOrEqual: (vector, value) =>
        greaterThanOrEqualToStringFlat(vector as StringFlatVector, value as string),
    greaterThanOrEqualSelected: (vector, value, selectionVector) =>
        greaterThanOrEqualToStringFlatSelected(vector as StringFlatVector, value as string, selectionVector),
    lessThanOrEqual: (vector, value) => smallerThanOrEqualToStringFlat(vector as StringFlatVector, value as string),
    lessThanOrEqualSelected: (vector, value, selectionVector) =>
        smallerThanOrEqualToStringFlatSelected(vector as StringFlatVector, value as string, selectionVector),
};

const stringFsstDictionaryHandlers: VectorTypeHandlers = {
    filter: (vector, value) =>
        filterStringFsstDictionaryByValue(vector as StringFsstDictionaryVector, value as string),
    filterSelected: (vector, value, selectionVector) =>
        filterStringFsstDictionarySelected(vector as StringFsstDictionaryVector, value as string, selectionVector),
    filterNotEqual: (vector, value) =>
        filterStringFsstDictionaryNotEqual(vector as StringFsstDictionaryVector, value as string),
    filterNotEqualSelected: (vector, value, selectionVector) =>
        filterStringFsstDictionaryNotEqualSelected(vector as StringFsstDictionaryVector, value as string, selectionVector),
    match: (vector, values) => matchStringFsstDictionary(vector as StringFsstDictionaryVector, values as string[]),
    matchSelected: (vector, values, selectionVector) =>
        matchStringFsstDictionarySelected(vector as StringFsstDictionaryVector, values as string[], selectionVector),
    noneMatch: (vector, values) =>
        noneMatchStringFsstDictionary(vector as StringFsstDictionaryVector, values as string[]),
    noneMatchSelected: (vector, values, selectionVector) =>
        noneMatchStringFsstDictionarySelected(vector as StringFsstDictionaryVector, values as string[], selectionVector),
    greaterThanOrEqual: (vector, value) =>
        greaterThanOrEqualToStringFsstDictionary(vector as StringFsstDictionaryVector, value as string),
    greaterThanOrEqualSelected: (vector, value, selectionVector) =>
        greaterThanOrEqualToStringFsstDictionarySelected(vector as StringFsstDictionaryVector, value as string, selectionVector),
    lessThanOrEqual: (vector, value) =>
        smallerThanOrEqualToStringFsstDictionary(vector as StringFsstDictionaryVector, value as string),
    lessThanOrEqualSelected: (vector, value, selectionVector) =>
        smallerThanOrEqualToStringFsstDictionarySelected(vector as StringFsstDictionaryVector, value as string, selectionVector)
};

const genericHandlers: VectorTypeHandlers = {
    filter: (vector, value) =>
        filterByValue(vector, value),
    filterSelected: (vector, value, selectionVector) =>
        filterSelected(vector, value, selectionVector),
    filterNotEqual: (vector, value) =>
        filterNotEqual(vector, value),
    filterNotEqualSelected: (vector, value, selectionVector) =>
        filterNotEqualSelected(vector, value, selectionVector),
    match: (vector, values) =>
        match(vector, values),
    matchSelected: (vector, values, selectionVector) =>
        matchSelected(vector, values, selectionVector),
    noneMatch: (vector, values) =>
        noneMatch(vector, values),
    noneMatchSelected: (vector, values, selectionVector) =>
        noneMatchSelected(vector, values, selectionVector),
    greaterThanOrEqual: (vector, value) =>
        greaterThanOrEqualTo(vector as ComparableVector, value),
    greaterThanOrEqualSelected: (vector, value, selectionVector) =>
        greaterThanOrEqualToSelected(vector as ComparableVector, value, selectionVector),
    lessThanOrEqual: (vector, value) =>
        smallerThanOrEqualTo(vector as ComparableVector, value),
    lessThanOrEqualSelected: (vector, value, selectionVector) =>
        smallerThanOrEqualToSelected(vector as ComparableVector, value, selectionVector),
};

const boolHandlers: VectorTypeHandlers = {
    filter: (vector, value) =>
        filterByValue(vector, value),
    filterSelected: (vector, value, selectionVector) =>
        filterSelected(vector, value, selectionVector),
    filterNotEqual: (vector, value) =>
        filterNotEqual(vector, value),
    filterNotEqualSelected: (vector, value, selectionVector) =>
        filterNotEqualSelected(vector, value, selectionVector),
    match: (vector, values) =>
        match(vector, values),
    matchSelected: (vector, values, selectionVector) =>
        matchSelected(vector, values, selectionVector),
    noneMatch: (vector, values) =>
        noneMatch(vector, values),
    noneMatchSelected: (vector, values, selectionVector) =>
        noneMatchSelected(vector, values, selectionVector),
    greaterThanOrEqual: () => {
        throw new Error("Comparison operators (>=, <=, >, <) are not supported for boolean vectors.");
    },
    greaterThanOrEqualSelected: () => {
        throw new Error("Comparison operators (>=, <=, >, <) are not supported for boolean vectors.");
    },
    lessThanOrEqual: () => {
        throw new Error("Comparison operators (>=, <=, >, <) are not supported for boolean vectors.");
    },
    lessThanOrEqualSelected: () => {
        throw new Error("Comparison operators (>=, <=, >, <) are not supported for boolean vectors.");
    },
};

export function getVectorTypeHandlers(vector: Vector): VectorTypeHandlers {
    if (vector instanceof BooleanFlatVector) return boolHandlers;
    if (vector instanceof StringDictionaryVector) return stringDictionaryHandlers;
    if (vector instanceof StringFlatVector) return stringFlatHandlers;
    if (vector instanceof StringFsstDictionaryVector) return stringFsstDictionaryHandlers;
    return genericHandlers;
}
