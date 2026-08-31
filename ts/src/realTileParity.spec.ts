import assert from "node:assert/strict";
import { afterAll, describe, it } from "vitest";
import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import Pbf from "pbf";

import { type FeatureTable, type Feature, decodeTile } from ".";
import { fixturesAvailable, TILE_COORDS, openMvtDb, openMltDb, readTile, maybeGunzip } from "./realTileFixtures";

/**
 * Compares real, locally-held MVT/MLT mbtiles tile by tile (correctness). See
 * realTileFixtures.ts for how to point this at a different fixture set, and how to add tiles to
 * TILE_COORDS. See realTileParity.bench.ts for the performance counterpart.
 */

// `describe.skipIf` still runs the describe callback's body (it only skips the `it`s inside), so
// opening the databases has to be gated by a plain `if` — otherwise a missing fixture path throws
// before the skip takes effect.
if (fixturesAvailable) {
    describe("Real tile parity (MVT vs MLT, from local mbtiles)", () => {
        const mvtDb = openMvtDb();
        const mltDb = openMltDb();

        afterAll(() => {
            mvtDb.close();
            mltDb.close();
        });

        for (const { z, x, y } of TILE_COORDS) {
            it(`should match MLT and MVT decoding for z${z}/${x}/${y}`, () => {
                const encodedMvt = readTile(mvtDb, z, x, y);
                const encodedMlt = readTile(mltDb, z, x, y);
                assert.ok(encodedMvt, `no MVT tile stored for z${z}/${x}/${y}`);
                assert.ok(encodedMlt, `no MLT tile stored for z${z}/${x}/${y}`);

                const decodedMvt = new VectorTile(new Pbf(maybeGunzip(encodedMvt)));
                const decodedMlt = decodeTile(maybeGunzip(encodedMlt), undefined, true);

                comparePlainGeometryEncodedTile(decodedMlt, decodedMvt);
            });
        }
    });
} else {
    describe.skip("Real tile parity (MVT vs MLT, from local mbtiles)", () => {
        it("requires local mbtiles fixtures (set MLT_TILES_DIR, or MLT_MVT_MBTILES/MLT_MLT_MBTILES)", () => {});
    });
}

/** Adapted from mltDecoder.spec.ts's comparePlainGeometryEncodedTile — kept local since importing
 * another *.spec.ts file would re-run its top-level describe() blocks too. */
function comparePlainGeometryEncodedTile(mlt: FeatureTable[], mvt: VectorTile) {
    for (const featureTable of mlt) {
        const layer = mvt.layers[featureTable.name];
        assert.ok(layer, `MVT has no layer "${featureTable.name}"`);

        const mltFeatures = featureTable.getFeatures();
        assert.equal(mltFeatures.length, layer.length);

        for (let j = 0; j < layer.length; j++) {
            const mvtFeature = layer.feature(j);
            const mltFeature = mltFeatures[j];

            compareId(mltFeature, mvtFeature);

            const mltGeometry = mltFeature.geometry?.coordinates;
            const mvtGeometry = mvtFeature.loadGeometry();
            assert.deepEqual(mltGeometry, mvtGeometry);

            const mltProperties = mltFeature.properties;
            const mvtProperties = mvtFeature.properties;
            transformPropertyNames(mltProperties);
            transformPropertyNames(mvtProperties);
            convertBigIntPropertyValues(mltProperties);
            removeEmptyStrings(mvtProperties);
            removeEmptyStrings(mltProperties);
            assert.deepEqual(mltProperties, mvtProperties);
        }
    }
}

function compareId(mltFeature: Feature, mvtFeature: VectorTileFeature) {
    if (!mvtFeature.id) {
        assert.ok(mltFeature.id === 0 || mltFeature.id === null || mltFeature.id === 0n);
        return;
    }

    const mltFeatureId = mltFeature.id;
    const actualId = typeof mltFeatureId !== "bigint" ? mltFeatureId : Number(mltFeatureId);

    if (mltFeatureId < 0 || mltFeatureId > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(mvtFeature.id)) {
        // Known divergence points (see mltDecoder.spec.ts's compareId): out-of-range ids can't be
        // compared exactly across the two number representations.
        return;
    }

    assert.equal(actualId, mvtFeature.id);
}

function convertBigIntPropertyValues(properties: Record<string, unknown>) {
    for (const key of Object.keys(properties)) {
        if (typeof properties[key] === "bigint") {
            properties[key] = Number(properties[key]);
        }
    }
}

function removeEmptyStrings(properties: Record<string, unknown>) {
    for (const key of Object.keys(properties)) {
        if (properties[key] === "") {
            delete properties[key];
        }
    }
}

function transformPropertyNames(properties: Record<string, unknown>) {
    for (const key of Object.keys(properties)) {
        let newKey = key;
        if (key.startsWith("name") && key.includes(":")) {
            newKey = key.replaceAll(":", "_");
            properties[newKey] = properties[key];
            delete properties[key];
        }
        if (newKey === "_id") {
            properties.id = properties[newKey];
            delete properties[newKey];
        }
    }
}
