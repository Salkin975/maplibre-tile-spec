import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { parse, join } from "node:path";
import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

import { type FeatureTable, type Feature, decodeTile } from ".";
import path from "node:path";
import fs from "node:fs";

const ITERATOR_TILE = path.resolve(__dirname, "../../test/expected/tag0x01/simple/multiline-boolean.mlt");

describe("MLT Decoder - MVT comparison for SIMPLE tiles", () => {
    const simpleMltTileDir = "../test/expected/tag0x01/simple";
    const simpleMvtTileDir = "../test/fixtures/simple";
    testTiles(simpleMltTileDir, simpleMvtTileDir);
});

describe("MLT Decoder - MVT comparison for Amazon tiles", () => {
    const amazonMltTileDir = "../test/expected/tag0x01/amazon";
    const amazonMvtTileDir = "../test/fixtures/amazon";
    testTiles(amazonMltTileDir, amazonMvtTileDir);
});

describe("MLT Decoder - MVT comparison for OMT tiles", () => {
    const omtMltTileDir = "../test/expected/tag0x01/omt";
    const omtMvtTileDir = "../test/fixtures/omt";
    testTiles(omtMltTileDir, omtMvtTileDir);
}, 150000);

describe("MLT Decoder - MVT comparison for Bing tiles", () => {
    const bingMltTileDir = "../test/expected/tag0x01/bing";
    const bingMvtTileDir = "../test/fixtures/bing";
    testTiles(bingMltTileDir, bingMvtTileDir);
}, 150000);

describe("FeatureTable", () => {
    it("should iterate through features correctly", () => {
        const bytes = new Uint8Array(fs.readFileSync(ITERATOR_TILE));
        const featureTables = decodeTile(bytes);

        const table = featureTables[0];

        assert.equal(table.name, "layer");
        assert.equal(table.extent, 4096);

        let featureCount = 0;
        for (const feature of table.getFeatures()) {
            assert.ok(feature.geometry);
            assert.ok(Array.isArray(feature.geometry.coordinates));
            assert.ok(feature.geometry.coordinates.length > 0);
            assert.equal(typeof feature.geometry.type, "number");

            featureCount++;
        }
        assert.equal(featureCount, table.numFeatures);
    });
});

/**
 * `propertyColumns` projects away whole columns. A struct column with a shared dictionary
 * exposes its children as `${column.name}${child.name}` (`name` + `:de` -> `name:de`), so the
 * projection has to match against those child names — matching only the parent name used to
 * drop the entire column when a caller asked for a single child, yielding nothing at all.
 *
 * The shared dictionary streams are decoded either way; what the projection saves is the
 * per-child offset streams and the vectors built from them.
 */
describe("MLT Decoder - propertyColumns projection", () => {
    const OMT_STRUCT_TILE = path.resolve(__dirname, "../../test/expected/tag0x01/omt/4_8_10.mlt");
    const LAYER = "water_name";

    function waterNameTable(options?: Parameters<typeof decodeTile>[3]) {
        const bytes = new Uint8Array(fs.readFileSync(OMT_STRUCT_TILE));
        const table = decodeTile(bytes, undefined, true, options).find((t) => t.name === LAYER);
        assert.ok(table, `expected a "${LAYER}" layer in the fixture`);
        return table;
    }

    it("keeps a struct column when only one of its children is requested", () => {
        const table = waterNameTable({ propertyColumns: new Set(["name:de"]) });
        assert.deepEqual(
            table.propertyVectors.map((vector) => vector.name),
            ["name:de"],
        );
        assert.equal(table.getPropertyVector("name:de")?.getValue(0), "Tyrrhenisches Meer");
    });

    it("drops the siblings that were not requested", () => {
        const table = waterNameTable({ propertyColumns: new Set(["name:de"]) });

        assert.equal(table.getPropertyVector("name:en"), undefined);
        assert.equal(table.getPropertyVector("name:fr"), undefined);
        assert.equal(table.getPropertyVector("class"), undefined);
    });

    it("keeps every child when no projection is given", () => {
        const names = waterNameTable().propertyVectors.map((vector) => vector.name);

        assert.ok(names.includes("name:de"));
        assert.ok(names.includes("name:en"));
        assert.ok(names.includes("class"));
        assert.ok(names.length > 10, `expected the full column set, got ${names.length}`);
    });

    it("combines a struct child with a plain scalar column", () => {
        const table = waterNameTable({ propertyColumns: new Set(["name:de", "class"]) });

        const names = table.propertyVectors.map((vector) => vector.name).sort();
        assert.deepEqual(names, ["class", "name:de"]);
    });
});

describe("MLT Decoder - malformed input", () => {
    const OMT_TILE = path.resolve(__dirname, "../../test/expected/tag0x01/omt/4_8_10.mlt");

    // truncation is caught by decodeTile's own block-length check before any stream is
    // read, so this covers that guard.
    it("rejects a truncated tile rather than decoding garbage", () => {
        const full = new Uint8Array(fs.readFileSync(OMT_TILE));

        for (const fraction of [0.1, 0.4, 0.7, 0.95]) {
            const truncated = full.subarray(0, Math.floor(full.length * fraction));
            assert.throws(
                () => decodeTile(truncated, undefined, true),
                /Block overruns tile/,
                `expected a throw for a tile truncated to ${fraction * 100}%`,
            );
        }
    }, 15000);
});

function testTiles(mltSearchDir: string, mvtSearchDir: string) {
    const mltFileNames = readdirSync(mltSearchDir)
        .filter((file) => parse(file).ext === ".mlt")
        .map((file) => parse(file).name);
    for (const fileName of mltFileNames) {
        it(`should compare ${fileName} tile`, () => {
            const mltFileName = `${fileName}.mlt`;
            const mltPath = join(mltSearchDir, mltFileName);
            const mvtPath = join(mvtSearchDir, `${fileName}.mvt`);

            const encodedMvt = readFileSync(mvtPath);
            const encodedMlt = readFileSync(mltPath);
            const buf = new PbfReader(encodedMvt);
            const decodedMvt = new VectorTile(buf);

            const decodedMlt = decodeTile(encodedMlt, undefined, true);
            comparePlainGeometryEncodedTile(decodedMlt, decodedMvt);
        });
    }
}

function removeEmptyStrings(mvtProperties: Record<string, any>) {
    for (const key of Object.keys(mvtProperties)) {
        const value = mvtProperties[key];
        if (typeof value === "string" && !value.length) {
            delete mvtProperties[key];
        }
    }
}

function comparePlainGeometryEncodedTile(mlt: FeatureTable[], mvt: VectorTile) {
    for (const featureTable of mlt) {
        const layer = mvt.layers[featureTable.name];

        // Use getFeatures() instead of iterator (like C++ and Java implementations)
        const mltFeatures = featureTable.getFeatures();

        assert.equal(mltFeatures.length, layer.length);

        for (let j = 0; j < layer.length; j++) {
            const mvtFeature = layer.feature(j);
            const mltFeature = mltFeatures[j];

            compareId(mltFeature, mvtFeature, true);

            const mltGeometry = mltFeature.geometry?.coordinates;
            const mvtGeometry = mvtFeature.loadGeometry();
            assert.deepEqual(mltGeometry, mvtGeometry);

            const mltProperties = mltFeature.properties;
            // vector-tile v3 returns a null-prototype object; copy to a plain object so
            // assert.deepEqual's prototype check passes.
            const mvtProperties = { ...mvtFeature.properties };
            transformPropertyNames(mltProperties);
            transformPropertyNames(mvtProperties);
            convertBigIntPropertyValues(mltProperties);
            //TODO: fix -> since a change in the java converter shared dictionary encoding empty strings are not
            //encoded anymore
            removeEmptyStrings(mvtProperties);
            removeEmptyStrings(mltProperties);
            assert.deepEqual(mltProperties, mvtProperties);
        }
    }
}

function compareId(mltFeature: Feature, mvtFeature: VectorTileFeature, idWithinMaxSafeInteger: boolean) {
    if (!mvtFeature.id) {
        /* Java MVT library in the MVT converter decodes zero for undefined ids */
        assert.ok(mltFeature.id === 0 || mltFeature.id === null || mltFeature.id === 0n);
    } else {
        const mltFeatureId = mltFeature.id;
        /* For const and sequence vectors the decoder can return bigint compared to the vector-tile-js library */
        const actualId =
            idWithinMaxSafeInteger && typeof mltFeatureId !== "bigint" ? mltFeatureId : Number(mltFeatureId);
        /*
         * The id check can fail for two known reasons:
         * - The java-vector-tile library used in the Java converter returns negative integers for the
         *   unoptimized tileset in some tiles
         * - The vector-tile-js library is using number types for the id so there can only be stored
         *   values up to 53 bits without loss of precision
         **/
        if (mltFeatureId < 0 || mltFeatureId > Number.MAX_SAFE_INTEGER) {
            /* Expected to fail in some/most cases */
            try {
                assert.equal(actualId, mvtFeature.id);
            } catch (_e) {
                //console.info("id mismatch", featureTableName, mltFeatureId, mvtFeature.id);
            }
            return;
        }

        if (!Number.isSafeInteger(mvtFeature.id)) {
            return;
        }

        assert.equal(actualId, mvtFeature.id);
    }
}

/* Change bigint to number for comparison with MVT */
function convertBigIntPropertyValues(mltProperties: Record<string, any>) {
    for (const key of Object.keys(mltProperties)) {
        if (typeof mltProperties[key] === "bigint") {
            mltProperties[key] = Number(mltProperties[key]);
        }
    }
}

function transformPropertyNames(properties: Record<string, any>) {
    const propertyNames = Object.keys(properties);
    for (let k = 0; k < propertyNames.length; k++) {
        const key = propertyNames[k];

        let newKey = key;
        /* rename the property names which are separated with : in mlt to match _ in omt mvts */
        if (key.startsWith("name") && key.includes(":")) {
            newKey = (key as any).replaceAll(":", "_");
            properties[newKey] = properties[key];
            delete properties[key];
        }

        /* Currently id is not supported as a property name in a FeatureTable,
         *  so this quick workaround is implemented */
        if (newKey === "_id") {
            properties.id = properties[newKey];
            delete properties[newKey];
        }
    }
}
