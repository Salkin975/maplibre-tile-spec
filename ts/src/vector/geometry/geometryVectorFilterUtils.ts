import { type SINGLE_PART_GEOMETRY_TYPE, GEOMETRY_TYPE } from "./geometryType";
import { type SelectionVector } from "../filter/selectionVector";
import { ConstSelectionVector } from "../filter/constSelectionVector";
import { FlatSelectionVector } from "../filter/flatSelectionVector";

export const GeometryVectorFilterUtils = {

    filterConst(
        targetType: SINGLE_PART_GEOMETRY_TYPE,
        actualType: number,
        numGeometries: number
    ): SelectionVector {
        // Check for exact match or multi-type match (e.g., POINT matches MULTIPOINT which is POINT + 3)
        if (targetType !== actualType && targetType + 3 !== actualType) {
            return ConstSelectionVector.empty(numGeometries);
        }
        return ConstSelectionVector.full(numGeometries);
    },

    filterSelectedConst(
        targetType: SINGLE_PART_GEOMETRY_TYPE,
        actualType: number,
        selectionVector: SelectionVector
    ): void {
        if (targetType !== actualType && targetType + 3 !== actualType) {
            selectionVector.setLimit(0);
        }
    },

    filterFlat(
        targetType: SINGLE_PART_GEOMETRY_TYPE,
        geometryTypes: Int32Array,
        numGeometries: number
    ): SelectionVector {
        const selectionVector = new Uint32Array(numGeometries);
        let index = 0;

        for (let i = 0; i < numGeometries; i++) {
            const type = geometryTypes[i];
            if (type === targetType || type === targetType + 3) {
                selectionVector[index++] = i;
            }
        }

        // Optimize return type based on match count
        if (index === 0) {
            return ConstSelectionVector.empty(numGeometries);
        }
        if (index === numGeometries) {
            return ConstSelectionVector.full(numGeometries);
        }
        return new FlatSelectionVector(selectionVector.subarray(0, index));
    },

    filterSelectedFlat(
        targetType: SINGLE_PART_GEOMETRY_TYPE,
        geometryTypes: Int32Array,
        selectionVector: SelectionVector
    ): void {
        let limit = 0;
        const vector = selectionVector.selectionValues();

        for (let i = 0; i < selectionVector.limit; i++) {
            const index = vector[i];
            const geometryType = geometryTypes[index];
            if (targetType === geometryType || targetType + 3 === geometryType) {
                vector[limit++] = index;
            }
        }

        selectionVector.setLimit(limit);
    },

    containsPolygonGeometryConst(geometryType: number): boolean {
        return geometryType === GEOMETRY_TYPE.POLYGON || geometryType === GEOMETRY_TYPE.MULTIPOLYGON;
    },

    containsPolygonGeometryFlat(geometryTypes: Int32Array): boolean {
        for (let i = 0; i < geometryTypes.length; i++) {
            if (geometryTypes[i] === GEOMETRY_TYPE.POLYGON || geometryTypes[i] === GEOMETRY_TYPE.MULTIPOLYGON) {
                return true;
            }
        }
        return false;
    },

    containsSingleGeometryTypeConst(): boolean {
        return true;
    },

    containsSingleGeometryTypeFlat(): boolean {
        return false;
    }
}
