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
 * ## The question
 *
 * Before this work, filtering an MLT tile meant: decode it, then hand each feature to
 * maplibre-gl-style-spec's `featureFilter` — the same row-by-row evaluation MVT uses, just fed from
 * MLT vectors. This work made the filter run *directly on the columnar data* instead. This file
 * measures that difference.
 *
 * The primary comparison is therefore MLT-against-MLT, and it happens WITHIN one branch, against the
 * SAME decoded tile, in the same process:
 *
 *   `MLT+styleSpec`        the starting point — decode, materialize every row, run style-spec
 *   `MLT+styleSpec (min)`  same, but materializing only the column the filter actually reads
 *   `MLT-columnar`         the new path — `filterFeatureTable()` straight against the vectors
 *   `MVT`                  context, not the headline: how the row-oriented format does on the same work
 *
 * Holding everything but the filter path constant is what makes this readable. A cross-branch
 * comparison cannot do that — DESIGN-DE.md section 8.4 documents a measurement where the untouched
 * MVT control arm drifted over 100 % between two worktrees, swamping the effect being claimed.
 *
 * Why `MLT+styleSpec (min)` exists: the naive baseline materializes ALL property columns even though
 * the filter reads one. Without the min arm, "we no longer touch irrelevant columns" and "the kernel
 * itself is cheaper" are indistinguishable, and the first is the easier of the two to dismiss. With
 * it, the remaining gap is attributable to the kernel.
 *
 * ## The secondary question
 *
 * The same file also runs on every rung of the work-stream ladder, so the improvement can be
 * attributed per work stream. It is byte-identical on all of them:
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
 * F1 `filter only` — THE measurement. All arms answer "which rows match?" and stop there: the
 *    columnar arm at its `SelectionVector`, the style-spec arms after their last `filter()` call.
 *    Nothing is materialized, so what is compared is the filter evaluation itself.
 * F2 `filter + materialize matches` — the same filter, but paying for the survivors. F2 minus F1 is
 *    materialization cost, which both sides owe equally; comparing F1 and F2 shows how much of the
 *    columnar advantage survives once the matches actually have to be produced.
 * F3 `full style, per tile arrival` — a whole real style (~122 filterable layers, zoom-gated),
 *    decoded fresh every iteration. The columnar arm gates each layer through
 *    `isColumnarBucketSupported` exactly as maplibre-gl-js's `createBucket()` does, so layers the
 *    engine cannot express fall back to style-spec — a realistic mix, not an idealized all-columnar
 *    run. The `MLT+styleSpec` arm takes the row path for every layer, as before this work.
 * F4 `full style xN, already-decoded` — decode once outside the timed function, then N full-style
 *    passes against it. Separates the per-query cost from the one-time decode that F3 folds in.
 *
 * A note on the style-spec arms in F1: `materialize: false` still builds each row's property object,
 * because style-spec reads `feature.properties[key]` and cannot be asked "does row i match?" any
 * other way. Not being able to separate filtering from materializing is the baseline's defining
 * property, not a flaw in how it is benchmarked here.
 *
 * On as1 the columnar arm is simply not registered — there is no engine to run. That rung therefore
 * contributes only the two style-spec arms plus MVT, and the aggregator treats the columnar arm as
 * optional rather than aborting on the key mismatch.
 *
 * The MVT arm is the control for the cross-branch reading. Its code is byte-identical on all five
 * rungs and never touches MLT, so its spread across the rungs IS the noise floor there. It is NOT
 * needed to interpret the within-branch A/B, where all arms share one process and one tile — which is
 * precisely why the A/B is the stronger of the two comparisons.
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
/** The only column FILTER_SPEC reads — see the `MLT+styleSpec (min)` arm. */
const FILTER_COLUMNS: ReadonlySet<string> = new Set([FILTER_PROPERTY]);

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

/**
 * Materializes one MLT row into the plain object shape style-spec's featureFilter expects.
 * `columns`, when given, restricts materialization to those property columns — see the
 * `MLT+styleSpec (min)` arm.
 */
function mltRowToStyleFeature(
    table: MltTable,
    i: number,
    columns?: ReadonlySet<string>,
): { feature: StyleSpecFeature; properties: Record<string, unknown> } {
    const properties: Record<string, unknown> = {};
    for (const column of table.propertyVectors) {
        if (!column) continue;
        if (columns && !columns.has(column.name)) continue;
        const value = column.getValue(i);
        if (value !== null) properties[column.name] = value;
    }
    return {
        feature: { type: toMvtType(table.geometryVector.geometryType(i)), properties, id: undefined } as unknown as StyleSpecFeature,
        properties,
    };
}

/**
 * THE BASELINE ARM: decode the MLT tile, then filter it with maplibre-gl-style-spec — exactly what a
 * consumer had to do before this work, and still what `createBucket()` falls back to for a filter the
 * columnar engine cannot express.
 *
 * Note that `materialize: false` still builds each row's property object. That is not an oversight:
 * style-spec's `featureFilter` reads `feature.properties[key]`, so a row-oriented caller has to
 * materialize before it can test. Not being able to separate "filter" from "materialize" IS the
 * baseline's defining property, and the whole point of what replaced it.
 *
 * `columns` steelmans the baseline: a caller that knows which column the filter reads can materialize
 * only that one. Passing it separates "won because irrelevant columns were skipped" from "won because
 * the kernel itself is cheaper" — two different claims that the naive baseline conflates.
 */
function mltRowFilterPass(
    table: MltTable,
    compiled: ReturnType<typeof featureFilter>,
    z: number,
    materialize: boolean,
    columns?: ReadonlySet<string>,
): void {
    const geometryVector = table.geometryVector;
    const bulk = hasRandomGeometryAccess ? null : geometryVector.getGeometries();
    for (let i = 0; i < table.numFeatures; i++) {
        const { feature, properties } = mltRowToStyleFeature(table, i, columns);
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

    /**
     * One full-style pass over an already-decoded tile — the body F3 and F4 share.
     *
     * `forceRow` selects the baseline arm: every layer goes through decode + style-spec, with no
     * columnar path at all, which is what a consumer had before this work. Without it, each layer is
     * gated through `isColumnarBucketSupported` exactly as maplibre-gl-js's `createBucket()` does, so
     * layers the engine cannot express still fall back to the same row path — that mix is the honest
     * "new" arm, not an idealized all-columnar one.
     */
    const mltStylePass = (tablesByName: Map<string, MltTable>, z: number, scratch: unknown, forceRow = false): void => {
        for (const layer of activeAtZoom(styleLayers, z)) {
            const table = tablesByName.get(layer.sourceLayer);
            if (!table) continue;
            if (!forceRow && filterFeatureTable && isColumnarBucketSupported?.("mlt", layer.filter, z, layer.id)) {
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

            // F1 — the filter kernel alone, and the head-to-head this file exists for. All three MLT
            // arms run against the SAME decoded table, in the same process, on the same branch: the
            // only thing that varies is how the filter is evaluated.
            describe(`z${z}/${x}/${y} — filter only (${FILTER_LAYER}.${FILTER_PROPERTY} == "motorway"), already-decoded tile`, () => {
                bench("MVT", () => mvtLayerPass(mvtLayer, compiledMvtFilter, z, false), OPTS);
                bench("MLT+styleSpec", () => mltRowFilterPass(mltTable, compiledMvtFilter, z, false), OPTS);
                bench("MLT+styleSpec (min)", () => mltRowFilterPass(mltTable, compiledMvtFilter, z, false, FILTER_COLUMNS), OPTS);
                if (filterFeatureTable) {
                    bench("MLT-columnar", () => mltColumnarPass(mltTable, FILTER_SPEC, z, scratchSingle, false), OPTS);
                }
            });

            // F2 — same filter, now paying for the survivors. F2 minus F1 is materialization cost.
            describe(`z${z}/${x}/${y} — filter + materialize matches (${FILTER_LAYER}.${FILTER_PROPERTY} == "motorway"), already-decoded tile`, () => {
                bench("MVT", () => mvtLayerPass(mvtLayer, compiledMvtFilter, z, true), OPTS);
                bench("MLT+styleSpec", () => mltRowFilterPass(mltTable, compiledMvtFilter, z, true), OPTS);
                bench("MLT+styleSpec (min)", () => mltRowFilterPass(mltTable, compiledMvtFilter, z, true, FILTER_COLUMNS), OPTS);
                if (filterFeatureTable) {
                    bench("MLT-columnar", () => mltColumnarPass(mltTable, FILTER_SPEC, z, scratchSingle, true), OPTS);
                }
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
                    "MLT+styleSpec",
                    () => mltStylePass(new Map(decodeTile(mltBytes, undefined, true).map((t) => [t.name, t])), z, undefined, true),
                    OPTS,
                );
                if (filterFeatureTable) {
                    bench(
                        "MLT-columnar",
                        () => mltStylePass(new Map(decodeTile(mltBytes, undefined, true).map((t) => [t.name, t])), z, scratchFresh),
                        OPTS,
                    );
                }
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
                        "MLT+styleSpec",
                        () => {
                            for (let rep = 0; rep < repeatCount; rep++) mltStylePass(mltTablesRepeated, z, undefined, true);
                        },
                        OPTS,
                    );
                    if (filterFeatureTable) {
                        bench(
                            "MLT-columnar",
                            () => {
                                for (let rep = 0; rep < repeatCount; rep++) mltStylePass(mltTablesRepeated, z, scratchRepeated);
                            },
                            OPTS,
                        );
                    }
                });
            }
        }
    }
}
