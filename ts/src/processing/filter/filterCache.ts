import { normalizeExpression } from "./planning/filterNormalization";
import { resolveZoomExpression } from "./planning/zoomResolution";
import type { NormalizedFilter } from "./normalizedFilter";
import type { FilterSpecification } from "@maplibre/maplibre-gl-style-spec";

interface CachedFilterEntry{
    hasZoomReference: boolean;
    constant?: { value: NormalizedFilter | undefined}
    // One slot per zoom level queried; undefined = not resolved yet, value undefined = resolved and declined.
    byZoom: Array<{ value: NormalizedFilter | undefined} | undefined>;
}


const normalizedFilterCache = new WeakMap<object, CachedFilterEntry>();

function containsZoomReference(expression: unknown): boolean {
    if(!Array.isArray(expression)) return false;
    if(expression[0] === "zoom" && expression.length === 1) return true;
    for (let i = 1; i < expression.length; i++) {
        if(containsZoomReference(expression[i])) return true;
    }
    return false;
}


export function getNormalizedFilter(filter: FilterSpecification | undefined, zoom: number): NormalizedFilter | undefined {
    // fast return for simple filters that don't need normalization
    if (filter === undefined || filter === null) return {kind: "constant", value: true};
    if (typeof filter == "boolean") return {kind: "constant", value: filter};

    if (typeof filter !== "object") return undefined;

    const filterKey = filter as object;
    let cacheEntry = normalizedFilterCache.get(filterKey);

    if (!cacheEntry) {
        const hasZoomReference = containsZoomReference(filter);
        cacheEntry = {hasZoomReference, byZoom: []};
        normalizedFilterCache.set(filterKey, cacheEntry);
    }

    if (!cacheEntry.hasZoomReference) {
        cacheEntry.constant ??= {value: normalizeExpression(filter)};
        return cacheEntry.constant.value;
    }

    cacheEntry.byZoom[zoom] ??= {value: normalizeExpression(resolveZoomExpression(filter, zoom))};
    return cacheEntry.byZoom[zoom].value;
}
