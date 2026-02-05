import type Vector from "../vector/vector";
import { type SelectionVector } from "../vector/filter/selectionVector";
import * as utils from "../vector/utils";
import {
    type ComparableVector,
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
    filter: (v, val) => utils.filterByValue(v, val),
    filterSelected: (v, val, sv) => utils.filterSelected(v, val, sv),
    filterNotEqual: (v, val) => utils.filterNotEqual(v, val),
    filterNotEqualSelected: (v, val, sv) => utils.filterNotEqualSelected(v, val, sv),
    match: (v, vals) => utils.match(v, vals),
    matchSelected: (v, vals, sv) => utils.matchSelected(v, vals, sv),
    noneMatch: (v, vals) => utils.noneMatch(v, vals),
    noneMatchSelected: (v, vals, sv) => utils.noneMatchSelected(v, vals, sv),
    greaterThanOrEqual: throwComparisonError,
    greaterThanOrEqualSelected: throwComparisonError,
    lessThanOrEqual: throwComparisonError,
    lessThanOrEqualSelected: throwComparisonError,
};


const stringDictHandlers: VectorTypeHandlers = {
    filter: (v, val) => utils.filterStringDictionaryByValue(v as StringDictionaryVector, val as string),
    filterSelected: (v, val, sv) => utils.filterStringDictionarySelected(v as StringDictionaryVector, val as string, sv),
    filterNotEqual: (v, val) => utils.filterStringDictionaryNotEqual(v as StringDictionaryVector, val as string),
    filterNotEqualSelected: (v, val, sv) => utils.filterStringDictionaryNotEqualSelected(v as StringDictionaryVector, val as string, sv),
    match: (v, vals) => utils.matchStringDictionary(v as StringDictionaryVector, vals as string[]),
    matchSelected: (v, vals, sv) => utils.matchStringDictionarySelected(v as StringDictionaryVector, vals as string[], sv),
    noneMatch: (v, vals) => utils.noneMatchStringDictionary(v as StringDictionaryVector, vals as string[]),
    noneMatchSelected: (v, vals, sv) => utils.noneMatchStringDictionarySelected(v as StringDictionaryVector, vals as string[], sv),
    greaterThanOrEqual: (v, val) => utils.greaterThanOrEqualToStringDictionary(v as StringDictionaryVector, val as string),
    greaterThanOrEqualSelected: (v, val, sv) => utils.greaterThanOrEqualToStringDictionarySelected(v as StringDictionaryVector, val as string, sv),
    lessThanOrEqual: (v, val) => utils.smallerThanOrEqualToStringDictionary(v as StringDictionaryVector, val as string),
    lessThanOrEqualSelected: (v, val, sv) => utils.smallerThanOrEqualToStringDictionarySelected(v as StringDictionaryVector, val as string, sv),
};


const stringFlatHandlers: VectorTypeHandlers = {
    filter: (v, val) => utils.filterStringFlatByValue(v as StringFlatVector, val as string),
    filterSelected: (v, val, sv) => utils.filterStringFlatSelected(v as StringFlatVector, val as string, sv),
    filterNotEqual: (v, val) => utils.filterStringFlatNotEqual(v as StringFlatVector, val as string),
    filterNotEqualSelected: (v, val, sv) => utils.filterStringFlatNotEqualSelected(v as StringFlatVector, val as string, sv),
    match: (v, vals) => utils.matchStringFlat(v as StringFlatVector, vals as string[]),
    matchSelected: (v, vals, sv) => utils.matchStringFlatSelected(v as StringFlatVector, vals as string[], sv),
    noneMatch: (v, vals) => utils.noneMatchStringFlat(v as StringFlatVector, vals as string[]),
    noneMatchSelected: (v, vals, sv) => utils.noneMatchStringFlatSelected(v as StringFlatVector, vals as string[], sv),
    greaterThanOrEqual: (v, val) => utils.greaterThanOrEqualToStringFlat(v as StringFlatVector, val as string),
    greaterThanOrEqualSelected: (v, val, sv) => utils.greaterThanOrEqualToStringFlatSelected(v as StringFlatVector, val as string, sv),
    lessThanOrEqual: (v, val) => utils.smallerThanOrEqualToStringFlat(v as StringFlatVector, val as string),
    lessThanOrEqualSelected: (v, val, sv) => utils.smallerThanOrEqualToStringFlatSelected(v as StringFlatVector, val as string, sv),
};


const stringFsstHandlers: VectorTypeHandlers = {
    filter: (v, val) => utils.filterStringFsstDictionaryByValue(v as StringFsstDictionaryVector, val as string),
    filterSelected: (v, val, sv) => utils.filterStringFsstDictionarySelected(v as StringFsstDictionaryVector, val as string, sv),
    filterNotEqual: (v, val) => utils.filterStringFsstDictionaryNotEqual(v as StringFsstDictionaryVector, val as string),
    filterNotEqualSelected: (v, val, sv) => utils.filterStringFsstDictionaryNotEqualSelected(v as StringFsstDictionaryVector, val as string, sv),
    match: (v, vals) => utils.matchStringFsstDictionary(v as StringFsstDictionaryVector, vals as string[]),
    matchSelected: (v, vals, sv) => utils.matchStringFsstDictionarySelected(v as StringFsstDictionaryVector, vals as string[], sv),
    noneMatch: (v, vals) => utils.noneMatchStringFsstDictionary(v as StringFsstDictionaryVector, vals as string[]),
    noneMatchSelected: (v, vals, sv) => utils.noneMatchStringFsstDictionarySelected(v as StringFsstDictionaryVector, vals as string[], sv),
    greaterThanOrEqual: (v, val) => utils.greaterThanOrEqualToStringFsstDictionary(v as StringFsstDictionaryVector, val as string),
    greaterThanOrEqualSelected: (v, val, sv) => utils.greaterThanOrEqualToStringFsstDictionarySelected(v as StringFsstDictionaryVector, val as string, sv),
    lessThanOrEqual: (v, val) => utils.smallerThanOrEqualToStringFsstDictionary(v as StringFsstDictionaryVector, val as string),
    lessThanOrEqualSelected: (v, val, sv) => utils.smallerThanOrEqualToStringFsstDictionarySelected(v as StringFsstDictionaryVector, val as string, sv),
};


// FIXED: Call through utils module namespace so spies can intercept
const genericHandlers: VectorTypeHandlers = {
    filter: (v, val) => utils.filterByValue(v, val),
    filterSelected: (v, val, sv) => utils.filterSelected(v, val, sv),
    filterNotEqual: (v, val) => utils.filterNotEqual(v, val),
    filterNotEqualSelected: (v, val, sv) => utils.filterNotEqualSelected(v, val, sv),
    match: (v, vals) => utils.match(v, vals),
    matchSelected: (v, vals, sv) => utils.matchSelected(v, vals, sv),
    noneMatch: (v, vals) => utils.noneMatch(v, vals),
    noneMatchSelected: (v, vals, sv) => utils.noneMatchSelected(v, vals, sv),
    greaterThanOrEqual: (v, val) => utils.greaterThanOrEqualTo(v as ComparableVector, val),
    greaterThanOrEqualSelected: (v, val, sv) => utils.greaterThanOrEqualToSelected(v as ComparableVector, val, sv),
    lessThanOrEqual: (v, val) => utils.smallerThanOrEqualTo(v as ComparableVector, val),
    lessThanOrEqualSelected: (v, val, sv) => utils.smallerThanOrEqualToSelected(v as ComparableVector, val, sv),
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