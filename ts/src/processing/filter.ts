import type FeatureTable from "../vector/featureTable";
import type Vector from "../vector/vector";
import { type SelectionVector } from "../vector/filter/selectionVector";
import { FlatSelectionVector } from "../vector/filter/flatSelectionVector";
import { SequenceSelectionVector } from "../vector/filter/sequenceSelectionVector";
import { SINGLE_PART_GEOMETRY_TYPE } from "../vector/geometry/geometryType";
import { type ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";

import {
    // Generic filter utilities
    filterByValue,
    filterSelected,
    filterNotEqual,
    filterNotEqualSelected,
    match,
    matchSelected,
    noneMatch,
    noneMatchSelected,
    createNonNullSelectionVector,
    filterNonNullSelected,
    nullableValues,
    filterNullSelected,
    // Comparison utilities
    greaterThanOrEqualTo,
    greaterThanOrEqualToSelected,
    smallerThanOrEqualTo,
    smallerThanOrEqualToSelected,
    type ComparableVector,
    // String dictionary utilities
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
    // String flat utilities
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
    // String FSST dictionary utilities
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

// Vector type imports for instanceof checks
import { StringDictionaryVector } from "../vector/dictionary/stringDictionaryVector";
import { StringFlatVector } from "../vector/flat/stringFlatVector";
import { StringFsstDictionaryVector } from "../vector/fsst-dictionary/stringFsstDictionaryVector";

// Expression type sets for O(1) lookup
const compoundExpressions = new Set(["all", "any"]);
const comparisonExpressions = new Set(["==", "!=", ">=", "<=", ">", "<"]);
const matchExpressions = new Set(["in", "!in", "has", "!has", "none"]);

// Geometry type map
const geometryTypeMap: Record<string, SINGLE_PART_GEOMETRY_TYPE> = {
    Point: SINGLE_PART_GEOMETRY_TYPE.POINT,
    LineString: SINGLE_PART_GEOMETRY_TYPE.LINESTRING,
    Polygon: SINGLE_PART_GEOMETRY_TYPE.POLYGON,
};

// Type-specific operation maps
type FilterFn = (vector: Vector, value: unknown) => SelectionVector;
type FilterSelectedFn = (vector: Vector, value: unknown, sv: SelectionVector) => void;
type MatchFn = (vector: Vector, values: unknown[]) => SelectionVector;
type MatchSelectedFn = (vector: Vector, values: unknown[], sv: SelectionVector) => void;

interface VectorTypeHandlers {
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
    filter: (vector, value) => filterStringDictionaryByValue(vector as StringDictionaryVector, value as string),
    filterSelected: (vector, value, selectionVector) =>
        filterStringDictionarySelected(vector as StringDictionaryVector, value as string, selectionVector),
    filterNotEqual: (vector, value) =>
        filterStringDictionaryNotEqual(vector as StringDictionaryVector, value as string),
    filterNotEqualSelected: (vector, value, selectionVector) =>
        filterStringDictionaryNotEqualSelected(vector as StringDictionaryVector, value as string, selectionVector),
    match: (vector, values) => matchStringDictionary(vector as StringDictionaryVector, values as string[]),
    matchSelected: (vector, values, selectionVector) =>
        matchStringDictionarySelected(vector as StringDictionaryVector, values as string[], selectionVector),
    noneMatch: (vector, values) => noneMatchStringDictionary(vector as StringDictionaryVector, values as string[]),
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
        filterStringFsstDictionaryNotEqualSelected(
            vector as StringFsstDictionaryVector,
            value as string,
            selectionVector,
        ),
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
        greaterThanOrEqualToStringFsstDictionarySelected(
            vector as StringFsstDictionaryVector,
            value as string,
            selectionVector,
        ),
    lessThanOrEqual: (vector, value) =>
        smallerThanOrEqualToStringFsstDictionary(vector as StringFsstDictionaryVector, value as string),
    lessThanOrEqualSelected: (vector, value, selectionVector) =>
        smallerThanOrEqualToStringFsstDictionarySelected(
            vector as StringFsstDictionaryVector,
            value as string,
            selectionVector,
        ),
};

const genericHandlers: VectorTypeHandlers = {
    filter: (vector, value) => filterByValue(vector, value),
    filterSelected: (vector, value, selectionVector) => filterSelected(vector, value, selectionVector),
    filterNotEqual: (vector, value) => filterNotEqual(vector, value),
    filterNotEqualSelected: (vector, value, selectionVector) =>
        filterNotEqualSelected(vector, value, selectionVector),
    match: (vector, values) => match(vector, values),
    matchSelected: (vector, values, selectionVector) => matchSelected(vector, values, selectionVector),
    noneMatch: (vector, values) => noneMatch(vector, values),
    noneMatchSelected: (vector, values, selectionVector) => noneMatchSelected(vector, values, selectionVector),
    greaterThanOrEqual: (vector, value) => greaterThanOrEqualTo(vector as ComparableVector, value),
    greaterThanOrEqualSelected: (vector, value, selectionVector) =>
        greaterThanOrEqualToSelected(vector as ComparableVector, value, selectionVector),
    lessThanOrEqual: (vector, value) => smallerThanOrEqualTo(vector as ComparableVector, value),
    lessThanOrEqualSelected: (vector, value, selectionVector) =>
        smallerThanOrEqualToSelected(vector as ComparableVector, value, selectionVector),
};

function getVectorTypeHandlers(vector: Vector): VectorTypeHandlers {
    if (vector instanceof StringDictionaryVector) return stringDictionaryHandlers;
    if (vector instanceof StringFlatVector) return stringFlatHandlers;
    if (vector instanceof StringFsstDictionaryVector) return stringFsstDictionaryHandlers;
    return genericHandlers;
}

// Match expression handlers
type MatchExpressionHandler = (
    propertyVector: Vector,
    expression: ExpressionSpecification,
    handlers: VectorTypeHandlers,
    selectionVector?: SelectionVector,
) => SelectionVector;

const matchExpressionHandlers: Record<string, MatchExpressionHandler> = {
    in: (propertyVector, expression, handlers, selectionVector) => {
        const filterLiterals = expression.slice(2);
        if (selectionVector) {
            handlers.matchSelected(propertyVector, filterLiterals, selectionVector);
            return selectionVector;
        }
        return handlers.match(propertyVector, filterLiterals);
    },
    "!in": (propertyVector, expression, handlers, selectionVector) => {
        const filterLiterals = expression.slice(2);
        if (selectionVector) {
            handlers.noneMatchSelected(propertyVector, filterLiterals, selectionVector);
            return selectionVector;
        }
        return handlers.noneMatch(propertyVector, filterLiterals);
    },
    has: (propertyVector, _expression, _handlers, selectionVector) => {
        if (selectionVector) {
            filterNonNullSelected(propertyVector, selectionVector);
            return selectionVector;
        }
        return createNonNullSelectionVector(propertyVector);
    },
    "!has": (propertyVector, _expression, _handlers, selectionVector) => {
        if (selectionVector) {
            filterNullSelected(propertyVector, selectionVector);
            return selectionVector;
        }
        return nullableValues(propertyVector);
    },
};

// Comparison expression handlers
type ComparisonExpressionHandler = (
    propertyVector: Vector,
    value: unknown,
    handlers: VectorTypeHandlers,
    selectionVector?: SelectionVector,
) => SelectionVector;

const comparisonExpressionHandlers: Record<string, ComparisonExpressionHandler> = {
    "==": (propertyVector, value, handlers, selectionVector) => {
        if (selectionVector) {
            handlers.filterSelected(propertyVector, value, selectionVector);
            return selectionVector;
        }
        return handlers.filter(propertyVector, value);
    },
    "!=": (propertyVector, value, handlers, selectionVector) => {
        if (selectionVector) {
            handlers.filterNotEqualSelected(propertyVector, value, selectionVector);
            return selectionVector;
        }
        return handlers.filterNotEqual(propertyVector, value);
    },
    ">=": (propertyVector, value, handlers, selectionVector) => {
        if (selectionVector) {
            handlers.greaterThanOrEqualSelected(propertyVector, value, selectionVector);
            return selectionVector;
        }
        return handlers.greaterThanOrEqual(propertyVector, value);
    },
    "<=": (propertyVector, value, handlers, selectionVector) => {
        if (selectionVector) {
            handlers.lessThanOrEqualSelected(propertyVector, value, selectionVector);
            return selectionVector;
        }
        return handlers.lessThanOrEqual(propertyVector, value);
    },
    ">": (propertyVector, value, handlers, selectionVector) => {
        if (selectionVector) {
            executeGreaterThanSelected(propertyVector, value, handlers, selectionVector);
            return selectionVector;
        }
        return executeGreaterThan(propertyVector, value, handlers);
    },
    "<": (propertyVector, value, handlers, selectionVector) => {
        if (selectionVector) {
            executeLessThanSelected(propertyVector, value, handlers, selectionVector);
            return selectionVector;
        }
        return executeLessThan(propertyVector, value, handlers);
    },
};

export default function filter(featureTable: FeatureTable, expression: ExpressionSpecification): SelectionVector {
    if (!expression) {
        return new SequenceSelectionVector(0, 1, featureTable.numFeatures);
    }

    if (isCompoundExpression(expression)) {
        return executeCompoundExpression(featureTable, expression);
    }
    if (isComparisonExpression(expression)) {
        return executeComparisonExpression(featureTable, expression);
    }

    if (isMatchExpression(expression)) {
        return executeMatchExpression(featureTable, expression);
    }

    throw new Error(`Filter ${expression[0]} not supported.`);
}

function isCompoundExpression(expression: ExpressionSpecification): boolean {
    return compoundExpressions.has(expression[0]);
}

function isComparisonExpression(expression: ExpressionSpecification): boolean {
    return comparisonExpressions.has(expression[0]);
}

function isMatchExpression(expression: ExpressionSpecification): boolean {
    return matchExpressions.has(expression[0]);
}

function executeCompoundExpression(
    featureTable: FeatureTable,
    expressionSpecification: ExpressionSpecification,
): SelectionVector {
    if (expressionSpecification[0] !== "all") {
        throw new Error("Specified type of CompoundExpression not supported (yet).");
    }

    let selectionVector: SelectionVector | null = null;
    const numExpressions = expressionSpecification.length - 1;

    const geometryTypeExpressionIndex = expressionSpecification.findIndex((e) => e[0] === "$type");
    if (geometryTypeExpressionIndex > 0) {
        const geometryTypeExpression = expressionSpecification.splice(geometryTypeExpressionIndex, 1)[0];
        expressionSpecification.unshift(geometryTypeExpression);
    }

    for (let i = 1; i <= numExpressions; i++) {
        const expression = expressionSpecification[i] as ExpressionSpecification;
        if (isComparisonExpression(expression)) {
            selectionVector = executeComparisonExpression(featureTable, expression, selectionVector);
        } else if (isMatchExpression(expression)) {
            selectionVector = executeMatchExpression(featureTable, expression, selectionVector);
        } else {
            throw new Error("Expression not supported.");
        }

        if (selectionVector.limit === 0) {
            return selectionVector;
        }
    }

    return selectionVector;
}

function executeMatchExpression(
    featureTable: FeatureTable,
    expression: ExpressionSpecification,
    selectionVector?: SelectionVector,
): SelectionVector {
    const comparisonInstruction = expression[0] as string;
    const columnName = expression[1] as string;

    const propertyVector = featureTable.getPropertyVector(columnName);
    if (!propertyVector) {
        if (comparisonInstruction[0] === "!") {
            return selectionVector ?? new SequenceSelectionVector(0, 1, featureTable.numFeatures);
        }
        return new FlatSelectionVector(new Uint32Array(0));
    }

    const handler = matchExpressionHandlers[comparisonInstruction];
    if (!handler) {
        throw new Error("Specified match expression not supported (yet).");
    }

    const handlers = getVectorTypeHandlers(propertyVector);
    return handler(propertyVector, expression, handlers, selectionVector);
}

function executeComparisonExpression(
    featureTable: FeatureTable,
    expression: ExpressionSpecification,
    selectionVector?: SelectionVector,
): SelectionVector {
    const comparisonInstruction = expression[0];
    const columnName = expression[1] as string;
    const predicateValue = expression[2];

    if (columnName === "$type" || columnName === "geometry-type") {
        if (comparisonInstruction === "!=") {
            throw new Error("Specified filter not supported on GeometryVector (yet).");
        }

        const geometryType = getSinglePartGeometryType(predicateValue as string);
        const geometryVector = featureTable.geometryVector;
        if (selectionVector) {
            geometryVector.filterSelected(geometryType, selectionVector);
            return selectionVector;
        }

        return geometryVector.filter(geometryType);
    }

    const propertyVector = featureTable.getPropertyVector(columnName);
    if (!propertyVector) {
        if (comparisonInstruction === "!=") {
            return selectionVector ?? new SequenceSelectionVector(0, 1, featureTable.numFeatures);
        }
        return new FlatSelectionVector(new Uint32Array(0));
    }

    const handler = comparisonExpressionHandlers[comparisonInstruction];
    if (!handler) {
        throw new Error("Comparison expression not supported.");
    }

    const handlers = getVectorTypeHandlers(propertyVector);
    return handler(propertyVector, predicateValue, handlers, selectionVector);
}

// Strict comparison implementations (> and <)

function executeGreaterThan(vector: Vector, value: unknown, handlers: VectorTypeHandlers): SelectionVector {
    const greaterThanOrEqualResult = handlers.greaterThanOrEqual(vector, value);
    const selectionValues = greaterThanOrEqualResult.selectionValues();
    const result = new Uint32Array(greaterThanOrEqualResult.limit);
    let writeIndex = 0;

    for (let i = 0; i < greaterThanOrEqualResult.limit; i++) {
        const index = selectionValues[i];
        if (vector.has(index) && vector.getValue(index) !== value) {
            result[writeIndex++] = index;
        }
    }

    return new FlatSelectionVector(result, writeIndex);
}

function executeGreaterThanSelected(
    vector: Vector,
    value: unknown,
    handlers: VectorTypeHandlers,
    selectionVector: SelectionVector,
): void {
    handlers.greaterThanOrEqualSelected(vector, value, selectionVector);
    const selectionValues = selectionVector.selectionValues();
    let writeIndex = 0;

    for (let i = 0; i < selectionVector.limit; i++) {
        const index = selectionValues[i];
        if (vector.has(index) && vector.getValue(index) !== value) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
}

function executeLessThan(vector: Vector, value: unknown, handlers: VectorTypeHandlers): SelectionVector {
    const lessThanOrEqualResult = handlers.lessThanOrEqual(vector, value);
    const selectionValues = lessThanOrEqualResult.selectionValues();
    const result = new Uint32Array(lessThanOrEqualResult.limit);
    let writeIndex = 0;

    for (let i = 0; i < lessThanOrEqualResult.limit; i++) {
        const index = selectionValues[i];
        if (vector.has(index) && vector.getValue(index) !== value) {
            result[writeIndex++] = index;
        }
    }

    return new FlatSelectionVector(result, writeIndex);
}

function executeLessThanSelected(
    vector: Vector,
    value: unknown,
    handlers: VectorTypeHandlers,
    selectionVector: SelectionVector,
): void {
    handlers.lessThanOrEqualSelected(vector, value, selectionVector);
    const selectionValues = selectionVector.selectionValues();
    let writeIndex = 0;

    for (let i = 0; i < selectionVector.limit; i++) {
        const index = selectionValues[i];
        if (vector.has(index) && vector.getValue(index) !== value) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
}

function getSinglePartGeometryType(geometryType: string): SINGLE_PART_GEOMETRY_TYPE {
    const result = geometryTypeMap[geometryType];
    if (result === undefined) {
        throw new Error("Invalid geometry type");
    }
    return result;
}
