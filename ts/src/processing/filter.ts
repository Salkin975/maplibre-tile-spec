import type FeatureTable from "../vector/featureTable";
import type Vector from "../vector/vector";
import { type SelectionVector } from "../vector/filter/selectionVector";
import { FlatSelectionVector } from "../vector/filter/flatSelectionVector";
import { SequenceSelectionVector } from "../vector/filter/sequenceSelectionVector";
import { ConstSelectionVector } from "../vector/filter/constSelectionVector";
import { SINGLE_PART_GEOMETRY_TYPE } from "../vector/geometry/geometryType";
import { type ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import { getVectorTypeHandlers } from "./vectorTypeHandlers";
import {
    unionSelectionVectors,
    invertSelectionVector,
    intersectSelectionVectors,
} from "../vector/filter/selectionVectorUtils";
import {
    createNonNullSelectionVector,
    filterNonNullSelected,
    filterNullSelected,
    nullableValues,
} from "../vector/utils/filterUtils";

/** Identifies what a filter expression targets: a named property, geometry type, or feature ID. */
type FilterTarget =
    | { kind: "property"; name: string }
    | { kind: "geometry-type" }
    | { kind: "id" };

/** A normalized leaf filter that compares a single target against one or more values. */
interface NormalizedLeafFilter {
    operator: string;
    target: FilterTarget;
    values: unknown[];
}

/** A normalized compound filter that combines child filters with a logical operator. */
interface NormalizedCompoundFilter {
    operator: "all" | "any" | "none";
    children: NormalizedFilter[];
}

/** Union of all normalized filter types (leaf or compound). */
type NormalizedFilter = NormalizedLeafFilter | NormalizedCompoundFilter;

const GEOMETRY_TYPE_POINT = SINGLE_PART_GEOMETRY_TYPE.POINT;
const GEOMETRY_TYPE_LINESTRING = SINGLE_PART_GEOMETRY_TYPE.LINESTRING;
const GEOMETRY_TYPE_POLYGON = SINGLE_PART_GEOMETRY_TYPE.POLYGON;
const EMPTY_UINT32 = new Uint32Array(0);
const EMPTY_SELECTION = new FlatSelectionVector(EMPTY_UINT32);

/**
 * Resolves a filter expression argument to a {@link FilterTarget}.
 *
 * Handles both legacy string shorthand (`"$type"`, `"$id"`, `"propName"`)
 * and expression-style accessors (`["get", "propName"]`, `["geometry-type"]`, `["id"]`).
 *
 * @param arg - The raw expression argument (string or accessor array)
 * @returns The resolved filter target
 * @throws If the accessor type is not recognized
 */
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

/**
 * Extracts the comparison value(s) from a filter expression.
 *
 * For comparison operators (`==`, `!=`, `>=`, `<=`, `>`, `<`) returns a
 * single-element array. For `has`/`!has` returns an empty array. For `in`/`!in`
 * handles both legacy variadic form and expression-style `["literal", [...]]`.
 *
 * @param expr - The full filter expression
 * @param op - The operator string
 * @returns Array of values to compare against
 */
function normalizeValues(expr: ExpressionSpecification, op: string): unknown[] {
    if (
        op === "==" ||
        op === "!=" ||
        op === ">=" ||
        op === "<=" ||
        op === ">" ||
        op === "<"
    ) {
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

/**
 * Normalizes a `match` expression into an equivalent `in` or `!in` leaf filter.
 *
 * Scans label/output pairs and collects labels that map to `true` vs `false`.
 * If the fallback is `true`, inverts to `!in` with false-labels; otherwise
 * uses `in` with true-labels.
 *
 * @param expr - A `["match", target, label1, output1, ..., fallback]` expression
 * @returns A normalized leaf filter equivalent to the match expression
 */
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

/**
 * Recursively normalizes a MapLibre GL style filter expression into a
 * {@link NormalizedFilter} tree.
 *
 * Converts all supported expression forms (comparison, membership, existence,
 * compound, and `match`) into a uniform internal representation. The `!`
 * operator is mapped to `none`.
 *
 * @param expr - A MapLibre GL style expression
 * @returns The normalized filter tree
 * @throws If the operator is not supported
 */
function normalizeExpression(expr: ExpressionSpecification): NormalizedFilter {
    const op = expr[0] as string;

    if (
        op === "==" ||
        op === "!=" ||
        op === ">=" ||
        op === "<=" ||
        op === ">" ||
        op === "<" ||
        op === "in" ||
        op === "!in" ||
        op === "has" ||
        op === "!has"
    ) {
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
            children[i - 1] = normalizeExpression(
                expr[i] as ExpressionSpecification,
            );
        }
        return {
            operator: op === "!" ? "none" : op,
            children,
        };
    }

    if (op === "match") return normalizeMatch(expr);

    throw new Error(`Unsupported filter operator: ${op}`);
}

/**
 * Maps a GeoJSON geometry type name to the corresponding {@link SINGLE_PART_GEOMETRY_TYPE} enum.
 *
 * Uses first-character dispatch for fast matching. Multi-part types
 * (`MultiPoint`, `MultiLineString`, `MultiPolygon`) are mapped to their
 * single-part equivalents.
 *
 * @param geometryType - GeoJSON geometry type name (e.g. `"Point"`, `"MultiPolygon"`)
 * @returns The matching single-part geometry type enum value
 * @throws If the geometry type name is not recognized
 */
function getSinglePartGeometryType(geometryType: string): SINGLE_PART_GEOMETRY_TYPE {
    const firstChar = geometryType.charCodeAt(0);

    if (firstChar === 80) {
        // 'P'
        return geometryType === "Polygon"
            ? GEOMETRY_TYPE_POLYGON
            : GEOMETRY_TYPE_POINT;
    }
    if (firstChar === 77) {
        // 'M'
        const secondChar = geometryType.charCodeAt(5);
        return secondChar === 80
            ? GEOMETRY_TYPE_POINT
            : secondChar === 111
                ? GEOMETRY_TYPE_POLYGON
                : GEOMETRY_TYPE_LINESTRING;
    }
    if (firstChar === 76) {
        // 'L'
        return GEOMETRY_TYPE_LINESTRING;
    }

    throw new Error("Invalid geometry type");
}

/**
 * Filters features in a {@link FeatureTable} using a MapLibre GL style filter expression.
 *
 * Returns a {@link SelectionVector} containing the indices of all features
 * that match the expression. If no expression is provided, selects all features.
 *
 * Supported operators: `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `!in`,
 * `has`, `!has`, `all`, `any`, `none`/`!`, `match`.
 * Special targets: `$type` / `geometry-type` for geometry filtering, `$id` for ID filtering.
 *
 * @param featureTable - The feature table to filter
 * @param expression - A MapLibre GL style filter expression
 * @returns A SelectionVector with matching feature indices
 */
export default function filter(featureTable: FeatureTable, expression: ExpressionSpecification): SelectionVector {
    if (!expression) {
        return new SequenceSelectionVector(0, 1, featureTable.numFeatures);
    }
    const normalized = normalizeExpression(expression);
    return executeFilter(featureTable, normalized);
}

/**
 * Dispatches a normalized filter to the appropriate executor (compound or leaf).
 *
 * @param featureTable - The feature table to filter against
 * @param normalized - The normalized filter tree node
 * @param selectionVector - Optional pre-existing selection to narrow (used by `all`)
 * @returns A SelectionVector with matching feature indices
 */
function executeFilter(featureTable: FeatureTable, normalized: NormalizedFilter, selectionVector?: SelectionVector): SelectionVector {
    const op = normalized.operator;

    if (op === "all" || op === "any" || op === "none") {
        return executeCompound(
            featureTable,
            normalized as NormalizedCompoundFilter,
        );
    }

    return executeLeaf(
        featureTable,
        normalized as NormalizedLeafFilter,
        selectionVector,
    );
}

/**
 * Routes a compound filter to the correct logical executor (`all`, `any`, or `none`).
 *
 * @param featureTable - The feature table to filter against
 * @param compound - The compound filter with its children
 * @returns A SelectionVector with matching feature indices
 */
function executeCompound(featureTable: FeatureTable, compound: NormalizedCompoundFilter): SelectionVector {
    const op = compound.operator;
    if (op === "all") return executeAll(featureTable, compound.children);
    if (op === "any") return executeAny(featureTable, compound.children);
    return executeNone(featureTable, compound.children);
}

/**
 * Executes an `all` (AND) compound filter.
 *
 * Processes children sequentially, progressively narrowing the selection.
 * Leaf children use the `selectionVector` parameter for in-place filtering;
 * compound children are intersected with the running result. Short-circuits
 * on empty selection. Converts {@link ConstSelectionVector} to
 * {@link FlatSelectionVector} when further narrowing is needed.
 *
 * @param featureTable - The feature table to filter against
 * @param children - The child filters to AND together
 * @returns A SelectionVector with indices matching all children
 */
function executeAll(featureTable: FeatureTable, children: NormalizedFilter[]): SelectionVector {
    let selectionVector: SelectionVector | undefined;
    const len = children.length;

    for (let i = 0; i < len; i++) {
        const child = children[i];
        const childOp = child.operator;

        if (childOp === "all" || childOp === "any" || childOp === "none") {
            const childResult = executeCompound(
                featureTable,
                child as NormalizedCompoundFilter,
            );
            selectionVector = selectionVector
                ? intersectSelectionVectors(selectionVector, childResult)
                : childResult;
        } else {
            selectionVector = executeLeaf(
                featureTable,
                child as NormalizedLeafFilter,
                selectionVector,
            );
        }

        if (selectionVector.limit === 0) return selectionVector;

        if (i < len - 1 && selectionVector instanceof ConstSelectionVector) {
            selectionVector = new FlatSelectionVector(
                selectionVector.selectionValues(),
            );
        }
    }

    return selectionVector;
}

/**
 * Executes an `any` (OR) compound filter.
 *
 * Evaluates each child independently and unions non-empty results using
 * {@link unionSelectionVectors}. Short-circuits to direct execution for
 * single-child expressions.
 *
 * @param featureTable - The feature table to filter against
 * @param children - The child filters to OR together
 * @returns A SelectionVector with indices matching at least one child
 */
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

/**
 * Executes a `none` (NOT-ANY) compound filter.
 *
 * Computes the `any` union of all children, then inverts the result using
 * {@link invertSelectionVector} to select features matching none of the children.
 *
 * @param featureTable - The feature table to filter against
 * @param children - The child filters to negate
 * @returns A SelectionVector with indices matching none of the children
 */
function executeNone(featureTable: FeatureTable, children: NormalizedFilter[]): SelectionVector {
    const anyResult = executeAny(featureTable, children);
    return invertSelectionVector(anyResult, featureTable.numFeatures);
}

/**
 * Dispatches a leaf filter to the appropriate specialized executor based on
 * the target kind (geometry type, feature ID, or property).
 *
 * @param featureTable - The feature table to filter against
 * @param leaf - The normalized leaf filter
 * @param selectionVector - Optional pre-existing selection to narrow
 * @returns A SelectionVector with matching feature indices
 */
function executeLeaf(featureTable: FeatureTable, leaf: NormalizedLeafFilter, selectionVector?: SelectionVector): SelectionVector {
    const targetKind = leaf.target.kind;

    if (targetKind === "geometry-type") {
        return executeGeometryTypeFilter(
            featureTable,
            leaf.operator,
            leaf.values as string[],
            selectionVector,
        );
    }

    if (targetKind === "id") {
        return executeIdFilter(
            featureTable,
            leaf.operator,
            leaf.values,
            selectionVector,
        );
    }

    return executePropertyFilter(
        featureTable,
        leaf.operator,
        leaf.target.name,
        leaf.values,
        selectionVector,
    );
}

/**
 * Filters features by geometry type (`$type` / `geometry-type`).
 *
 * Supports `==`, `in`, and `!=` operators. For `!=`, computes matching
 * features and inverts. For `in` with multiple types, unions individual
 * type matches. Intersects with an existing selection vector when provided.
 *
 * @param featureTable - The feature table to filter against
 * @param operator - The comparison operator (`==`, `!=`, or `in`)
 * @param geometryTypeNames - GeoJSON geometry type names to match
 * @param selectionVector - Optional pre-existing selection to narrow
 * @returns A SelectionVector with matching feature indices
 * @throws If the operator is not supported on geometry type
 */
function executeGeometryTypeFilter(featureTable: FeatureTable, operator: string, geometryTypeNames: string[], selectionVector?: SelectionVector): SelectionVector {
    const geometryVector = featureTable.geometryVector;

    if (operator === "!=") {
        const geometryType = getSinglePartGeometryType(geometryTypeNames[0]);
        const matching = geometryVector.filter(geometryType);
        const inverted = invertSelectionVector(
            matching,
            featureTable.numFeatures,
        );
        return selectionVector
            ? intersectSelectionVectors(selectionVector, inverted)
            : inverted;
    }

    if (operator !== "==" && operator !== "in") {
        throw new Error(
            `Operator ${operator} not supported on geometry type.`,
        );
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
    return selectionVector
        ? intersectSelectionVectors(selectionVector, union)
        : union;
}

/**
 * Filters features by their ID (`$id`).
 *
 * If no ID vector is present on the feature table, negated operators (`!=`, `!in`, `!has`)
 * return all features (or the existing selection), while positive operators return empty.
 * Otherwise delegates to {@link executeVectorOperation}.
 *
 * @param featureTable - The feature table to filter against
 * @param operator - The filter operator
 * @param values - The value(s) to compare against
 * @param selectionVector - Optional pre-existing selection to narrow
 * @returns A SelectionVector with matching feature indices
 */
function executeIdFilter(featureTable: FeatureTable, operator: string, values: unknown[], selectionVector?: SelectionVector): SelectionVector {
    const idVector = featureTable.idVector;

    if (!idVector) {
        if (operator === "!=" || operator === "!in" || operator === "!has") {
            return (
                selectionVector ??
                new SequenceSelectionVector(0, 1, featureTable.numFeatures)
            );
        }
        return EMPTY_SELECTION;
    }

    return executeVectorOperation(
        idVector as unknown as Vector,
        operator,
        values,
        selectionVector,
    );
}

/**
 * Filters features by a named property column.
 *
 * If the property does not exist on the feature table, negated operators (`!=`, `!in`, `!has`)
 * return all features (or the existing selection), while positive operators return empty.
 * Otherwise delegates to {@link executeVectorOperation}.
 *
 * @param featureTable - The feature table to filter against
 * @param operator - The filter operator
 * @param columnName - The property column name
 * @param values - The value(s) to compare against
 * @param selectionVector - Optional pre-existing selection to narrow
 * @returns A SelectionVector with matching feature indices
 */
function executePropertyFilter(featureTable: FeatureTable, operator: string, columnName: string, values: unknown[], selectionVector?: SelectionVector): SelectionVector {
    const propertyVector = featureTable.getPropertyVector(columnName);

    if (!propertyVector) {
        if (operator === "!=" || operator === "!in" || operator === "!has") {
            return (
                selectionVector ??
                new SequenceSelectionVector(0, 1, featureTable.numFeatures)
            );
        }
        return EMPTY_SELECTION;
    }

    return executeVectorOperation(
        propertyVector,
        operator,
        values,
        selectionVector,
    );
}

/**
 * Executes a filter operator against a vector, dispatching to the appropriate
 * type-specific handler from {@link getVectorTypeHandlers}.
 *
 * When a `selectionVector` is provided, uses in-place `*Selected` variants
 * that narrow the existing selection. Otherwise creates a new SelectionVector.
 *
 * @param vector - The data vector to filter
 * @param operator - The filter operator (`==`, `!=`, `in`, `!in`, `>=`, `<=`, `>`, `<`, `has`, `!has`)
 * @param values - The value(s) to compare against
 * @param selectionVector - Optional pre-existing selection to narrow
 * @returns A SelectionVector with matching feature indices
 * @throws If the operator is not recognized
 */
function executeVectorOperation(vector: Vector, operator: string, values: unknown[], selectionVector?: SelectionVector): SelectionVector {
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
                handlers.filterNotEqualSelected(
                    vector,
                    value,
                    selectionVector,
                );
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
                handlers.greaterThanOrEqualSelected(
                    vector,
                    value,
                    selectionVector,
                );
                return selectionVector;
            }
            return handlers.greaterThanOrEqual(vector, value);

        case "<=":
            if (hasSelection) {
                handlers.lessThanOrEqualSelected(
                    vector,
                    value,
                    selectionVector,
                );
                return selectionVector;
            }
            return handlers.lessThanOrEqual(vector, value);

        case ">":
            if (hasSelection) {
                executeStrictComparisonSelected(
                    vector,
                    value,
                    selectionVector,
                    true,
                );
                return selectionVector;
            }
            return executeStrictComparison(vector, value, true);

        case "<":
            if (hasSelection) {
                executeStrictComparisonSelected(
                    vector,
                    value,
                    selectionVector,
                    false,
                );
                return selectionVector;
            }
            return executeStrictComparison(vector, value, false);

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

/**
 * Single-pass strict comparison (`>` or `<`) across all vector elements.
 *
 * Scans every non-null value in the vector and selects indices where the
 * comparison holds. Avoids the two-pass approach of `>=`/`<=` + exclude-equal.
 *
 * @param vector - The data vector to compare
 * @param value - The threshold value
 * @param isGreater - `true` for `>`, `false` for `<`
 * @returns A FlatSelectionVector with matching indices
 */
function executeStrictComparison(vector: Vector, value: unknown, isGreater: boolean): SelectionVector {
    const selectionVector = new Uint32Array(vector.size);
    let index = 0;

    for (let i = 0; i < vector.size; i++) {
        if (vector.has(i)) {
            const v = vector.getValue(i);
            const matches = isGreater ? v > value : v < value;
            if (matches) {
                selectionVector[index++] = i;
            }
        }
    }

    return new FlatSelectionVector(selectionVector, index);
}

/**
 * Single-pass strict comparison (`>` or `<`) within an existing selection.
 *
 * Narrows the selection vector in-place, keeping only indices where the
 * comparison holds.
 *
 * @param vector - The data vector to compare
 * @param value - The threshold value
 * @param selectionVector - The selection to narrow (modified in-place)
 * @param isGreater - `true` for `>`, `false` for `<`
 */
function executeStrictComparisonSelected(vector: Vector, value: unknown, selectionVector: SelectionVector, isGreater: boolean): void {
    const selectionValues = selectionVector.selectionValues();
    const limit = selectionVector.limit;
    let writeIndex = 0;

    for (let i = 0; i < limit; i++) {
        const idx = selectionValues[i];
        if (vector.has(idx)) {
            const v = vector.getValue(idx);
            const matches = isGreater ? v > value : v < value;
            if (matches) {
                selectionVector.setIndex(writeIndex++, idx);
            }
        }
    }
    selectionVector.setLimit(writeIndex);
}
