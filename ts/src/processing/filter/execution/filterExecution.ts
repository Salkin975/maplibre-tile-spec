import type FeatureTable from "../../../vector/featureTable";
import { ConstSelectionVector } from "../../../vector/filter/constSelectionVector";
import { FlatSelectionVector } from "../../../vector/filter/flatSelectionVector";
import { type SelectionVector } from "../../../vector/filter/selectionVector";
import {
    intersectSelectionVectors,
    invertSelectionVector,
    scanSelection,
    unionSelectionVectors,
} from "../../../vector/filter/selectionVectorUtils";
import { SINGLE_PART_GEOMETRY_TYPE } from "../../../vector/geometry/geometryType";
import type Vector from "../../../vector/vector";
import { isNegatedOperator, matchesNull, type ValueComparisonOperator } from "../filterUtils";
import {
    type FilterTarget,
    type NormalizedFilter,
    type NormalizedLeaf,
    type NormalizedTypeCheck,
} from "../normalizedFilter";
import { resolveVectorExecutor } from "./filterKernel";

const GEOMETRY_TYPE_BY_NAME: Record<string, SINGLE_PART_GEOMETRY_TYPE> = {
    Point: SINGLE_PART_GEOMETRY_TYPE.POINT,
    MultiPoint: SINGLE_PART_GEOMETRY_TYPE.POINT,
    LineString: SINGLE_PART_GEOMETRY_TYPE.LINESTRING,
    MultiLineString: SINGLE_PART_GEOMETRY_TYPE.LINESTRING,
    Polygon: SINGLE_PART_GEOMETRY_TYPE.POLYGON,
    MultiPolygon: SINGLE_PART_GEOMETRY_TYPE.POLYGON,
};

/** Selects every feature when `isMatch` is true, none otherwise. */
function constantSelection(isMatch: boolean, numFeatures: number): SelectionVector {
    return isMatch ? ConstSelectionVector.full(numFeatures) : ConstSelectionVector.empty(numFeatures);
}

/** Narrows `resolvedSelection` to the incoming selection, or passes it through when unselected. */
function restrict(selection: SelectionVector | undefined, resolvedSelection: SelectionVector): SelectionVector {
    return selection ? intersectSelectionVectors(selection, resolvedSelection) : resolvedSelection;
}

function executeGeometryTypeLeaf(
    table: FeatureTable,
    leaf: NormalizedLeaf,
    selection: SelectionVector | undefined,
): SelectionVector {
    // Existence operators never target the geometry type, normalization folds them to constants
    const isNegated = isNegatedOperator(leaf.operator as ValueComparisonOperator);
    const geometryVector = table.geometryVector;
    if (!geometryVector) {
        // No geometry column, so nothing matches a positive geometry-type predicate
        return restrict(selection, constantSelection(isNegated, table.numFeatures));
    }

    // Maps the style geometry names to the vector geometry types
    const geometryTypes = (leaf.values as string[])
        .map((geometryTypeName) => GEOMETRY_TYPE_BY_NAME[geometryTypeName])
        .filter((geometryType): geometryType is SINGLE_PART_GEOMETRY_TYPE => geometryType !== undefined);

    const matchingSelection = unionSelectionVectors(
        geometryTypes.map((geometryType) => geometryVector.filter(geometryType)),
        table.numFeatures,
    );

    const resolvedSelection = isNegated
        ? invertSelectionVector(matchingSelection, table.numFeatures)
        : matchingSelection;
    return restrict(selection, resolvedSelection);
}

function resolveLeafVector(
    table: FeatureTable,
    target: Exclude<FilterTarget, { kind: "geometry-type" }>,
): Vector | undefined {
    if (target.kind === "id") return table.idVector;
    return table.getPropertyVector(target.name);
}

function executeMissingVectorLeaf(
    leaf: NormalizedLeaf,
    numFeatures: number,
    selection: SelectionVector | undefined,
): SelectionVector {
    const isFullMatch =
        leaf.operator === "has" ? false : leaf.operator === "!has" ? true : matchesNull(leaf.operator, leaf.values);

    return restrict(selection, constantSelection(isFullMatch, numFeatures));
}

function executeLeaf(
    table: FeatureTable,
    leaf: NormalizedLeaf,
    selection: SelectionVector | undefined,
): SelectionVector {
    if (leaf.target.kind === "geometry-type") return executeGeometryTypeLeaf(table, leaf, selection);

    const vector = resolveLeafVector(table, leaf.target);
    if (!vector) return executeMissingVectorLeaf(leaf, table.numFeatures, selection);

    return resolveVectorExecutor(vector, leaf.operator, leaf.values)(selection);
}

function typeNameOf(value: unknown): string {
    if (value === null || value === undefined) return "null";
    const typeName = typeof value;
    return typeName === "bigint" ? "number" : typeName;
}

function executeTypeCheck(
    table: FeatureTable,
    node: NormalizedTypeCheck,
    selection: SelectionVector | undefined,
): SelectionVector {
    const vector = resolveLeafVector(table, node.target);

    const matchingSelection = vector
        ? scanSelection(table.numFeatures, (index) => typeNameOf(vector.getValue(index)) === node.typeName)
        : constantSelection(node.typeName === "null", table.numFeatures);

    const resolvedSelection = node.isNegated
        ? invertSelectionVector(matchingSelection, table.numFeatures)
        : matchingSelection;
    return restrict(selection, resolvedSelection);
}

function executeAll(
    table: FeatureTable,
    children: NormalizedFilter[],
    selection: SelectionVector | undefined,
): SelectionVector {
    let currentSelection = selection;
    for (const child of children) {
        currentSelection = executeNode(table, child, currentSelection);
        if (currentSelection.limit === 0) break;
    }
    return currentSelection ?? ConstSelectionVector.full(table.numFeatures);
}

function cloneSelection(selection: SelectionVector | undefined): SelectionVector | undefined {
    if (!selection || selection instanceof ConstSelectionVector) return selection;
    // Copies only the live range
    return new FlatSelectionVector(selection.selectionValues().slice());
}

function executeAny(
    table: FeatureTable,
    children: NormalizedFilter[],
    selection: SelectionVector | undefined,
): SelectionVector {
    return unionSelectionVectors(
        children.map((child) => executeNode(table, child, cloneSelection(selection))),
        table.numFeatures,
    );
}

function executeNone(
    table: FeatureTable,
    children: NormalizedFilter[],
    selection: SelectionVector | undefined,
): SelectionVector {
    const matchingSelection = executeAny(table, children, selection);
    const invertedSelection = invertSelectionVector(matchingSelection, table.numFeatures);
    return restrict(selection, invertedSelection);
}

/** Evaluates a normalized filter on the table, restricted to `selection` if given. */
export function executeNode(
    table: FeatureTable,
    node: NormalizedFilter,
    selection: SelectionVector | undefined,
): SelectionVector {
    if (node.kind === "constant") {
        return restrict(selection, constantSelection(node.value, table.numFeatures));
    }
    if (node.kind === "leaf") {
        return executeLeaf(table, node, selection);
    }
    if (node.kind === "type-check") {
        return executeTypeCheck(table, node, selection);
    }
    switch (node.operator) {
        case "all":
            return executeAll(table, node.children, selection);
        case "any":
            return executeAny(table, node.children, selection);
        case "none":
            return executeNone(table, node.children, selection);
    }
}
