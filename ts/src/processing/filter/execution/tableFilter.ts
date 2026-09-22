import { executeNode } from "./filterExecution";
import { getNormalizedFilter } from "../filterCache";
import type { FilterSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { SelectionVector } from "../../../vector/filter/selectionVector";
import type FeatureTable from "../../../vector/featureTable";

/** Returns the selection of matching features, or undefined if the filter is not supported. */
export function filterFeatureTable(
    table: FeatureTable,
    filter: FilterSpecification | undefined,
    zoom: number,
): SelectionVector | undefined {
    const normalized = getNormalizedFilter(filter, zoom);
    if (!normalized) return undefined;
    return executeNode(table, normalized, undefined);
}
