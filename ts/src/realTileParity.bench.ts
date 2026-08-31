import { bench, describe } from "vitest";
import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import type { FilterSpecification } from "@maplibre/maplibre-gl-style-spec";

import { decodeTile, filterFeatureTable } from ".";
import { fixturesAvailable, TILE_COORDS, openMvtDb, openMltDb, readTile, maybeGunzip } from "./realTileFixtures";

/**
 * Benchmarks MLT decoding against MVT decoding on the same real tiles realTileParity.spec.ts
 * checks for correctness. Run with `npm run bench -- realTileParity` (or
 * `npx vitest bench --run src/realTileParity.bench.ts`); silently registers zero benchmarks when
 * the local mbtiles fixtures aren't present (see realTileFixtures.ts).
 *
 * Four groups per tile — the first two force both formats through the SAME "decode everything"
 * shape, which is fair but plays only to MVT's strength (see the note on group 2). The last two
 * instead each use every format's own idiomatic, "as little work as possible" API, because that's
 * the comparison that's actually representative of how each format gets used:
 *
 * 1. "parse": just building the top-level structure (`new VectorTile(...)` / `decodeTile(...)`).
 *    Lopsided by construction — `@mapbox/vector-tile` parses each feature lazily on first access,
 *    while MLT's decodeTile() eagerly decodes every column into a Vector — so this alone
 *    understates MVT's real cost and overstates MLT's. Kept anyway since "cheapest possible parse"
 *    is a real code path (e.g. reading one property without touching the rest of the tile).
 * 2. "parse + read all features": also visits every feature's id/geometry/properties on both
 *    sides. This is "fair" in the sense both sides do equivalent total work, but it's still not
 *    representative: MVT's per-layer `keys`/`values` dictionary decode (VectorTileLayer's
 *    constructor) is proportional to the number of *distinct* values in the layer, while MLT's
 *    decodeTile() must decode index/offset/nullability streams for every row of every property
 *    column whether or not this benchmark ever reads that column — an inherent cost of a
 *    column-oriented format, not a benchmark artifact, but one that this "materialize everything"
 *    shape plays directly into MVT's hands for.
 * 3. "read one property, already-decoded tile" (transportation.class): decoding happens once,
 *    outside the timed function, for BOTH formats — otherwise this would silently re-include MLT's
 *    ~12ms decodeTile() cost inside every timed iteration while MVT's cheap layer-open stayed
 *    outside it, which is exactly the kind of unfair comparison this file is trying to avoid. What's
 *    actually timed is the marginal cost of the read, given the tile has already arrived: MVT has no
 *    way to read one property without re-parsing each feature's *entire* tag list from its stored
 *    byte offset (`layer.feature(i)` does no caching, even across repeated calls on the same already
 *    -open layer) — there's no per-column shortcut in a row-oriented format. MLT goes straight to
 *    the one property vector, and after the first access each dictionary code is served from the
 *    per-code cache added in stringDictionaryVector.ts/stringFsstDictionaryVector.ts, so repeat
 *    iterations mostly hit warm cache. This models a realistic case for both formats — a client
 *    that decodes a tile once and then runs multiple style layers' worth of queries against it.
 * 4. "filter + materialize only matches, already-decoded tile" (`["==", ["get", "class"],
 *    "motorway"]` on transportation): same "decode once outside the timed function" rule as above.
 *    MVT filters by fully materializing every feature (id/type/properties) and running style-spec's
 *    row-based `featureFilter` against each one — decode-then-filter is the only order it can do
 *    this in. MLT filters columnar first via `filterFeatureTable` (producing a `SelectionVector`
 *    without touching properties for rejected rows) and only materializes the survivors via
 *    `geometryVector.getGeometry(index)`/per-column `getValue(index)`, scoped to just the matching
 *    indices. This is the scenario the columnar design is actually for.
 */
let checksum = 0;

const FILTER_LAYER = "transportation";
const FILTER_PROPERTY = "class";
const FILTER_SPEC = ["==", ["get", FILTER_PROPERTY], "motorway"] as unknown as FilterSpecification;
const compiledMvtFilter = featureFilter(FILTER_SPEC);

/** Mirrors MVT's numeric feature.type (0=Unknown,1=Point,2=LineString,3=Polygon) for style-spec's Feature shape. */
function toStyleSpecFeature(f: VectorTileFeature) {
    return { type: f.type, properties: f.properties, id: f.id } as Parameters<typeof compiledMvtFilter.filter>[1];
}

if (fixturesAvailable) {
    const mvtDb = openMvtDb();
    const mltDb = openMltDb();

    for (const { z, x, y } of TILE_COORDS) {
        const encodedMvt = readTile(mvtDb, z, x, y);
        const encodedMlt = readTile(mltDb, z, x, y);
        if (!encodedMvt || !encodedMlt) continue;
        const mvtBytes = maybeGunzip(encodedMvt);
        const mltBytes = maybeGunzip(encodedMlt);

        describe(`z${z}/${x}/${y} — parse (${mvtBytes.length} MVT bytes, ${mltBytes.length} MLT bytes)`, () => {
            bench(
                "MVT",
                () => {
                    const tile = new VectorTile(new Pbf(mvtBytes));
                    checksum = (checksum + Object.keys(tile.layers).length) | 0;
                },
                { warmupTime: 500, time: 3_000 },
            );
            bench(
                "MLT",
                () => {
                    checksum = (checksum + decodeTile(mltBytes, undefined, true).length) | 0;
                },
                { warmupTime: 500, time: 3_000 },
            );
        });

        describe(`z${z}/${x}/${y} — parse + read all features`, () => {
            bench(
                "MVT",
                () => {
                    const tile = new VectorTile(new Pbf(mvtBytes));
                    for (const layerName of Object.keys(tile.layers)) {
                        const layer = tile.layers[layerName];
                        for (let i = 0; i < layer.length; i++) {
                            const feature = layer.feature(i);
                            checksum = (checksum + feature.loadGeometry().length + Object.keys(feature.properties).length) | 0;
                        }
                    }
                },
                { warmupTime: 500, time: 3_000 },
            );
            bench(
                "MLT",
                () => {
                    for (const table of decodeTile(mltBytes, undefined, true)) {
                        for (const feature of table.getFeatures()) {
                            checksum =
                                (checksum +
                                    (feature.geometry?.coordinates.length ?? 0) +
                                    Object.keys(feature.properties).length) |
                                0;
                        }
                    }
                },
                { warmupTime: 500, time: 3_000 },
            );
        });

        // Decoded ONCE here, outside every bench() below — these two groups measure the marginal
        // cost of a read/filter against an already-decoded tile, not the cost of decoding it.
        const mvtLayer = new VectorTile(new Pbf(mvtBytes)).layers[FILTER_LAYER];
        const mltTable = decodeTile(mltBytes, undefined, true).find((t) => t.name === FILTER_LAYER);
        const mltColumn = mltTable?.getPropertyVector(FILTER_PROPERTY);

        if (mvtLayer?.length > 0 && mltTable && mltColumn) {
            describe(`z${z}/${x}/${y} — read one property (${FILTER_LAYER}.${FILTER_PROPERTY}), already-decoded tile`, () => {
                bench(
                    "MVT",
                    () => {
                        for (let i = 0; i < mvtLayer.length; i++) {
                            const value = mvtLayer.feature(i).properties[FILTER_PROPERTY];
                            checksum = (checksum + (typeof value === "string" ? value.length : 0)) | 0;
                        }
                    },
                    { warmupTime: 500, time: 3_000 },
                );
                bench(
                    "MLT",
                    () => {
                        for (let i = 0; i < mltTable.numFeatures; i++) {
                            const value = mltColumn.getValue(i);
                            checksum = (checksum + (typeof value === "string" ? value.length : 0)) | 0;
                        }
                    },
                    { warmupTime: 500, time: 3_000 },
                );
            });

            describe(`z${z}/${x}/${y} — filter (${FILTER_LAYER}.${FILTER_PROPERTY} == "motorway") + materialize only matches, already-decoded tile`, () => {
                bench(
                    "MVT",
                    () => {
                        for (let i = 0; i < mvtLayer.length; i++) {
                            const feature = mvtLayer.feature(i);
                            if (compiledMvtFilter.filter({ zoom: z }, toStyleSpecFeature(feature))) {
                                checksum = (checksum + feature.loadGeometry().length + Object.keys(feature.properties).length) | 0;
                            }
                        }
                    },
                    { warmupTime: 500, time: 3_000 },
                );
                bench(
                    "MLT",
                    () => {
                        const selection = filterFeatureTable(mltTable, FILTER_SPEC, z);
                        if (!selection) return;
                        const geometryVector = mltTable.geometryVector;
                        for (let i = 0; i < selection.limit; i++) {
                            const index = selection.getIndex(i);
                            const geometry = geometryVector.getGeometry(index);
                            let propertyCount = 0;
                            for (const column of mltTable.propertyVectors) {
                                if (column && column.getValue(index) !== null) propertyCount++;
                            }
                            checksum = (checksum + geometry.length + propertyCount) | 0;
                        }
                    },
                    { warmupTime: 500, time: 3_000 },
                );
            });
        }
    }
}
