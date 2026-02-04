import type FeatureTable from "../vector/featureTable";
import type Vector from "../vector/vector";
import { type SelectionVector } from "../vector/filter/selectionVector";
import { FlatSelectionVector } from "../vector/filter/flatSelectionVector";
import { SequenceSelectionVector } from "../vector/filter/sequenceSelectionVector";
import { ConstSelectionVector } from "../vector/filter/constSelectionVector";
import { SINGLE_PART_GEOMETRY_TYPE } from "../vector/geometry/geometryType";
import { type ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import {
    createNonNullSelectionVector,
    filterNonNullSelected,
    nullableValues,
    filterNullSelected,
} from "../vector/utils";
import { type VectorTypeHandlers, getVectorTypeHandlers } from "./vectorTypeHandlers";
import {
    unionSelectionVectors,
    invertSelectionVector,
    intersectSelectionVectors,
} from "../vector/filter/selectionVectorUtils";

// ============================================================================
// TYPES (inlined from normalizedFilter.txt)
// ============================================================================

type FilterTarget = { kind: "property"; name: string } | { kind: "geometry-type" } | { kind: "id" };

interface NormalizedLeafFilter {
    operator: string;
    target: FilterTarget;
    values: unknown[];
}

interface NormalizedCompoundFilter {
    operator: "all" | "any" | "none";
    children: NormalizedFilter[];
}

type NormalizedFilter = NormalizedLeafFilter | NormalizedCompoundFilter;

// ============================================================================
// CONSTANTS
// ============================================================================

const GEOMETRY_TYPE_POINT = SINGLE_PART_GEOMETRY_TYPE.POINT;
const GEOMETRY_TYPE_LINESTRING = SINGLE_PART_GEOMETRY_TYPE.LINESTRING;
const GEOMETRY_TYPE_POLYGON = SINGLE_PART_GEOMETRY_TYPE.POLYGON;
const EMPTY_UINT32 = new Uint32Array(0);
const EMPTY_SELECTION = new FlatSelectionVector(EMPTY_UINT32);

// ============================================================================
// EXPRESSION NORMALIZER (inlined from expressionNormalizer.txt)
// ============================================================================

function normalizeTarget(arg: unknown): FilterTarget {
    if (!Array.isArray(arg)) {
        const name = arg as string;
        if (name !== "$type" && name !== "geometry-type" && name !== "$id") {
            return { kind: "property", name };
        }
        if (name === "$type" || name === "geometry-type") {
            return { kind: "geometry-type" };
        }
        return { kind: "id" };
    }
    
    const accessor = arg[0] as string;
    if (accessor === "get") return { kind: "property", name: arg[1] as string };
    if (accessor === "geometry-type") return { kind: "geometry-type" };
    if (accessor === "id") return { kind: "id" };
    throw new Error(`Unsupported accessor: ${accessor}`);
}

function normalizeValues(expr: ExpressionSpecification, op: string): unknown[] {
    if (op === "==" || op === "!=" || op === ">=" || op === "<=" || op === ">" || op === "<") {
        return [expr[2]];
    }
    if (op === "has" || op === "!has") return [];
    
    const isExpr = Array.isArray(expr[1]);
    if (isExpr) {
        const literalArg = expr[2] as unknown[];
        if (Array.isArray(literalArg) && literalArg[0] === "literal") {
            return literalArg[1] as unknown[];
        }
        return [literalArg];
    }
    
    const len = expr.length;
    const result = new Array(len - 2);
    for (let i = 2; i < len; i++) {
        result[i - 2] = expr[i];
    }
    return result;
}

function normalizeMatch(expr: ExpressionSpecification): NormalizedLeafFilter {
    const target = normalizeTarget(expr[1]);
    const fallback = expr[expr.length - 1];
    const trueValues: unknown[] = [];
    const falseValues: unknown[] = [];

    for (let i = 2; i < expr.length - 1; i += 2) {
        const label = expr[i];
        const output = expr[i + 1];
        
        if (output === true) {
            if (Array.isArray(label)) {
                trueValues.push(...label);
            } else {
                trueValues.push(label);
            }
        } else if (output === false) {
            if (Array.isArray(label)) {
                falseValues.push(...label);
            } else {
                falseValues.push(label);
            }
        }
    }

    return {
        operator: fallback === true ? "!in" : "in",
        target,
        values: fallback === true ? falseValues : trueValues,
    };
}

function normalizeExpression(expr: ExpressionSpecification): NormalizedFilter {
    const op = expr[0] as string;

    if (op === "==" || op === "!=" || op === ">=" || op === "<=" || op === ">" || op === "<" || 
        op === "in" || op === "!in" || op === "has" || op === "!has") {
        return {
            operator: op,
            target: normalizeTarget(expr[1]),
            values: normalizeValues(expr, op),
        };
    }

    if (op === "all" || op === "any" || op === "none" || op === "!") {
        const len = expr.length;
        const children = new Array<NormalizedFilter>(len - 1);
        for (let i = 1; i < len; i++) {
            children[i - 1] = normalizeExpression(expr[i] as ExpressionSpecification);
        }
        return {
            operator: (op === "!" ? "none" : op),
            children,
        };
    }

    if (op === "match") return normalizeMatch(expr);

    throw new Error(`Unsupported filter operator: ${op}`);
}

// ============================================================================
// GEOMETRY TYPE HELPERS
// ============================================================================

function getSinglePartGeometryType(geometryType: string): SINGLE_PART_GEOMETRY_TYPE {
    const firstChar = geometryType.charCodeAt(0);
    
    if (firstChar === 80) { // 'P'
        return geometryType === "Polygon" ? GEOMETRY_TYPE_POLYGON : GEOMETRY_TYPE_POINT;
    }
    if (firstChar === 77) { // 'M'
        const secondChar = geometryType.charCodeAt(5);
        return secondChar === 80 ? GEOMETRY_TYPE_POINT : 
               secondChar === 111 ? GEOMETRY_TYPE_POLYGON : 
               GEOMETRY_TYPE_LINESTRING;
    }
    if (firstChar === 76) { // 'L'
        return GEOMETRY_TYPE_LINESTRING;
    }
    
    throw new Error("Invalid geometry type");
}

// ============================================================================
// MAIN FILTER FUNCTION
// ============================================================================

export default function filter(featureTable: FeatureTable, expression: ExpressionSpecification): SelectionVector {
    if (!expression) {
        return new SequenceSelectionVector(0, 1, featureTable.numFeatures);
    }
    const normalized = normalizeExpression(expression);
    return executeFilter(featureTable, normalized);
}

// ============================================================================
// FILTER EXECUTION
// ============================================================================

function executeFilter(
    featureTable: FeatureTable,
    normalized: NormalizedFilter,
    selectionVector?: SelectionVector,
): SelectionVector {
    const op = normalized.operator;
    
    // Check if compound - inline the check
    if (op === "all" || op === "any" || op === "none") {
        return executeCompound(featureTable, normalized as NormalizedCompoundFilter);
    }
    
    return executeLeaf(featureTable, normalized as NormalizedLeafFilter, selectionVector);
}

function executeCompound(featureTable: FeatureTable, compound: NormalizedCompoundFilter): SelectionVector {
    const op = compound.operator;
    if (op === "all") return executeAll(featureTable, compound.children);
    if (op === "any") return executeAny(featureTable, compound.children);
    return executeNone(featureTable, compound.children);
}

function executeAll(featureTable: FeatureTable, children: NormalizedFilter[]): SelectionVector {
    let selectionVector: SelectionVector | undefined;
    const len = children.length;

    for (let i = 0; i < len; i++) {
        const child = children[i];
        const childOp = child.operator;
        
        if (childOp === "all" || childOp === "any" || childOp === "none") {
            const childResult = executeCompound(featureTable, child as NormalizedCompoundFilter);
            selectionVector = selectionVector 
                ? intersectSelectionVectors(selectionVector, childResult)
                : childResult;
        } else {
            selectionVector = executeLeaf(featureTable, child as NormalizedLeafFilter, selectionVector);
        }

        if (selectionVector.limit === 0) return selectionVector;
        
        if (i < len - 1 && selectionVector instanceof ConstSelectionVector) {
            selectionVector = new FlatSelectionVector(selectionVector.selectionValues());
        }
    }

    return selectionVector;
}

function executeAny(featureTable: FeatureTable, children: NormalizedFilter[]): SelectionVector {
    const len = children.length;
    if (len === 1) return executeFilter(featureTable, children[0]);
    
    const results: SelectionVector[] = [];
    for (let i = 0; i < len; i++) {
        const result = executeFilter(featureTable, children[i]);
        if (result.limit > 0) results.push(result);
    }
    
    if (results.length === 0) return EMPTY_SELECTION;
    return unionSelectionVectors(results, featureTable.numFeatures);
}

function executeNone(featureTable: FeatureTable, children: NormalizedFilter[]): SelectionVector {
    const anyResult = executeAny(featureTable, children);
    return invertSelectionVector(anyResult, featureTable.numFeatures);
}

function executeLeaf(
    featureTable: FeatureTable,
    leaf: NormalizedLeafFilter,
    selectionVector?: SelectionVector,
): SelectionVector {
    const targetKind = leaf.target.kind;

    if (targetKind === "geometry-type") {
        return executeGeometryTypeFilter(featureTable, leaf.operator, leaf.values as string[], selectionVector);
    }

    if (targetKind === "id") {
        return executeIdFilter(featureTable, leaf.operator, leaf.values, selectionVector);
    }

    return executePropertyFilter(featureTable, leaf.operator, leaf.target.name, leaf.values, selectionVector);
}

// ============================================================================
// SPECIALIZED FILTER EXECUTORS
// ============================================================================

function executeGeometryTypeFilter(
    featureTable: FeatureTable,
    operator: string,
    geometryTypeNames: string[],
    selectionVector?: SelectionVector,
): SelectionVector {
    const geometryVector = featureTable.geometryVector;

    if (operator === "!=") {
        const geometryType = getSinglePartGeometryType(geometryTypeNames[0]);
        const matching = geometryVector.filter(geometryType);
        const inverted = invertSelectionVector(matching, featureTable.numFeatures);
        return selectionVector ? intersectSelectionVectors(selectionVector, inverted) : inverted;
    }

    if (operator !== "==" && operator !== "in") {
        throw new Error(`Operator ${operator} not supported on geometry type.`);
    }

    const len = geometryTypeNames.length;
    const typeSet = new Set<SINGLE_PART_GEOMETRY_TYPE>();
    for (let i = 0; i < len; i++) {
        typeSet.add(getSinglePartGeometryType(geometryTypeNames[i]));
    }
    
    const uniqueTypes = Array.from(typeSet);

    if (uniqueTypes.length === 1) {
        if (selectionVector) {
            geometryVector.filterSelected(uniqueTypes[0], selectionVector);
            return selectionVector;
        }
        return geometryVector.filter(uniqueTypes[0]);
    }

    const results = new Array<SelectionVector>(uniqueTypes.length);
    for (let i = 0; i < uniqueTypes.length; i++) {
        results[i] = geometryVector.filter(uniqueTypes[i]);
    }
    const union = unionSelectionVectors(results, featureTable.numFeatures);
    return selectionVector ? intersectSelectionVectors(selectionVector, union) : union;
}

function executeIdFilter(
    featureTable: FeatureTable,
    operator: string,
    values: unknown[],
    selectionVector?: SelectionVector,
): SelectionVector {
    const idVector = featureTable.idVector;
    
    if (!idVector) {
        if (operator === "!=" || operator === "!in" || operator === "!has") {
            return selectionVector ?? new SequenceSelectionVector(0, 1, featureTable.numFeatures);
        }
        return EMPTY_SELECTION;
    }

    return executeVectorOperation(idVector as unknown as Vector, operator, values, selectionVector);
}

function executePropertyFilter(
    featureTable: FeatureTable,
    operator: string,
    columnName: string,
    values: unknown[],
    selectionVector?: SelectionVector,
): SelectionVector {
    const propertyVector = featureTable.getPropertyVector(columnName);

    if (!propertyVector) {
        if (operator === "!=" || operator === "!in" || operator === "!has") {
            return selectionVector ?? new SequenceSelectionVector(0, 1, featureTable.numFeatures);
        }
        return EMPTY_SELECTION;
    }

    return executeVectorOperation(propertyVector, operator, values, selectionVector);
}

// ============================================================================
// VECTOR OPERATIONS
// ============================================================================

function executeVectorOperation(
    vector: Vector,
    operator: string,
    values: unknown[],
    selectionVector?: SelectionVector,
): SelectionVector {
    const handlers = getVectorTypeHandlers(vector);
    const hasSelection = selectionVector !== undefined;
    const value = values[0];

    switch (operator) {
        case "==":
            if (hasSelection) {
                handlers.filterSelected(vector, value, selectionVector);
                return selectionVector;
            }
            return handlers.filter(vector, value);
            
        case "in":
            if (hasSelection) {
                handlers.matchSelected(vector, values, selectionVector);
                return selectionVector;
            }
            return handlers.match(vector, values);
            
        case "!=":
            if (hasSelection) {
                handlers.filterNotEqualSelected(vector, value, selectionVector);
                return selectionVector;
            }
            return handlers.filterNotEqual(vector, value);
            
        case "!in":
            if (hasSelection) {
                handlers.noneMatchSelected(vector, values, selectionVector);
                return selectionVector;
            }
            return handlers.noneMatch(vector, values);
            
        case ">=":
            if (hasSelection) {
                handlers.greaterThanOrEqualSelected(vector, value, selectionVector);
                return selectionVector;
            }
            return handlers.greaterThanOrEqual(vector, value);
            
        case "<=":
            if (hasSelection) {
                handlers.lessThanOrEqualSelected(vector, value, selectionVector);
                return selectionVector;
            }
            return handlers.lessThanOrEqual(vector, value);
            
        case ">":
            if (hasSelection) {
                executeStrictComparisonSelected(vector, value, handlers, selectionVector, true);
                return selectionVector;
            }
            return executeStrictComparison(vector, value, handlers, true);
            
        case "<":
            if (hasSelection) {
                executeStrictComparisonSelected(vector, value, handlers, selectionVector, false);
                return selectionVector;
            }
            return executeStrictComparison(vector, value, handlers, false);
            
        case "has":
            if (hasSelection) {
                filterNonNullSelected(vector, selectionVector);
                return selectionVector;
            }
            return createNonNullSelectionVector(vector);
            
        case "!has":
            if (hasSelection) {
                filterNullSelected(vector, selectionVector);
                return selectionVector;
            }
            return nullableValues(vector);
            
        default:
            throw new Error(`Operator ${operator} not supported.`);
    }
}

function executeStrictComparison(
    vector: Vector,
    value: unknown,
    handlers: VectorTypeHandlers,
    isGreater: boolean
): SelectionVector {
    const result = isGreater 
        ? handlers.greaterThanOrEqual(vector, value)
        : handlers.lessThanOrEqual(vector, value);
    
    const selectionValues = result.selectionValues();
    const limit = result.limit;
    const filtered = new Uint32Array(limit);
    let writeIndex = 0;

    for (let i = 0; i < limit; i++) {
        const index = selectionValues[i];
        if (vector.has(index) && vector.getValue(index) !== value) {
            filtered[writeIndex++] = index;
        }
    }

    return new FlatSelectionVector(filtered, writeIndex);
}

function executeStrictComparisonSelected(
    vector: Vector,
    value: unknown,
    handlers: VectorTypeHandlers,
    selectionVector: SelectionVector,
    isGreater: boolean
): void {
    if (isGreater) {
        handlers.greaterThanOrEqualSelected(vector, value, selectionVector);
    } else {
        handlers.lessThanOrEqualSelected(vector, value, selectionVector);
    }
    
    const selectionValues = selectionVector.selectionValues();
    const limit = selectionVector.limit;
    let writeIndex = 0;

    for (let i = 0; i < limit; i++) {
        const index = selectionValues[i];
        if (vector.has(index) && vector.getValue(index) !== value) {
            selectionVector.setIndex(writeIndex++, index);
        }
    }
    selectionVector.setLimit(writeIndex);
}
