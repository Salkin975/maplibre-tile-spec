import { bench, describe } from "vitest";
import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import type { FilterSpecification } from "@maplibre/maplibre-gl-style-spec";

import * as mlt from ".";
import {
    fixturesAvailable,
    TILE_COORDS,
    MUNICH_TILE_COORDS,
    openMvtDb,
    openMltDb,
    readTile,
    maybeGunzip,
    styleAvailable,
    loadStyleLayers,
    activeAtZoom,
} from "./realTileFixtures";

/**
 * How fast does MLT *filter* a tile, and how much did that improve across the four work-stream
 * branches? This file is the measurement instrument for that question, and it is meant to be
 * byte-identical on every rung of the ladder:
 *
 *   as1-vektor-infrastruktur  vector infrastructure, NO filter engine  (the "before" state)
 *   as2-filter-engine         + columnar filter engine
 *   as3-lazy-decoding         + lazy id/geometry/property decoding
 *   as4-perf-metadata-varint  + metadata/varint allocation cuts
 *   dev                       + FilterScratch
 *
 * Run one rung with `npx vitest bench --run src/filterProgression.bench.ts`; `ts/bench/` drives all
 * five. Registers zero benchmarks when the local mbtiles aren't present (see realTileFixtures.ts).
 *
 * ## Why this file exists next to realTileParity.bench.ts
 *
 * realTileParity.bench.ts is written against HEAD's API — it imports `filterFeatureTable`,
 * `isColumnarBucketSupported` and `FilterScratch` by name, so it cannot even resolve on a branch
 * that predates them, and it exists in three different versions across the branches whose numbers
 * therefore don't join. This file is the portable variant: same tiles, same style, same scenarios
 * on every rung, so the columns of the result table are actually comparable.
 *
 * ## The four portability seams
 *
 *  1. `import * as mlt from "."` rather than named imports. A missing export reads back as
 *     `undefined` instead of failing module resolution — this is what lets the file load on as1,
 *     whose index.ts does not re-export `./processing/filterExports` at all.
 *  2. `FilterScratch` is feature-detected (dev only). Where absent, the argument is simply omitted;
 *     `filterFeatureTable` ignores extra/missing trailing args identically on every rung.
 *  3. `GeometryVector.prototype.getGeometry` is feature-detected. Present on as1..dev (verified), so
 *     the `getGeometries()` bulk fallback is currently inert — it stays for the case where an
 *     earlier rung (upstream `main`, which has no random geometry access) is added later.
 *  4. `MLT_BENCH_TIME` / `MLT_BENCH_WARMUP` shrink the per-bench budget for smoke runs.
 *
 * Decode options are deliberately NOT switched. as3/as4 default to lazy already
 * (`eagerProperties`/`eagerGeometry`/`eagerId` all default false) and dev no longer has those
 * options at all — every rung is measured in its own default state, which is exactly the question.
 *
 * ## The scenarios
 *
 * F0 `parse` — context, not a filter measurement. It is here because lazy decoding (as3) *moves*
 *    work out of decode and into first column access: without a decode column next to the filter
 *    columns, deferred work would read as a filtering win.
 * F1 `filter only` — the actual question. `filterFeatureTable()` down to a `SelectionVector` and
 *    nothing else: no geometry, no property materialization. Nothing in realTileParity.bench.ts
 *    measures this — its filter scenario always materializes the matches too, mixing the kernel's
 *    cost with `getGeometry()`/`getValue()`.
 * F2 `filter + materialize matches` — the same filter, but paying for the survivors. The delta
 *    F2-F1 is what materialization costs on top of the filter.
 * F3 `full style, per tile arrival` — a whole real style (~122 filterable layers, zoom-gated),
 *    decoded fresh every iteration, each layer gated through `isColumnarBucketSupported` exactly as
 *    maplibre-gl-js's `createBucket()` does. The realistic renderer path.
 * F4 `full style xN, already-decoded` — decode once outside the timed function, then N full-style
 *    passes against it. Shows MLT amortizing decode across repeated queries (re-filter, hover/click),
 *    which F3 by construction never lets it do.
 *
 * On as1 there is no filter engine, so F1-F4 take the row-based path a consumer actually had before
 * work stream 2: materialize every feature into a plain object and run style-spec's `featureFilter`
 * over it. On that rung F1 and F2 therefore measure nearly the same thing — a row-based filter cannot
 * separate "filter" from "materialize". That is the finding, not a measurement artifact, and the
 * results table has to say so rather than presenting F1(as1) as a like-for-like kernel number.
 *
 * The MVT arm is the control. Its code is byte-identical on all five rungs and never touches MLT, so
 * its spread across the rungs IS this campaign's noise floor. An MLT delta smaller than the MVT arm's
 * own rung-to-rung spread is not a result — DESIGN-DE.md section 8.4 learned this the expensive way.
 *
 * Group and bench names must stay stable across rungs: `ts/bench/benchAvg.mjs` joins result files on
 * them and aborts on a key mismatch rather than silently averaging different things.
 */

/** Absent on as1: its index.ts does not re-export ./processing/filterExports. */
const filterFeatureTable = (mlt as Record<string, unknown>).filterFeatureTable as
    | ((
          table: unknown,
          filter: FilterSpecification | undefined,
          zoom: number,
          scratch?: unknown,
      ) => { limit: number; getIndex(i: number): number } | undefined)
    | undefined;

const isColumnarBucketSupported = (mlt as Record<string, unknown>).isColumnarBucketSupported as
    | ((encoding: string, filter: FilterSpecification | undefined, zoom: number, layerId?: string) => boolean)
    | undefined;

/** Present only on dev (added in 22d6801e). */
const FilterScratchCtor = (mlt as Record<string, unknown>).FilterScratch as (new () => unknown) | undefined;

/** Random geometry access arrived with work stream 1, so this is true on every rung measured here. */
const GeometryVectorClass = (mlt as Record<string, unknown>).GeometryVector as
    | { prototype: { getGeometry?: unknown } }
    | undefined;
const hasRandomGeometryAccess = typeof GeometryVectorClass?.prototype?.getGeometry === "function";

const decodeTile = mlt.decodeTile as unknown as (
    tile: Uint8Array,
    geometryScaling?: unknown,
    idWithinMaxSafeInteger?: boolean,
) => MltTable[];

const TIME = Number(process.env.MLT_BENCH_TIME ?? 3000);
const WARMUP = Number(process.env.MLT_BENCH_WARMUP ?? 500);
const OPTS = { warmupTime: WARMUP, time: TIME };

/** See F4. Kept small on purpose — the point is the shape of the curve, not its endpoint. */
const REPEAT_COUNTS = [1, 2, 5];

const FILTER_LAYER = "transportation";
const FILTER_PROPERTY = "class";
const FILTER_SPEC = ["==", ["get", FILTER_PROPERTY], "motorway"] as unknown as FilterSpecification;
const compiledMvtFilter = featureFilter(FILTER_SPEC);

type StyleSpecFeature = Parameters<typeof compiledMvtFilter.filter>[1];

type MltTable = {
    name: string;
    numFeatures: number;
    geometryVector: {
        geometryType(i: number): number;
        getGeometries(): unknown[][];
        getGeometry?(i: number): unknown[];
    };
    propertyVectors: Array<{ name: string; getValue(i: number): unknown } | undefined>;
    getPropertyVector(name: string): { getValue(i: number): unknown } | undefined;
};

let checksum = 0;

/** Mirrors MVT's numeric feature.type (0=Unknown,1=Point,2=LineString,3=Polygon). */
function toStyleSpecFeature(f: VectorTileFeature): StyleSpecFeature {
    return { type: f.type, properties: f.properties, id: f.id } as StyleSpecFeature;
}

/** MLT GEOMETRY_TYPE (POINT=0..MULTIPOLYGON=5) to MVT's numeric type, for the row-based path. */
function toMvtType(mltType: number): number {
    return (mltType % 3) + 1;
}

function geometryAt(vector: MltTable["geometryVector"], index: number, bulk: unknown[][] | null): unknown[] {
    return bulk ? bulk[index] : vector.getGeometry!(index);
}

/** Materializes one MLT row into the plain object shape style-spec's featureFilter expects. */
function mltRowToStyleFeature(table: MltTable, i: number): { feature: StyleSpecFeature; properties: Record<string, unknown> } {
    const properties: Record<string, unknown> = {};
    for (const column of table.propertyVectors) {
        if (!column) continue;
        const value = column.getValue(i);
        if (value !== null) properties[column.name] = value;
    }
    return {
        feature: { type: toMvtType(table.geometryVector.geometryType(i)), properties, id: undefined } as unknown as StyleSpecFeature,
        properties,
    };
}

/**
 * The row-based path as it existed before work stream 2 — used on as1, and on every rung for a layer
 * whose filter the columnar engine can't express (what `createBucket()` falls back to there too).
 * `materialize: false` still has to build each feature's properties, because that is the only way a
 * row-oriented reader can evaluate a filter at all; that inseparability is the point of the F1/as1 cell.
 */
function mltRowFilterPass(
    table: MltTable,
    compiled: ReturnType<typeof featureFilter>,
    z: number,
    materialize: boolean,
): void {
    const geometryVector = table.geometryVector;
    const bulk = hasRandomGeometryAccess ? null : geometryVector.getGeometries();
    for (let i = 0; i < table.numFeatures; i++) {
        const { feature, properties } = mltRowToStyleFeature(table, i);
        if (!compiled.filter({ zoom: z }, feature)) continue;
        if (!materialize) {
            checksum = (checksum + 1) | 0;
            continue;
        }
        checksum = (checksum + geometryAt(geometryVector, i, bulk).length + Object.keys(properties).length) | 0;
    }
}

/** Columnar path: filter to a SelectionVector, then materialize only the survivors. */
function mltColumnarPass(
    table: MltTable,
    filter: FilterSpecification | undefined,
    z: number,
    scratch: unknown,
    materialize: boolean,
): void {
    const selection = filterFeatureTable!(table, filter, z, scratch);
    if (!selection) return;
    if (!materialize) {
        checksum = (checksum + selection.limit) | 0;
        return;
    }
    // Read after the filter, not before: a layer whose filter matches nothing must not force the
    // deferred geometry decode — not paying that is exactly what lazy geometry buys.
    const geometryVector = table.geometryVector;
    const bulk = hasRandomGeometryAccess ? null : geometryVector.getGeometries();
    for (let i = 0; i < selection.limit; i++) {
        const index = selection.getIndex(i);
        let propertyCount = 0;
        for (const column of table.propertyVectors) {
            if (column && column.getValue(index) !== null) propertyCount++;
        }
        checksum = (checksum + geometryAt(geometryVector, index, bulk).length + propertyCount) | 0;
    }
}

/** One MVT layer pass: materialize each feature, filter it, and optionally pay for the matches. */
function mvtLayerPass(
    layer: { length: number; feature(i: number): VectorTileFeature } | undefined,
    compiled: ReturnType<typeof featureFilter>,
    z: number,
    materialize: boolean,
): void {
    if (!layer) return;
    for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        if (!compiled.filter({ zoom: z }, toStyleSpecFeature(feature))) continue;
        checksum = materialize
            ? (checksum + feature.loadGeometry().length + Object.keys(feature.properties).length) | 0
            : (checksum + 1) | 0;
    }
}

if (fixturesAvailable) {
    const mvtDb = openMvtDb();
    const mltDb = openMltDb();

    const styleLayers = styleAvailable ? loadStyleLayers() : [];
    // Compiled once, like a real style load — not per tile, and not per bench iteration.
    const compiledLayerFilters = new Map(styleLayers.map((layer) => [layer.id, featureFilter(layer.filter)]));

    // eslint-disable-next-line no-console
    console.error(
        `[stage] filterEngine=${filterFeatureTable ? "yes" : "no"} bucketGate=${isColumnarBucketSupported ? "yes" : "no"} ` +
            `filterScratch=${FilterScratchCtor ? "yes" : "no"} randomGeometry=${hasRandomGeometryAccess ? "yes" : "no"} ` +
            `style=${styleAvailable ? "yes" : "no"} styleLayers=${styleLayers.length} time=${TIME}ms warmup=${WARMUP}ms`,
    );

    /** One full-style pass over an already-decoded tile — the body F3 and F4 share. */
    const mltStylePass = (tablesByName: Map<string, MltTable>, z: number, scratch: unknown): void => {
        for (const layer of activeAtZoom(styleLayers, z)) {
            const table = tablesByName.get(layer.sourceLayer);
            if (!table) continue;
            if (filterFeatureTable && isColumnarBucketSupported?.("mlt", layer.filter, z, layer.id)) {
                mltColumnarPass(table, layer.filter, z, scratch, true);
                continue;
            }
            mltRowFilterPass(table, compiledLayerFilters.get(layer.id)!, z, true);
        }
    };

    const mvtStylePass = (tile: VectorTile, z: number): void => {
        for (const layer of activeAtZoom(styleLayers, z)) {
            mvtLayerPass(tile.layers[layer.sourceLayer], compiledLayerFilters.get(layer.id)!, z, true);
        }
    };

    const tileCoords = process.env.MLT_BENCH_TILESET === "munich" ? MUNICH_TILE_COORDS : TILE_COORDS;

    for (const { z, x, y } of tileCoords) {
        const encodedMvt = readTile(mvtDb, z, x, y);
        const encodedMlt = readTile(mltDb, z, x, y);
        if (!encodedMvt || !encodedMlt) continue;
        const mvtBytes = maybeGunzip(encodedMvt);
        const mltBytes = maybeGunzip(encodedMlt);

        // F0 — context only. Lazy decoding moves work out of here and into first column access, so
        // this column is what keeps a deferred-work "win" in F1-F4 honest.
        describe(`z${z}/${x}/${y} — parse (${mvtBytes.length} MVT bytes, ${mltBytes.length} MLT bytes)`, () => {
            bench(
                "MVT",
                () => {
                    checksum = (checksum + Object.keys(new VectorTile(new Pbf(mvtBytes)).layers).length) | 0;
                },
                OPTS,
            );
            bench(
                "MLT",
                () => {
                    checksum = (checksum + decodeTile(mltBytes, undefined, true).length) | 0;
                },
                OPTS,
            );
        });

        // Decoded ONCE, outside every bench() below: F1, F2 and F4 measure the marginal cost of a
        // query against a tile that has already arrived, not the cost of decoding it.
        const mvtLayer = new VectorTile(new Pbf(mvtBytes)).layers[FILTER_LAYER];
        const mltTable = decodeTile(mltBytes, undefined, true).find((t) => t.name === FILTER_LAYER);

        if (mvtLayer?.length > 0 && mltTable && mltTable.getPropertyVector(FILTER_PROPERTY)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const scratchSingle = FilterScratchCtor ? new (FilterScratchCtor as any)() : undefined;

            // F1 — the filter kernel alone. MLT stops at the SelectionVector; MVT cannot, because a
            // row-oriented reader has to materialize a feature before it can test it.
            describe(`z${z}/${x}/${y} — filter only (${FILTER_LAYER}.${FILTER_PROPERTY} == "motorway"), already-decoded tile`, () => {
                bench("MVT", () => mvtLayerPass(mvtLayer, compiledMvtFilter, z, false), OPTS);
                bench(
                    "MLT",
                    filterFeatureTable
                        ? () => mltColumnarPass(mltTable, FILTER_SPEC, z, scratchSingle, false)
                        : () => mltRowFilterPass(mltTable, compiledMvtFilter, z, false),
                    OPTS,
                );
            });

            // F2 — same filter, now paying for the survivors. F2 minus F1 is materialization cost.
            describe(`z${z}/${x}/${y} — filter + materialize matches (${FILTER_LAYER}.${FILTER_PROPERTY} == "motorway"), already-decoded tile`, () => {
                bench("MVT", () => mvtLayerPass(mvtLayer, compiledMvtFilter, z, true), OPTS);
                bench(
                    "MLT",
                    filterFeatureTable
                        ? () => mltColumnarPass(mltTable, FILTER_SPEC, z, scratchSingle, true)
                        : () => mltRowFilterPass(mltTable, compiledMvtFilter, z, true),
                    OPTS,
                );
            });
        }

        if (styleAvailable) {
            const activeLayers = activeAtZoom(styleLayers, z);

            // F3 — decoded fresh every iteration: the once-per-tile-arrival cost a renderer actually
            // pays. One scratch per tile, reused across all ~122 layers, exactly as a real client would.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const scratchFresh = FilterScratchCtor ? new (FilterScratchCtor as any)() : undefined;

            describe(`z${z}/${x}/${y} — full style (${activeLayers.length} aktive Ebenen), pro Tile-Ankunft`, () => {
                bench("MVT", () => mvtStylePass(new VectorTile(new Pbf(mvtBytes)), z), OPTS);
                bench(
                    "MLT",
                    () => mltStylePass(new Map(decodeTile(mltBytes, undefined, true).map((t) => [t.name, t])), z, scratchFresh),
                    OPTS,
                );
            });

            // F4 — decoded once, queried N times. This is the pattern MLT's design is for, and the
            // one F3 by construction never lets it reach: re-filtering after setFilter(), a
            // data-driven UI control, a day/night switch, or a hover/click feature query.
            const mvtTileRepeated = new VectorTile(new Pbf(mvtBytes));
            const mltTablesRepeated = new Map(decodeTile(mltBytes, undefined, true).map((t) => [t.name, t]));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const scratchRepeated = FilterScratchCtor ? new (FilterScratchCtor as any)() : undefined;

            for (const repeatCount of REPEAT_COUNTS) {
                describe(`z${z}/${x}/${y} — full style x${repeatCount} (${activeLayers.length} aktive Ebenen), already-decoded tile`, () => {
                    bench(
                        "MVT",
                        () => {
                            for (let rep = 0; rep < repeatCount; rep++) mvtStylePass(mvtTileRepeated, z);
                        },
                        OPTS,
                    );
                    bench(
                        "MLT",
                        () => {
                            for (let rep = 0; rep < repeatCount; rep++) mltStylePass(mltTablesRepeated, z, scratchRepeated);
                        },
                        OPTS,
                    );
                });
            }
        }
    }
}
