import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import type { FilterSpecification } from "@maplibre/maplibre-gl-style-spec";

/**
 * Shared access to real, locally-held MVT/MLT mbtiles (not the small committed fixtures in test/).
 * Used by both realTileParity.spec.ts (correctness) and realTileParity.bench.ts (performance).
 * Kept out of those two files (rather than one importing the other) because importing a *.spec.ts
 * or *.bench.ts file re-runs its top-level describe()/bench() registrations too.
 *
 * Point this at any {mvt,mlt}.mbtiles pair covering the same tileset via MLT_TILES_DIR (or the two
 * MLT_*_MBTILES vars below) — fixturesAvailable is false, not thrown, when the files aren't
 * present, since this fixture set lives outside the repo and isn't expected on CI or other
 * machines.
 */
const TILES_DIR = process.env.MLT_TILES_DIR ?? "C:\\Users\\GREIND_N\\Documents\\Bachelor\\Tiles";
export const MVT_MBTILES = process.env.MLT_MVT_MBTILES ?? `${TILES_DIR}\\mvt\\bayern.mbtiles`;
export const MLT_MBTILES = process.env.MLT_MLT_MBTILES ?? `${TILES_DIR}\\mlt\\bay\\bayern.mlt.mbtiles`;

export const fixturesAvailable = existsSync(MVT_MBTILES) && existsSync(MLT_MBTILES);

/** XYZ tile coordinates (row 0 = top) known to exist in both mbtiles above. Append more as needed. */
export const TILE_COORDS: Array<{ z: number; x: number; y: number }> = [
    { z: 0, x: 0, y: 0 },
    { z: 5, x: 17, y: 11 },
    { z: 9, x: 274, y: 174 },
    { z: 11, x: 1091, y: 705 },
    { z: 13, x: 4405, y: 2814 },
    { z: 14, x: 8720, y: 5686 },
    { z: 14, x: 8705, y: 5684 },
];

/**
 * A single quadtree descent into one point — Munich/Marienplatz (48.1374°N, 11.5755°E) — from z4 to
 * z14, computed via the standard Web Mercator slippy-map formula (not independently-chosen tiles the
 * way TILE_COORDS above is). Each entry is the strict parent of the next zoom level's entry. Stops at
 * z14 because that's the deepest zoom present in the local bayern.mbtiles pair (verified: both mvt and
 * mlt cap at zoom_level 14) — a z15-18 continuation would silently register zero benchmarks per tile,
 * per the "missing fixtures degrade silently" contract these mbtiles already follow.
 * All 11 entries were confirmed present in both mbtiles before being hardcoded here.
 */
export const MUNICH_TILE_COORDS: Array<{ z: number; x: number; y: number }> = [
    { z: 4, x: 8, y: 5 },
    { z: 5, x: 17, y: 11 },
    { z: 6, x: 34, y: 22 },
    { z: 7, x: 68, y: 44 },
    { z: 8, x: 136, y: 88 },
    { z: 9, x: 272, y: 177 },
    { z: 10, x: 544, y: 355 },
    { z: 11, x: 1089, y: 710 },
    { z: 12, x: 2179, y: 1421 },
    { z: 13, x: 4359, y: 2842 },
    { z: 14, x: 8718, y: 5685 },
];

export function openMvtDb(): InstanceType<typeof DatabaseSync> {
    return new DatabaseSync(MVT_MBTILES, { readOnly: true });
}

export function openMltDb(): InstanceType<typeof DatabaseSync> {
    return new DatabaseSync(MLT_MBTILES, { readOnly: true });
}

/** mbtiles stores rows TMS-style (row 0 = bottom); tile clients request XYZ (row 0 = top). */
export function readTile(db: InstanceType<typeof DatabaseSync>, z: number, x: number, y: number): Buffer | undefined {
    const tmsRow = 2 ** z - 1 - y;
    const row = db
        .prepare("SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?")
        .get(z, x, tmsRow) as { tile_data: Uint8Array } | undefined;
    return row && Buffer.from(row.tile_data);
}

export function maybeGunzip(data: Buffer): Buffer {
    return data[0] === 0x1f && data[1] === 0x8b ? gunzipSync(data) : data;
}

/** One filterable layer of a loaded style, trimmed to what the "full style" benchmark scenario needs. */
export interface StyleLayer {
    id: string;
    sourceLayer: string;
    filter: FilterSpecification;
    minzoom?: number;
    maxzoom?: number;
}

export const STYLE_PATH = process.env.MLT_STYLE_PATH ?? `${TILES_DIR}\\style.json`;
export const styleAvailable = existsSync(STYLE_PATH);

/**
 * Loads a real style's filterable layers (drops `background`/raster layers, which have no
 * `source-layer` and nothing to filter), for the "full style" benchmark scenario — this mirrors
 * how `worker_tile.ts` in maplibre-gl-js iterates `style.layers` once per tile arrival, calling
 * each layer's `createBucket()` (which gates through `isColumnarBucketSupported`) rather than
 * evaluating one hand-picked filter in isolation.
 */
export function loadStyleLayers(): StyleLayer[] {
    const style = JSON.parse(readFileSync(STYLE_PATH, "utf8")) as {
        layers: Array<{
            id: string;
            type: string;
            "source-layer"?: string;
            filter?: FilterSpecification;
            minzoom?: number;
            maxzoom?: number;
        }>;
    };
    return style.layers
        .filter((l) => l.filter && l["source-layer"])
        .map((l) => ({
            id: l.id,
            sourceLayer: l["source-layer"]!,
            filter: l.filter!,
            minzoom: l.minzoom,
            maxzoom: l.maxzoom,
        }));
}

/** Layers whose zoom range covers `z` — the same check maplibre-gl-js's style layer does before `createBucket()`. */
export function activeAtZoom(layers: StyleLayer[], z: number): StyleLayer[] {
    return layers.filter((l) => (l.minzoom === undefined || z >= l.minzoom) && (l.maxzoom === undefined || z < l.maxzoom));
}
