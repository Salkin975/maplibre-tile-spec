import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { featureTablesToFeatureCollection } from "./vector/featureTablesToGeoJson";
import {
    compareWithTolerance,
    expectUnsupported,
    getTestCases,
    writeActualOutput,
} from "../../test/synthetic/synthetic-test-utils";
import decodeTile from "./mltDecoder";

/**
 * Synthetics the decoder cannot handle yet. These still run: `expectUnsupported` asserts they fail,
 * so an entry that starts decoding correctly fails the test until it is removed from this list.
 * Prefer fixing the decoder over adding to it.
 */
const UNIMPLEMENTED_SYNTHETICS: string[] = ["0x02"];

/**
 * Nested (MAP) property fixtures under 0x02 the decoder does support (see decodeMapPropertyColumn).
 * The rest of 0x02 is still unimplemented, so these are tested directly here instead of carving an
 * exception into the "0x02" exclusion list above.
 */
const NESTED_PROPERTY_SYNTHETICS = [
    "prop_nested_big",
    "prop_nested_ints",
    "prop_nested_json",
    "prop_nested_list",
    "prop_nested_list_root",
    "prop_nested_mixed_root",
    "prop_nested_null",
    "prop_nested_shared",
    "prop_nested_specials",
];

describe("MLT Decoder - Synthetic tests", () => {
    expect.addEqualityTesters([compareWithTolerance]);
    const testCases = getTestCases(UNIMPLEMENTED_SYNTHETICS);

    for (const { name, content, fileName } of testCases.active) {
        it(name, async () => {
            const actual = await decodeMLT(fileName);
            writeActualOutput(fileName, actual);
            expect(actual).toEqual(content);
        });
    }

    for (const { name, content, fileName } of testCases.skipped) {
        it(`${name} (unsupported)`, () => expectUnsupported(() => decodeMLT(fileName), content));
    }
});

describe("MLT Decoder - nested property synthetics (0x02)", () => {
    expect.addEqualityTesters([compareWithTolerance]);
    const dir = path.resolve(__dirname, "../../test/synthetic/0x02");

    for (const name of NESTED_PROPERTY_SYNTHETICS) {
        it(name, async () => {
            const content = JSON.parse(await readFile(path.join(dir, `${name}.json`), "utf-8"));
            const actual = await decodeMLT(path.join(dir, `${name}.mlt`));
            expect(actual).toEqual(content);
        });
    }
});

async function decodeMLT(mltFilePath: string) {
    const mltBuffer = await readFile(mltFilePath);
    const featureTables = decodeTile(mltBuffer, undefined, false);
    return featureTablesToFeatureCollection(featureTables) as unknown as Record<string, unknown>;
}
