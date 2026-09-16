import { getNormalizedFilter } from "../filterCache";
import { normalizeExpression } from "./filterNormalization";
import type { FilterSpecification } from "@maplibre/maplibre-gl-style-spec";

export function isColumnarFilterSupportedAtZoom(filter: FilterSpecification | undefined, zoom: number): boolean{
    return getNormalizedFilter(filter, zoom) !== undefined;
}

export function isColumnarBucketSupported(
    encoding: string,
    filter: FilterSpecification | undefined,
    zoom: number,
    layerId?: string
): boolean{
    if(encoding !== "mlt") return false;
    if(isColumnarFilterSupportedAtZoom(filter, zoom)) return true;
    reportFilters(filter, layerId);
    return false
}

const reportedFilters = new WeakSet<object>();

const COMPOUND_WALK_OPERATORS = new Set(["all", "any", "none", "!"]);

/** Walks into compounds to find the specific child that fails to normalize, rather than blaming the whole tree. */
function findOffendingNode(expr: unknown): unknown {
    if (!Array.isArray(expr) || expr.length === 0) return expr;
    if (COMPOUND_WALK_OPERATORS.has(expr[0])) {
        for (let i = 1; i < expr.length; i++) {
            const child = expr[i];
            if (normalizeExpression(child) === undefined) return findOffendingNode(child);
        }
    }
    return expr;
}

function reportFilters(filter: unknown, layerId?: string){
    if (typeof filter !== "object" || filter === null) return;
    if (reportedFilters.has(filter)) return;
    reportedFilters.add(filter);
    // Terse, deduped-per-filter — mirrors the shape of style-spec's own runtime diagnostics
    // (`expression/index.ts`'s `console.warn(e.message)`) rather than a verbose explainer.
    const where = layerId === undefined ? "" : `layer "${layerId}": `;
    const offending = JSON.stringify(findOffendingNode(filter));
    console.warn(`${where}filter is not supported: ${offending}`);
}
