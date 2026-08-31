import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

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
