import { describe, expect, test, vi } from "vitest";
import { filterFeatureTable } from "./execution/tableFilter";
import { isColumnarBucketSupported, isColumnarFilterSupportedAtZoom } from "./planning/bucketSupport";
import { createValueMatcher } from "./filterUtils";
import { encodePlainStrings, encodeDictionaryStrings } from "../../encoding/stringEncoder";
import { decodeString } from "../../decoding/stringDecoder";
import IntWrapper from "../../decoding/intWrapper";
import BitVector from "../../vector/flat/bitVector";
import { BooleanFlatVector } from "../../vector/flat/booleanFlatVector";
import FeatureTable from "../../vector/featureTable";
import { GEOMETRY_TYPE } from "../../vector/geometry/geometryType";
import { Int32FlatVector } from "../../vector/flat/int32FlatVector";
import { Int64FlatVector } from "../../vector/flat/int64FlatVector";
import { createConstGeometryVector } from "../../vector/geometry/constGeometryVector";
import { StringFlatVector } from "../../vector/flat/stringFlatVector";
import type { StringDictionaryVector } from "../../vector/dictionary/stringDictionaryVector";
import type { FilterSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { SelectionVector } from "../../vector/filter/selectionVector";
import type Vector from "../../vector/vector";

/**
 * Round-trip test-vector builders: real `encode*` → real `decodeString`, matching the pattern in
 * `ts/src/decoding/stringDecoder.spec.ts`, instead of the create*Vector shortcuts (which skip the
 * binary format entirely). `numStreams` mirrors what each encoder actually emits: a corpus
 * containing a null gains a PRESENT stream, one without it does not.
 */
function flatStringVector(name: string, values: string[]): StringFlatVector {
    return decodeString(name, encodePlainStrings(values), new IntWrapper(0), 2) as StringFlatVector;
}

function dictionaryStringVector(name: string, values: (string | null)[]): StringDictionaryVector {
    const numStreams = values.includes(null) ? 4 : 3;
    return decodeString(name, encodeDictionaryStrings(values), new IntWrapper(0), numStreams) as StringDictionaryVector;
}

/**
 * A plain string stream carrying nulls decodes to a *sparse* `StringDictionaryVector`, not a
 * `StringFlatVector` (see `decodePlainStringVector` in `stringDecoder.ts`), because the length
 * stream holds no entry for a null row. A nullable `StringFlatVector` is still a valid shape — it
 * needs a length entry per row, including zero-length ones for nulls — so it is built directly
 * here, the one thing the round-trip builders above cannot express.
 */
function nullableFlatStringVector(name: string, values: (string | null)[]): StringFlatVector {
    const encoder = new TextEncoder();
    const encoded = values.map((value) => encoder.encode(value ?? ""));
    const offsets = new Uint32Array(values.length + 1);
    for (let i = 0; i < encoded.length; i++) {
        offsets[i + 1] = offsets[i] + encoded[i].length;
    }
    const data = new Uint8Array(offsets[values.length]);
    encoded.forEach((value, i) => data.set(value, offsets[i]));

    const present = new BitVector(new Uint8Array(Math.ceil(values.length / 8)), values.length);
    values.forEach((value, i) => present.set(i, value !== null));
    return new StringFlatVector(name, offsets, data, present);
}

describe("filterFeatureTable", () => {
    test("returns undefined for unsupported expressions", () => {
        expect(isColumnarFilterSupportedAtZoom(["within", {}] as unknown as FilterSpecification, 0)).toBe(false);
        expect(isColumnarFilterSupportedAtZoom(
            ["==", ["to-string", ["get", "name"]], "alpha"] as FilterSpecification, 0,
        )).toBe(false);
        expect(isColumnarFilterSupportedAtZoom(
            ["match", ["get", "name"], "alpha", ["has", "enabled"], false] as FilterSpecification, 0,
        )).toBe(false);
        expect(isColumnarFilterSupportedAtZoom([">", ["geometry-type"], "Point"] as FilterSpecification, 0)).toBe(false);

        const table = featureTable([flatStringVector("name", ["alpha"])]);
        expect(filterFeatureTable(table, ["within", {}] as unknown as FilterSpecification, 0)).toBeUndefined();
    });

    test("rejects comparisons and membership tests against a dynamic (non-literal) value", () => {
        // Comparing two properties to each other: the right-hand side must fall back rather than
        // be silently matched against its own ["get", "b"] tokens.
        expect(isColumnarFilterSupportedAtZoom(
            ["==", ["get", "a"], ["get", "b"]] as FilterSpecification, 0,
        )).toBe(false);
        expect(isColumnarFilterSupportedAtZoom(
            [">", ["get", "a"], ["get", "b"]] as FilterSpecification, 0,
        )).toBe(false);
        // A dynamic (property-derived) haystack for `in`/`!in`, as opposed to a literal list.
        expect(isColumnarFilterSupportedAtZoom(
            ["in", ["get", "x"], ["get", "y"]] as FilterSpecification, 0,
        )).toBe(false);

        const table = featureTable([
            flatStringVector("a", ["alpha", "beta"]),
            flatStringVector("b", ["alpha", "gamma"]),
        ]);
        expect(filterFeatureTable(table, ["==", ["get", "a"], ["get", "b"]] as FilterSpecification, 0)).toBeUndefined();
    });

    test('supports a ["literal", value] wrapper on the value side of an expression', () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        expect(on(["==", ["get", "rank"], ["literal", 2]])).toEqual([1]);
        expect(on(["in", ["get", "rank"], ["literal", [2, 3]]])).toEqual([1, 2]);

        // The same wrappers against a bare string key are mixed syntax: a string first argument
        // plus an array second argument classifies as an expression, where "rank" is a literal
        // string rather than a property reference. Declining hands it to the row-based path, which
        // is the only thing that reproduces that reading.
        expect(isColumnarFilterSupportedAtZoom(["==", "rank", ["literal", 2]] as unknown as FilterSpecification, 0))
            .toBe(false);
        expect(isColumnarFilterSupportedAtZoom(["in", "rank", ["literal", [2, 3]]] as unknown as FilterSpecification, 0))
            .toBe(false);
    });

    test("supports constant branches and strict type comparison semantics", () => {
        const table = featureTable([
            flatStringVector("name", ["alpha", "beta"]),
            new BooleanFlatVector(
                "enabled",
                new BitVector(new Uint8Array([0b00000011]), 2),
                new BitVector(new Uint8Array([0b00000010]), 2),
            ),
        ]);

        expect(selection(filterFeatureTable(table, false, 0))).toEqual([]);
        expect(selection(filterFeatureTable(table, ["all", true, ["!=", "name", 1]] as FilterSpecification, 0)))
            .toEqual([0, 1]);
        expect(selection(filterFeatureTable(table, [">", "enabled", false] as FilterSpecification, 0)))
            .toEqual([1]);
    });

    test("compares safe Int64 values using style-spec number semantics", () => {
        const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
        const table = featureTable(
            [new Int64FlatVector("population", new BigInt64Array([999n, 1000n, unsafe]), 3)],
            new Int64FlatVector("id", new BigInt64Array([10n, 11n, unsafe]), 3),
        );

        expect(selection(filterFeatureTable(table, ["==", "$id", 10] as FilterSpecification, 0))).toEqual([0]);
        expect(selection(filterFeatureTable(table, ["!=", "$id", 10] as FilterSpecification, 0))).toEqual([1, 2]);
        expect(selection(filterFeatureTable(table, [">=", "population", 1000] as FilterSpecification, 0))).toEqual([1]);
        expect(selection(filterFeatureTable(table, ["!=", "population", 1000] as FilterSpecification, 0))).toEqual([0, 2]);
    });

    test("does not fold a filter with zoom in the target position compared against a property", () => {
        const filter = [">=", ["zoom"], ["get", "rank"]] as unknown as FilterSpecification;

        expect(isColumnarFilterSupportedAtZoom(filter, 10)).toBe(false);
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);
        expect(filterFeatureTable(table, filter, 10)).toBeUndefined();
    });

    test("gates columnar bucket creation on both the encoding and the filter", () => {
        const supported = [">=", "rank", 2] as FilterSpecification;
        const unsupported = ["within", {}] as unknown as FilterSpecification;

        expect(isColumnarBucketSupported("mlt", supported, 0)).toBe(true);
        expect(isColumnarBucketSupported("mvt", supported, 0)).toBe(false);
        expect(isColumnarBucketSupported(undefined, supported, 0)).toBe(false);
        expect(isColumnarBucketSupported("mlt", unsupported, 0)).toBe(false);
    });

    test("announces a filter-caused fallback once, naming the layer and the offending node", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
            // Distinct array identities: the report is deduplicated per filter object.
            const supported = [">=", "rank", 2] as FilterSpecification;
            const unsupported = ["all", [">=", "rank", 2], ["within", {}]] as unknown as FilterSpecification;

            expect(isColumnarBucketSupported("mlt", supported, 0, "roads")).toBe(true);
            expect(warn).not.toHaveBeenCalled();

            // A non-MLT tile is not a filter problem, so it stays quiet even though it declines.
            expect(isColumnarBucketSupported("mvt", unsupported, 0, "roads")).toBe(false);
            expect(warn).not.toHaveBeenCalled();

            expect(isColumnarBucketSupported("mlt", unsupported, 0, "roads")).toBe(false);
            expect(warn).toHaveBeenCalledTimes(1);
            const message = warn.mock.calls[0][0] as string;
            expect(message).toContain('layer "roads"');
            // The compound is walked so the message names the operator that actually declined.
            expect(message).toContain('["within",{}]');
            expect(message).not.toContain('">=","rank"');

            // Re-parsing another tile with the same filter must not repeat the warning.
            expect(isColumnarBucketSupported("mlt", unsupported, 1, "roads")).toBe(false);
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            warn.mockRestore();
        }
    });

    test("treats an absent filter as always true and a primitive one as unsupported", () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);

        expect(isColumnarFilterSupportedAtZoom(undefined, 0)).toBe(true);
        expect(selection(filterFeatureTable(table, undefined, 0))).toEqual([0, 1, 2]);
        expect(selection(filterFeatureTable(table, null as unknown as FilterSpecification, 0))).toEqual([0, 1, 2]);
        // A malformed primitive filter can be neither a WeakMap key nor normalized.
        expect(isColumnarFilterSupportedAtZoom(42 as unknown as FilterSpecification, 0)).toBe(false);
    });

    test('negates a child with the "!" compound operator', () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);

        expect(selection(filterFeatureTable(table, ["!", ["==", "rank", 2]] as FilterSpecification, 0)))
            .toEqual([0, 2]);
    });

    test('resolves the ["id"] accessor like the "$id" shorthand', () => {
        const table = featureTable(
            [new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)],
            new Int32FlatVector("id", new Int32Array([10, 11, 12]), 3),
        );

        expect(selection(filterFeatureTable(table, ["==", ["id"], 11] as FilterSpecification, 0))).toEqual([1]);
    });

    test("orders and negates string columns in both dictionary and flat encodings", () => {
        const values = ["alpha", "beta", "gamma"];
        const flat = featureTable([flatStringVector("name", values)]);
        const dictionary = featureTable([dictionaryStringVector("name", values)]);
        const on = (table: FeatureTable, filter: unknown) =>
            selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        // Ordering takes the decoding scan for flat strings and the dictionary-evaluation path for
        // codes, so both encodings are exercised across the four ordering operators.
        expect(on(flat, [">", "name", "beta"])).toEqual([2]);
        expect(on(dictionary, [">", "name", "beta"])).toEqual([2]);
        expect(on(flat, ["<=", "name", "beta"])).toEqual([0, 1]);
        expect(on(dictionary, ["<", "name", "beta"])).toEqual([0]);
        expect(on(flat, [">=", "name", "gamma"])).toEqual([2]);

        // Negated membership resolves through the byte-comparison equality path. `!in` exists only
        // in legacy syntax, so its values are the plain variadic tail.
        expect(on(flat, ["!in", "name", "alpha"])).toEqual([1, 2]);
        expect(on(dictionary, ["!in", "name", "alpha"])).toEqual([1, 2]);

        // An operand of a different type is never ordered relative to a string.
        expect(on(flat, [">", "name", 5])).toEqual([]);
        // An equality operand no string can equal leaves the whole dictionary unmatched.
        expect(on(dictionary, ["==", "name", 5])).toEqual([]);
        // An operand no entry can equal: every code stays unmatched, and the negation of that is
        // every row rather than none.
        expect(on(dictionary, ["==", "name", "x"])).toEqual([]);
        expect(on(dictionary, ["!=", "name", "x"])).toEqual([0, 1, 2]);
    });

    test("scans nullable string columns in both dictionary and flat encodings", () => {
        const values = ["alpha", null, "gamma"];
        const flat = featureTable([nullableFlatStringVector("name", values)]);
        const dictionary = featureTable([dictionaryStringVector("name", values)]);
        const on = (table: FeatureTable, filter: unknown) =>
            selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        expect(on(flat, ["==", "name", "alpha"])).toEqual([0]);
        expect(on(dictionary, ["==", "name", "alpha"])).toEqual([0]);
        // A null value is "not alpha", matching the null semantics of the row-based path.
        expect(on(flat, ["!=", "name", "alpha"])).toEqual([1, 2]);
        expect(on(dictionary, ["!=", "name", "alpha"])).toEqual([1, 2]);
    });

    test("compares bigint operands and refuses unsafe ones", () => {
        const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
        const table = featureTable([
            new Int64FlatVector("population", new BigInt64Array([999n, 1000n, 1001n]), 3),
        ]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        expect(on(["==", "population", 1000n])).toEqual([1]);
        expect(on([">", "population", 1000n])).toEqual([2]);
        // Outside the safe-integer range there is no comparison that does not lose precision.
        expect(on([">", "population", unsafe])).toEqual([]);
        expect(on(["==", "population", unsafe])).toEqual([]);
    });

    test("normalizes match expressions into membership leaves", () => {
        const table = featureTable([flatStringVector("name", ["alpha", "beta", "gamma"])]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        // Array label with a `false` fallback → an "in" leaf over the true-output labels.
        expect(on(["match", ["get", "name"], ["alpha", "gamma"], true, false])).toEqual([0, 2]);
        // Scalar label with a `true` fallback → a "!in" leaf over the false-output labels.
        expect(on(["match", ["get", "name"], "beta", false, true])).toEqual([0, 2]);

        // A non-boolean fallback, a non-boolean output, or an unsupported input is not representable.
        const unsupported = (filter: unknown) =>
            isColumnarFilterSupportedAtZoom(filter as FilterSpecification, 0);
        expect(unsupported(["match", ["get", "name"], "alpha", true, "nope"])).toBe(false);
        expect(unsupported(["match", ["to-string", ["get", "name"]], "alpha", true, false])).toBe(false);
    });

    test("rejects malformed compound children", () => {
        const unsupported = (filter: unknown) =>
            isColumnarFilterSupportedAtZoom(filter as FilterSpecification, 0);

        expect(unsupported(["all", 42])).toBe(false);
        expect(unsupported(["all", ["within", {}]])).toBe(false);
        // An undefined child normalizes to constant-true rather than failing the whole filter.
        expect(unsupported(["all", undefined])).toBe(true);
    });

    test("preserves first-match-wins when lowering a case expression", () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        // Every expectation here was taken from style-spec's own featureFilter on the same inputs.
        // rank 2 matches the first test, whose output is false, so the later test that would also
        // match never runs. A flat union of the branches would wrongly return [1, 2].
        expect(on(["case", ["==", ["get", "rank"], 2], false, [">=", ["get", "rank"], 2], true, false]))
            .toEqual([2]);

        // A case is still a compound, so zoom folding reaches its tests.
        const zoomCase = ["case", [">=", ["zoom"], 14], true, false];
        expect(selection(filterFeatureTable(table, zoomCase as FilterSpecification, 14))).toEqual([0, 1, 2]);
        expect(selection(filterFeatureTable(table, zoomCase as FilterSpecification, 13))).toEqual([]);

        const unsupported = (filter: unknown) => isColumnarFilterSupportedAtZoom(filter as FilterSpecification, 0);
        // Missing fallback (odd length), and a branch output that is not a filter.
        expect(unsupported(["case", ["==", ["get", "rank"], 2], true])).toBe(false);
        expect(unsupported(["case", ["==", ["get", "rank"], 2], "yes", false])).toBe(false);
    });

    test("resolves typeof against a column's representation and its nulls", () => {
        // y = [5, null, 7]: a nullability buffer marks rows 0 and 2 present.
        const y = new Int32FlatVector("y", new Int32Array([5, 0, 7]), new BitVector(new Uint8Array([0b00000101]), 3));
        const table = featureTable([y]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        // Upstream typeof reports the type of the evaluated *value*, so a null row is "null"
        // rather than "number". Values pinned against featureFilter on equivalent rows.
        expect(on(["==", ["typeof", ["get", "y"]], "number"])).toEqual([0, 2]);
        expect(on(["==", ["typeof", ["get", "y"]], "null"])).toEqual([1]);
        expect(on(["!=", ["typeof", ["get", "y"]], "number"])).toEqual([1]);
        expect(on(["==", ["typeof", ["get", "y"]], "string"])).toEqual([]);

        // A column absent from the tile is all-null, which is an answer rather than a decline.
        expect(on(["==", ["typeof", ["get", "absent"]], "null"])).toEqual([0, 1, 2]);
        expect(on(["==", ["typeof", ["get", "absent"]], "number"])).toEqual([]);

        // An Int64 column is a number to a filter, not a bigint.
        const big = featureTable([new Int64FlatVector("pop", new BigInt64Array([1n, 2n]), 2)]);
        expect(selection(filterFeatureTable(big, ["==", ["typeof", ["get", "pop"]], "number"] as FilterSpecification, 0)))
            .toEqual([0, 1]);

        const unsupported = (filter: unknown) => isColumnarFilterSupportedAtZoom(filter as FilterSpecification, 0);
        // Only the ["typeof", …] == name orientation is recognised; the rest fall back.
        expect(unsupported(["==", "number", ["typeof", ["get", "y"]]])).toBe(false);
        expect(unsupported(["==", ["typeof", ["geometry-type"]], "string"])).toBe(false);
        expect(unsupported([">", ["typeof", ["get", "y"]], "number"])).toBe(false);
    });

    test("folds legacy $type existence tests instead of testing them against a column", () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        // Every feature has a geometry type, so there is no presence to test: `convertHasOp` in
        // the style spec folds these to `true` and `["!", true]` respectively.
        expect(on(["has", "$type"])).toEqual([0, 1, 2]);
        expect(on(["!has", "$type"])).toEqual([]);

        // `$id` keeps testing the id column, which this table does not carry.
        expect(on(["has", "$id"])).toEqual([]);
        expect(on(["!has", "$id"])).toEqual([0, 1, 2]);
    });

    test("declines the object-lookup forms of get and has", () => {
        const unsupported = (filter: unknown) =>
            isColumnarFilterSupportedAtZoom(filter as FilterSpecification, 0);

        // Three-argument `has` and `get` read the key out of a supplied object rather than out of
        // the feature, so neither names a column.
        expect(unsupported(["has", "name", ["literal", { name: 1 }]])).toBe(false);
        expect(unsupported(["==", ["get", "name", ["literal", { name: 1 }]], "alpha"])).toBe(false);
        // A computed key is not resolvable ahead of the scan either.
        expect(unsupported(["has", ["get", "key"]])).toBe(false);
    });

    test("folds a zoom-only leaf for every operator shape it supports", () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);
        const on = (filter: unknown, zoom: number) =>
            selection(filterFeatureTable(table, filter as FilterSpecification, zoom));

        // has/!has on a resolved literal settles without ever consulting the table.
        expect(on(["has", ["zoom"]], 0)).toEqual([0, 1, 2]);
        expect(on(["!has", ["zoom"]], 0)).toEqual([]);

        // Membership against a literal zoom list folds per zoom.
        const inZooms = ["in", ["zoom"], ["literal", [14, 15]]];
        expect(on(inZooms, 14)).toEqual([0, 1, 2]);
        expect(on(inZooms, 13)).toEqual([]);

        // A zoom-targeted match is left unfolded, and a literal match input is not a valid target.
        expect(isColumnarFilterSupportedAtZoom(
            ["match", ["zoom"], 14, true, false] as unknown as FilterSpecification, 14,
        )).toBe(false);
    });

    test("refuses to build a matcher for operators that do not compare values", () => {
        // Defensive guard only: `has`/`!has` are resolved before any matcher is built, both in
        // filterKernels.ts and in zoomFolding.ts, so this is unreachable via filterFeatureTable.
        expect(() => createValueMatcher("has", [])).toThrowError("Unsupported operator: has");
        expect(() => createValueMatcher("!has", [])).toThrowError("Unsupported operator: !has");
    });
});

function featureTable(properties: Vector[], idVector?: Int32FlatVector | Int64FlatVector): FeatureTable {
    const numFeatures = properties[0]?.size ?? idVector?.size ?? 0;
    const geometry = createConstGeometryVector(
        numFeatures,
        GEOMETRY_TYPE.POINT,
        {},
        undefined,
        new Int32Array(0),
    );
    return new FeatureTable("test", geometry, idVector, properties);
}

function selection(value: SelectionVector | undefined): number[] {
    return value ? Array.from(value.selectionValues()) : [];
}
