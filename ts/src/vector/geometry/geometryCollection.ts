import type { SelectionVector } from "../filter/selectionVector";
import type { SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";

/** Geometry column that can be filtered by geometry type, implemented by GeometryVector and GpuVector. */
export interface GeometryCollection {
    geometryType(index: number): number;
    readonly numGeometries: number;
    containsSingleGeometryType(): boolean;
    filter(geometryType: SINGLE_PART_GEOMETRY_TYPE): SelectionVector;
}
