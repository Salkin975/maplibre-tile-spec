import { type SINGLE_PART_GEOMETRY_TYPE, GEOMETRY_TYPE } from "./geometryType";
import { type SelectionVector } from "../filter/selectionVector";
import { ConstSelectionVector } from "../filter/constSelectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";
import { type ConstGeometryVector } from "./constGeometryVector";
import { type ConstGpuVector } from "./constGpuVector";
import { type FlatGeometryVector } from "./flatGeometryVector";
import { type FlatGpuVector } from "./flatGpuVector";

/**
 * Filters a const geometry vector by type, returning a selection vector.
 *
 * For const vectors, all geometries have the same type, so either all match or none match.
 * Geometry type matching includes both exact matches and multi-type variants (e.g., POINT matches MULTIPOINT).
 *
 * @param targetType - The single-part geometry type to filter for (POINT, LINESTRING, or POLYGON)
 * @param vector - The Vector that calls this method
 * @returns ConstSelectionVector.full if types match, ConstSelectionVector.empty otherwise
 */
export function filterByTypeConst(
    targetType: SINGLE_PART_GEOMETRY_TYPE,
    vector: ConstGeometryVector | ConstGpuVector,
): SelectionVector {
    // Check for exact match or multi-type match (e.g., POINT matches MULTIPOINT which is POINT + 3)
    if (targetType !== vector.geometryType() && targetType + 3 !== vector.geometryType()) {
        return ConstSelectionVector.empty(vector.numGeometries);
    }
    return ConstSelectionVector.full(vector.numGeometries);
}

/**
 * Filters an already-selected const geometry vector by type, modifying the selection in-place.
 *
 * For const vectors, either all selected geometries match or none match.
 * If types don't match, sets selection limit to 0.
 *
 * @param targetType - The single-part geometry type to filter for
 * @param vector - The Vector that calls this method
 * @param selectionVector - Selection vector to modify in-place
 */
export function filterSelectedConst(
    targetType: SINGLE_PART_GEOMETRY_TYPE,
    vector: ConstGeometryVector | ConstGpuVector,
    selectionVector: SelectionVector
): void {
    if (targetType !== vector.geometryType() && targetType + 3 !== vector.geometryType()) {
        selectionVector.setLimit(0);
    }
}

/**
 * Filters a flat geometry vector by type, returning a selection vector of matching indices.
 *
 * Scans through all geometries and collects indices where the type matches.
 * Optimizes return type based on match count (empty, full, or flat selection).
 * Geometry type matching includes both exact matches and multi-type variants (e.g., POINT matches MULTIPOINT).
 *
 * @param targetType - The single-part geometry type to filter for
 * @param vector - The Vector that calls this method
 * @returns Selection vector containing indices of matching geometries
 */
export function filterByTypeFlat(
    targetType: SINGLE_PART_GEOMETRY_TYPE,
    vector: FlatGeometryVector | FlatGpuVector,
): SelectionVector {
    const selectionVector = new Uint32Array(vector.numGeometries);
    let index = 0;

    for (let i = 0; i < vector.numGeometries; i++) {
        const type = vector.geometryType(i);
        if (type === targetType || type === targetType + 3) {
            selectionVector[index++] = i;
        }
    }

    // Optimize return type based on match count
    if (index === 0) {
        return ConstSelectionVector.empty(vector.numGeometries);
    }
    if (index === vector.numGeometries) {
        return ConstSelectionVector.full(vector.numGeometries);
    }
    return new FlatSelectionVector(selectionVector.subarray(0, index));
}

/**
 * Filters an already-selected flat geometry vector by type, modifying the selection in-place.
 *
 * Only checks geometries currently in the selection, compacting matching indices
 * to the front of the selection array and updating the limit.
 *
 * @param targetType - The single-part geometry type to filter for
 * @param vector - The Vector that calls this method
 * @param selectionVector - Selection vector to modify in-place
 */
export function filterSelectedFlat(
    targetType: SINGLE_PART_GEOMETRY_TYPE,
    vector: FlatGeometryVector | FlatGpuVector,
    selectionVector: SelectionVector
): void {
    let limit = 0;
    const selectedValues = selectionVector.selectionValues();

    for (let i = 0; i < selectionVector.limit; i++) {
        const index = selectedValues[i];
        const geometryType = vector.geometryType(index);
        if (targetType === geometryType || targetType + 3 === geometryType) {
            vector[limit++] = index;
        }
    }

    selectionVector.setLimit(limit);
}

/**
 * Checks if a const geometry vector contains polygon geometries.
 *
 * @param geometryType - The geometry type (all geometries have this type in a const vector)
 * @returns True if the type is POLYGON or MULTIPOLYGON
 */
export function containsPolygonGeometryConst(geometryType: number): boolean {
    return geometryType === GEOMETRY_TYPE.POLYGON || geometryType === GEOMETRY_TYPE.MULTIPOLYGON;
}

/**
 * Checks if a flat geometry vector contains any polygon geometries.
 *
 * Scans through all geometry types looking for POLYGON or MULTIPOLYGON.
 *
 * @param geometryTypes - Array of geometry types to check
 * @returns True if any geometry is POLYGON or MULTIPOLYGON
 */
export function containsPolygonGeometryFlat(geometryTypes: Int32Array): boolean {
    for (let i = 0; i < geometryTypes.length; i++) {
        containsPolygonGeometryConst(geometryTypes[i]);
    }
    return false;
}
