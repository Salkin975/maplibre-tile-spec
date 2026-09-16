import type FeatureTable from "../../../vector/featureTable";
import { ConstSelectionVector } from "../../../vector/filter/constSelectionVector";
import { FlatSelectionVector } from "../../../vector/filter/flatSelectionVector";
import { type SelectionVector } from '../../../vector/filter/selectionVector';
import { intersectSelectionVectors, invertSelectionVector, scanSelection, unionSelectionVectors } from "../../../vector/filter/selectionVectorUtils";
import { SINGLE_PART_GEOMETRY_TYPE } from "../../../vector/geometry/geometryType";
import type Vector from '../../../vector/vector';
import { matchesNull } from '../filterUtils';
import { type FilterTarget, type NormalizedFilter, type NormalizedLeaf, type NormalizedTypeCheck } from '../normalizedFilter';
import { resolveVectorExecutor } from './filterKernel';

const GEOMETRY_TYPE_BY_NAME: Record<string, SINGLE_PART_GEOMETRY_TYPE> = {
    Point: SINGLE_PART_GEOMETRY_TYPE.POINT,
    MultiPoint: SINGLE_PART_GEOMETRY_TYPE.POINT,
    LineString: SINGLE_PART_GEOMETRY_TYPE.LINESTRING,
    MultiLineString: SINGLE_PART_GEOMETRY_TYPE.LINESTRING,
    Polygon: SINGLE_PART_GEOMETRY_TYPE.POLYGON,
    MultiPolygon: SINGLE_PART_GEOMETRY_TYPE.POLYGON,
};

/** Narrows `resolved` to the incoming selection, or passes it through when unselected. */
function restrict(selection: SelectionVector | undefined, resolved: SelectionVector): SelectionVector {
    return selection ? intersectSelectionVectors(selection, resolved) : resolved;
}


function executeGeometryTypeLeaf(table: FeatureTable, leaf: NormalizedLeaf, selection: SelectionVector | undefined): SelectionVector{
    const geometryVector = table.geometryVector;
    if (!geometryVector) {
        // Table was decoded with `includeGeometry: false`, so there is no geometry to test
        // against. Nothing can match a geometry-type predicate; `!=`/`!in` still invert below.
        const empty = ConstSelectionVector.empty(table.numFeatures);
        const inverted = leaf.operator === "!=" || leaf.operator === "!in";
        return restrict(selection, inverted ? ConstSelectionVector.full(table.numFeatures) : empty);
    }

    /** Maps Vector Geometry Type to GEOMETRY_TYPE_BY_NAME */
    const geometryTypes = (leaf.values as string[])
        .map((name) => GEOMETRY_TYPE_BY_NAME[name])
        .filter((type): type is SINGLE_PART_GEOMETRY_TYPE => type !== undefined);

    const matches = unionSelectionVectors(
        geometryTypes.map((type) => geometryVector.filter(type)),
        table.numFeatures,
    );

    const invert = leaf.operator === "!=" || leaf.operator === "!in";
    const resolved = invert ? invertSelectionVector(matches, table.numFeatures) : matches;
    return restrict(selection, resolved);
}

function resolveLeafVector(table: FeatureTable, target: Exclude<FilterTarget, {kind: "geometry-type"}>):Vector | undefined{
    if (target.kind === "id") return table.idVector;
    return table.getPropertyVector(target.name);
}

function executeMissingVectorLeaf(leaf: NormalizedLeaf, numFeaturs: number, selection: SelectionVector | undefined): SelectionVector{
    const matchesEverything = 
        leaf.operator === "has"
            ? false
            : leaf.operator === "!has"
                ? true
                : matchesNull(leaf.operator, leaf.values);

    const resolved = matchesEverything ? ConstSelectionVector.full(numFeaturs) : ConstSelectionVector.empty(numFeaturs);
    return restrict(selection, resolved);
}

function executeLeaf(table: FeatureTable, leaf: NormalizedLeaf, selection: SelectionVector | undefined): SelectionVector{
    if(leaf.target.kind === "geometry-type") return executeGeometryTypeLeaf(table, leaf, selection);

    const vector = resolveLeafVector(table, leaf.target);
    if (!vector) return executeMissingVectorLeaf(leaf, table.numFeatures, selection);

    return resolveVectorExecutor(vector, leaf.operator, leaf.values)(selection);
}

function typeNameOf(value: unknown){
    if(value === null || value === undefined) return "null";
    const name = typeof value;
    return name === "bigint" ? "number" : name;
}

function executeTypeCheck(table: FeatureTable, node: NormalizedTypeCheck, selection: SelectionVector | undefined): SelectionVector{
    const vector = resolveLeafVector(table, node.target);

    const matches = vector
        ? scanSelection(table.numFeatures, (index) => typeNameOf(vector.getValue(index)) === node.typeName)
        : node.typeName === "null"
            ? ConstSelectionVector.full(table.numFeatures)
            : ConstSelectionVector.empty(table.numFeatures);
    
    const resolved = node.negated ? invertSelectionVector(matches, table.numFeatures) : matches;
    return restrict(selection, resolved);
}

function executeAll(table: FeatureTable, children: NormalizedFilter[], selection: SelectionVector | undefined): SelectionVector{
    let current = selection;
    for (const child of children) {
        current = executeNode(table, child, current);
        if (current.limit === 0) break;
    }
    return current ?? ConstSelectionVector.full(table.numFeatures);
}

function cloneSelection(selection: SelectionVector | undefined): SelectionVector | undefined {
    if (!selection || selection instanceof ConstSelectionVector) return selection;
    // selectionValues() is already narrowed to the live range, so slice() copies exactly it.
    return new FlatSelectionVector(selection.selectionValues().slice());
}

function executeAny(table: FeatureTable, children: NormalizedFilter[], selection: SelectionVector | undefined): SelectionVector{
    return unionSelectionVectors(
        children.map((child) => executeNode(table, child, cloneSelection(selection))),
        table.numFeatures
    )
}

function executeNone(table: FeatureTable, children: NormalizedFilter[], selection: SelectionVector | undefined): SelectionVector{
    const matches = executeAny(table, children, selection);
    const inverted = invertSelectionVector(matches, table.numFeatures);
    return restrict(selection, inverted);
}


export function executeNode(table: FeatureTable, node: NormalizedFilter, selection: SelectionVector | undefined): SelectionVector {
    if (node.kind === "constant") {
        const resolved = node.value ? ConstSelectionVector.full(table.numFeatures) : ConstSelectionVector.empty(table.numFeatures);
        return restrict(selection, resolved);
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