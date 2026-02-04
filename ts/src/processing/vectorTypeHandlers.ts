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

const throwComparisonError = (): never => {
    throw new Error("Comparison operators (>=, <=, >, <) are not supported for boolean vectors.");
};

// Pre-allocated handler objects
const boolHandlers: VectorTypeHandlers = {
    filter: filterByValue,
    filterSelected,
    filterNotEqual,
    filterNotEqualSelected,
    match,
    matchSelected,
    noneMatch,
    noneMatchSelected,
    greaterThanOrEqual: throwComparisonError,
    greaterThanOrEqualSelected: throwComparisonError,
    lessThanOrEqual: throwComparisonError,
    lessThanOrEqualSelected: throwComparisonError,
};

const stringDictHandlers: VectorTypeHandlers = {
    filter: (v, val) => filterStringDictionaryByValue(v as StringDictionaryVector, val as string),
    filterSelected: (v, val, sv) => filterStringDictionarySelected(v as StringDictionaryVector, val as string, sv),
    filterNotEqual: (v, val) => filterStringDictionaryNotEqual(v as StringDictionaryVector, val as string),
    filterNotEqualSelected: (v, val, sv) => filterStringDictionaryNotEqualSelected(v as StringDictionaryVector, val as string, sv),
    match: (v, vals) => matchStringDictionary(v as StringDictionaryVector, vals as string[]),
    matchSelected: (v, vals, sv) => matchStringDictionarySelected(v as StringDictionaryVector, vals as string[], sv),
    noneMatch: (v, vals) => noneMatchStringDictionary(v as StringDictionaryVector, vals as string[]),
    noneMatchSelected: (v, vals, sv) => noneMatchStringDictionarySelected(v as StringDictionaryVector, vals as string[], sv),
    greaterThanOrEqual: (v, val) => greaterThanOrEqualToStringDictionary(v as StringDictionaryVector, val as string),
    greaterThanOrEqualSelected: (v, val, sv) => greaterThanOrEqualToStringDictionarySelected(v as StringDictionaryVector, val as string, sv),
    lessThanOrEqual: (v, val) => smallerThanOrEqualToStringDictionary(v as StringDictionaryVector, val as string),
    lessThanOrEqualSelected: (v, val, sv) => smallerThanOrEqualToStringDictionarySelected(v as StringDictionaryVector, val as string, sv),
};

const stringFlatHandlers: VectorTypeHandlers = {
    filter: (v, val) => filterStringFlatByValue(v as StringFlatVector, val as string),
    filterSelected: (v, val, sv) => filterStringFlatSelected(v as StringFlatVector, val as string, sv),
    filterNotEqual: (v, val) => filterStringFlatNotEqual(v as StringFlatVector, val as string),
    filterNotEqualSelected: (v, val, sv) => filterStringFlatNotEqualSelected(v as StringFlatVector, val as string, sv),
    match: (v, vals) => matchStringFlat(v as StringFlatVector, vals as string[]),
    matchSelected: (v, vals, sv) => matchStringFlatSelected(v as StringFlatVector, vals as string[], sv),
    noneMatch: (v, vals) => noneMatchStringFlat(v as StringFlatVector, vals as string[]),
    noneMatchSelected: (v, vals, sv) => noneMatchStringFlatSelected(v as StringFlatVector, vals as string[], sv),
    greaterThanOrEqual: (v, val) => greaterThanOrEqualToStringFlat(v as StringFlatVector, val as string),
    greaterThanOrEqualSelected: (v, val, sv) => greaterThanOrEqualToStringFlatSelected(v as StringFlatVector, val as string, sv),
    lessThanOrEqual: (v, val) => smallerThanOrEqualToStringFlat(v as StringFlatVector, val as string),
    lessThanOrEqualSelected: (v, val, sv) => smallerThanOrEqualToStringFlatSelected(v as StringFlatVector, val as string, sv),
};

const stringFsstHandlers: VectorTypeHandlers = {
    filter: (v, val) => filterStringFsstDictionaryByValue(v as StringFsstDictionaryVector, val as string),
    filterSelected: (v, val, sv) => filterStringFsstDictionarySelected(v as StringFsstDictionaryVector, val as string, sv),
    filterNotEqual: (v, val) => filterStringFsstDictionaryNotEqual(v as StringFsstDictionaryVector, val as string),
    filterNotEqualSelected: (v, val, sv) => filterStringFsstDictionaryNotEqualSelected(v as StringFsstDictionaryVector, val as string, sv),
    match: (v, vals) => matchStringFsstDictionary(v as StringFsstDictionaryVector, vals as string[]),
    matchSelected: (v, vals, sv) => matchStringFsstDictionarySelected(v as StringFsstDictionaryVector, vals as string[], sv),
    noneMatch: (v, vals) => noneMatchStringFsstDictionary(v as StringFsstDictionaryVector, vals as string[]),
    noneMatchSelected: (v, vals, sv) => noneMatchStringFsstDictionarySelected(v as StringFsstDictionaryVector, vals as string[], sv),
    greaterThanOrEqual: (v, val) => greaterThanOrEqualToStringFsstDictionary(v as StringFsstDictionaryVector, val as string),
    greaterThanOrEqualSelected: (v, val, sv) => greaterThanOrEqualToStringFsstDictionarySelected(v as StringFsstDictionaryVector, val as string, sv),
    lessThanOrEqual: (v, val) => smallerThanOrEqualToStringFsstDictionary(v as StringFsstDictionaryVector, val as string),
    lessThanOrEqualSelected: (v, val, sv) => smallerThanOrEqualToStringFsstDictionarySelected(v as StringFsstDictionaryVector, val as string, sv),
};

const genericHandlers: VectorTypeHandlers = {
    filter: filterByValue,
    filterSelected,
    filterNotEqual,
    filterNotEqualSelected,
    match,
    matchSelected,
    noneMatch,
    noneMatchSelected,
    greaterThanOrEqual: (v, val) => greaterThanOrEqualTo(v as ComparableVector, val),
    greaterThanOrEqualSelected: (v, val, sv) => greaterThanOrEqualToSelected(v as ComparableVector, val, sv),
    lessThanOrEqual: (v, val) => smallerThanOrEqualTo(v as ComparableVector, val),
    lessThanOrEqualSelected: (v, val, sv) => smallerThanOrEqualToSelected(v as ComparableVector, val, sv),
};

const handlerCache = new WeakMap<Vector, VectorTypeHandlers>();

export function getVectorTypeHandlers(vector: Vector): VectorTypeHandlers {
    let handlers = handlerCache.get(vector);
    if (handlers) return handlers;

    if (vector instanceof BooleanFlatVector) {
        handlers = boolHandlers;
    } else if (vector instanceof StringDictionaryVector) {
        handlers = stringDictHandlers;
    } else if (vector instanceof StringFlatVector) {
        handlers = stringFlatHandlers;
    } else if (vector instanceof StringFsstDictionaryVector) {
        handlers = stringFsstHandlers;
    } else {
        handlers = genericHandlers;
    }

    handlerCache.set(vector, handlers);
    return handlers;
}
