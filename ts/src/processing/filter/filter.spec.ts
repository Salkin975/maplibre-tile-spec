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
import { FloatFlatVector } from "../../vector/flat/floatFlatVector";
import { DoubleFlatVector } from "../../vector/flat/doubleFlatVector";
import { createConstGeometryVector } from "../../vector/geometry/constGeometryVector";
import { StringFlatVector } from "../../vector/flat/stringFlatVector";
import type { StringDictionaryVector } from "../../vector/dictionary/stringDictionaryVector";
import type { FilterSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { SelectionVector } from "../../vector/filter/selectionVector";
import type Vector from "../../vector/vector";

/** Round-trip builders: real `encode*` → `decodeString`, so each vector has the decoder's real shape. */
function flatStringVector(name: string, values: string[]): StringFlatVector {
    return decodeString(name, encodePlainStrings(values), new IntWrapper(0), 2) as StringFlatVector;
}

function dictionaryStringVector(name: string, values: (string | null)[]): StringDictionaryVector {
    const numStreams = values.includes(null) ? 4 : 3;
    return decodeString(name, encodeDictionaryStrings(values), new IntWrapper(0), numStreams) as StringDictionaryVector;
}

/**
 * A plain string stream with nulls decodes to a sparse `StringDictionaryVector`, so a nullable
 * `StringFlatVector` is built directly.
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
        expect(
            isColumnarFilterSupportedAtZoom(["==", ["to-string", ["get", "name"]], "alpha"] as FilterSpecification, 0),
        ).toBe(false);
        expect(
            isColumnarFilterSupportedAtZoom(
                ["match", ["get", "name"], "alpha", ["has", "enabled"], false] as FilterSpecification,
                0,
            ),
        ).toBe(false);
        expect(isColumnarFilterSupportedAtZoom([">", ["geometry-type"], "Point"] as FilterSpecification, 0)).toBe(
            false,
        );

        const table = featureTable([flatStringVector("name", ["alpha"])]);
        expect(filterFeatureTable(table, ["within", {}] as unknown as FilterSpecification, 0)).toBeUndefined();
    });

    test("rejects comparisons and membership tests against a dynamic (non-literal) value", () => {
        // Comparing two properties: the right-hand side must not be matched as literal tokens.
        expect(isColumnarFilterSupportedAtZoom(["==", ["get", "a"], ["get", "b"]] as FilterSpecification, 0)).toBe(
            false,
        );
        expect(isColumnarFilterSupportedAtZoom([">", ["get", "a"], ["get", "b"]] as FilterSpecification, 0)).toBe(
            false,
        );
        // A property-derived haystack for `in`/`!in`.
        expect(isColumnarFilterSupportedAtZoom(["in", ["get", "x"], ["get", "y"]] as FilterSpecification, 0)).toBe(
            false,
        );

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

        // Mixed syntax reads "rank" as a string literal, only the row-based path reproduces that.
        expect(
            isColumnarFilterSupportedAtZoom(["==", "rank", ["literal", 2]] as unknown as FilterSpecification, 0),
        ).toBe(false);
        expect(
            isColumnarFilterSupportedAtZoom(["in", "rank", ["literal", [2, 3]]] as unknown as FilterSpecification, 0),
        ).toBe(false);
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
        expect(
            selection(filterFeatureTable(table, ["all", true, ["!=", "name", 1]] as FilterSpecification, 0)),
        ).toEqual([0, 1]);
        expect(selection(filterFeatureTable(table, [">", "enabled", false] as FilterSpecification, 0))).toEqual([1]);
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
        expect(selection(filterFeatureTable(table, ["!=", "population", 1000] as FilterSpecification, 0))).toEqual([
            0, 2,
        ]);
    });

    test("does not fold a filter with zoom in the target position compared against a property", () => {
        const filter = [">=", ["zoom"], ["get", "rank"]] as unknown as FilterSpecification;

        expect(isColumnarFilterSupportedAtZoom(filter, 10)).toBe(false);
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);
        expect(filterFeatureTable(table, filter, 10)).toBeUndefined();
    });

    test("gates columnar bucket creation on both the encoding and the filter", () => {
        const supportedFilter = [">=", "rank", 2] as FilterSpecification;
        const unsupportedFilter = ["within", {}] as unknown as FilterSpecification;

        expect(isColumnarBucketSupported("mlt", supportedFilter, 0)).toBe(true);
        expect(isColumnarBucketSupported("mvt", supportedFilter, 0)).toBe(false);
        expect(isColumnarBucketSupported(undefined, supportedFilter, 0)).toBe(false);
        expect(isColumnarBucketSupported("mlt", unsupportedFilter, 0)).toBe(false);
    });

    test("announces a filter-caused fallback once, naming the layer and the offending node", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
            // Distinct arrays, the report is deduplicated per filter object.
            const supportedFilter = [">=", "rank", 2] as FilterSpecification;
            const unsupportedFilter = ["all", [">=", "rank", 2], ["within", {}]] as unknown as FilterSpecification;

            expect(isColumnarBucketSupported("mlt", supportedFilter, 0, "roads")).toBe(true);
            expect(warn).not.toHaveBeenCalled();

            // A non-MLT tile declines without a warning.
            expect(isColumnarBucketSupported("mvt", unsupportedFilter, 0, "roads")).toBe(false);
            expect(warn).not.toHaveBeenCalled();

            expect(isColumnarBucketSupported("mlt", unsupportedFilter, 0, "roads")).toBe(false);
            expect(warn).toHaveBeenCalledTimes(1);
            const message = warn.mock.calls[0][0] as string;
            expect(message).toContain('layer "roads"');
            // The message names the operator that declined.
            expect(message).toContain('["within",{}]');
            expect(message).not.toContain('">=","rank"');

            // The same filter warns only once.
            expect(isColumnarBucketSupported("mlt", unsupportedFilter, 1, "roads")).toBe(false);
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            warn.mockRestore();
        }
    });

    test("treats an absent filter as always true and a primitive one as unsupported", () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);

        expect(isColumnarFilterSupportedAtZoom(undefined, 0)).toBe(true);
        expect(selection(filterFeatureTable(table, undefined, 0))).toEqual([0, 1, 2]);
        expect(selection(filterFeatureTable(table, null, 0))).toEqual([0, 1, 2]);
        // A primitive filter can be neither a WeakMap key nor normalized.
        expect(isColumnarFilterSupportedAtZoom(42 as unknown as FilterSpecification, 0)).toBe(false);
    });

    test('negates a child with the "!" compound operator', () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);

        expect(selection(filterFeatureTable(table, ["!", ["==", "rank", 2]] as FilterSpecification, 0))).toEqual([
            0, 2,
        ]);
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

        // Flat strings take the decoding scan, dictionary codes the dictionary path.
        expect(on(flat, [">", "name", "beta"])).toEqual([2]);
        expect(on(dictionary, [">", "name", "beta"])).toEqual([2]);
        expect(on(flat, ["<=", "name", "beta"])).toEqual([0, 1]);
        expect(on(dictionary, ["<", "name", "beta"])).toEqual([0]);
        expect(on(flat, [">=", "name", "gamma"])).toEqual([2]);

        // `!in` exists only in legacy syntax, its values are the variadic tail.
        expect(on(flat, ["!in", "name", "alpha"])).toEqual([1, 2]);
        expect(on(dictionary, ["!in", "name", "alpha"])).toEqual([1, 2]);

        // A non-string operand is never ordered against a string.
        expect(on(flat, [">", "name", 5])).toEqual([]);
        // An operand no string can equal leaves every code unmatched.
        expect(on(dictionary, ["==", "name", 5])).toEqual([]);
        // No entry equals the operand, so its negation selects every row.
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
        // A null value is "not alpha", as on the row-based path.
        expect(on(flat, ["!=", "name", "alpha"])).toEqual([1, 2]);
        expect(on(dictionary, ["!=", "name", "alpha"])).toEqual([1, 2]);
    });

    test("narrows a selection by a nullable dictionary column past the first byte of present bits", () => {
        const kind = ["a", "b", "a", "a", "b", "a", "a", "b", "a", "a", "b"];
        const name = ["x", null, "y", "x", "x", null, "y", "x", null, "y", "x"];
        const table = featureTable([dictionaryStringVector("kind", kind), dictionaryStringVector("name", name)]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        // The first leaf selects the "a" rows, the second narrows that selection.
        expect(on(["all", ["==", "kind", "a"], ["==", "name", "x"]])).toEqual([0, 3]);
        expect(on(["all", ["==", "kind", "a"], ["!=", "name", "x"]])).toEqual([2, 5, 6, 8, 9]);
        expect(on(["all", ["==", "kind", "a"], ["in", "name", "y", "z"]])).toEqual([2, 6, 9]);
        expect(on(["all", ["==", "kind", "a"], ["!in", "name", "y"]])).toEqual([0, 3, 5, 8]);
        // Without a prior selection, the whole column is scanned.
        expect(on(["!=", "name", "x"])).toEqual([1, 2, 5, 6, 8, 9]);
    });

    test("compares bigint operands and refuses unsafe ones", () => {
        const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
        const table = featureTable([new Int64FlatVector("population", new BigInt64Array([999n, 1000n, 1001n]), 3)]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        expect(on(["==", "population", 1000n])).toEqual([1]);
        expect(on([">", "population", 1000n])).toEqual([2]);
        // Outside the safe-integer range every comparison loses precision.
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
        expect(isSupported(["match", ["get", "name"], "alpha", true, "nope"])).toBe(false);
        expect(isSupported(["match", ["to-string", ["get", "name"]], "alpha", true, false])).toBe(false);
    });

    test("rejects malformed compound children", () => {
        expect(isSupported(["all", 42])).toBe(false);
        expect(isSupported(["all", ["within", {}]])).toBe(false);
        // An undefined child normalizes to true.
        expect(isSupported(["all", undefined])).toBe(true);
    });

    test("preserves first-match-wins when lowering a case expression", () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        // Expectations from style-spec's featureFilter. rank 2 stops at the first matching test,
        // a flat union of the branches would give [1, 2].
        expect(on(["case", ["==", ["get", "rank"], 2], false, [">=", ["get", "rank"], 2], true, false])).toEqual([2]);

        // Zoom folding reaches the tests of a case.
        const zoomCase = ["case", [">=", ["zoom"], 14], true, false];
        expect(selection(filterFeatureTable(table, zoomCase as FilterSpecification, 14))).toEqual([0, 1, 2]);
        expect(selection(filterFeatureTable(table, zoomCase as FilterSpecification, 13))).toEqual([]);

        // Missing fallback, and a branch output that is not a filter.
        expect(isSupported(["case", ["==", ["get", "rank"], 2], true])).toBe(false);
        expect(isSupported(["case", ["==", ["get", "rank"], 2], "yes", false])).toBe(false);
    });

    test("resolves typeof against a column's representation and its nulls", () => {
        // y = [5, null, 7]: a nullability buffer marks rows 0 and 2 present.
        const y = new Int32FlatVector("y", new Int32Array([5, 0, 7]), new BitVector(new Uint8Array([0b00000101]), 3));
        const table = featureTable([y]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        // typeof reports the value's type, so a null row is "null" (checked against featureFilter).
        expect(on(["==", ["typeof", ["get", "y"]], "number"])).toEqual([0, 2]);
        expect(on(["==", ["typeof", ["get", "y"]], "null"])).toEqual([1]);
        expect(on(["!=", ["typeof", ["get", "y"]], "number"])).toEqual([1]);
        expect(on(["==", ["typeof", ["get", "y"]], "string"])).toEqual([]);

        // A missing column is all-null, an answer rather than a decline.
        expect(on(["==", ["typeof", ["get", "absent"]], "null"])).toEqual([0, 1, 2]);
        expect(on(["==", ["typeof", ["get", "absent"]], "number"])).toEqual([]);

        // An Int64 column is a number to a filter, not a bigint.
        const big = featureTable([new Int64FlatVector("pop", new BigInt64Array([1n, 2n]), 2)]);
        expect(
            selection(filterFeatureTable(big, ["==", ["typeof", ["get", "pop"]], "number"] as FilterSpecification, 0)),
        ).toEqual([0, 1]);

        // Only ["typeof", …] == name is recognised.
        expect(isSupported(["==", "number", ["typeof", ["get", "y"]]])).toBe(false);
        expect(isSupported(["==", ["typeof", ["geometry-type"]], "string"])).toBe(false);
        expect(isSupported([">", ["typeof", ["get", "y"]], "number"])).toBe(false);
    });

    test("folds legacy $type existence tests instead of testing them against a column", () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);
        const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));

        // Every feature has a geometry type, the style spec folds these to `true` and `["!", true]`.
        expect(on(["has", "$type"])).toEqual([0, 1, 2]);
        expect(on(["!has", "$type"])).toEqual([]);

        // `$id` tests the id column, which this table lacks.
        expect(on(["has", "$id"])).toEqual([]);
        expect(on(["!has", "$id"])).toEqual([0, 1, 2]);
    });

    test("declines the object-lookup forms of get and has", () => {
        // Three-argument `has`/`get` read from a supplied object, not from a column.
        expect(isSupported(["has", "name", ["literal", { name: 1 }]])).toBe(false);
        expect(isSupported(["==", ["get", "name", ["literal", { name: 1 }]], "alpha"])).toBe(false);
        // A computed key cannot be resolved before the scan.
        expect(isSupported(["has", ["get", "key"]])).toBe(false);
    });

    test("folds a zoom-only leaf for every operator shape it supports", () => {
        const table = featureTable([new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3)]);
        const on = (filter: unknown, zoom: number) =>
            selection(filterFeatureTable(table, filter as FilterSpecification, zoom));

        // has/!has on a literal settles without the table.
        expect(on(["has", ["zoom"]], 0)).toEqual([0, 1, 2]);
        expect(on(["!has", ["zoom"]], 0)).toEqual([]);

        // Membership against a literal zoom list folds per zoom.
        const inZooms = ["in", ["zoom"], ["literal", [14, 15]]];
        expect(on(inZooms, 14)).toEqual([0, 1, 2]);
        expect(on(inZooms, 13)).toEqual([]);

        // A zoom-targeted match stays unfolded, a literal match input is not a valid target.
        expect(
            isColumnarFilterSupportedAtZoom(["match", ["zoom"], 14, true, false] as unknown as FilterSpecification, 14),
        ).toBe(false);
    });

    test("refuses to build a matcher for operators that do not compare values", () => {
        // Unreachable via filterFeatureTable, `has`/`!has` are resolved before any matcher is built.
        expect(() => createValueMatcher("has", [])).toThrowError("Unsupported operator: has");
        expect(() => createValueMatcher("!has", [])).toThrowError("Unsupported operator: !has");
    });

    describe("comparison of a number column with a number", () => {
        const run = (vector: Vector, operator: string, operand: number) =>
            selection(
                filterFeatureTable(featureTable([vector]), [operator, ["get", vector.name], operand] as FilterSpecification, 0),
            );

        test("treats rows without a value as a match only for !=", () => {
            // y = [5, null, 7]: a nullability buffer marks rows 0 and 2 present.
            const y = new Int32FlatVector("y", new Int32Array([5, 0, 7]), new BitVector(new Uint8Array([0b00000101]), 3));
            expect(run(y, "==", 5)).toEqual([0]);
            expect(run(y, "==", 0)).toEqual([]);
            expect(run(y, "!=", 5)).toEqual([1, 2]);
            expect(run(y, ">", 5)).toEqual([2]);
            expect(run(y, ">=", 5)).toEqual([0, 2]);
            expect(run(y, "<", 7)).toEqual([0]);
            expect(run(y, "<=", 7)).toEqual([0, 2]);
        });

        test("compares an unsigned Int32 column above 2^31", () => {
            const big = new Int32FlatVector("big", new Uint32Array([1, 3000000000, 4000000000]), 3);
            expect(run(big, ">", 2000000000)).toEqual([1, 2]);
            expect(run(big, "==", 3000000000)).toEqual([1]);
        });

        test("compares a Double column and never matches NaN with an ordering operator", () => {
            const d = new DoubleFlatVector("d", new Float64Array([1.5, Number.NaN, 3.5]), 3);
            expect(run(d, "==", 1.5)).toEqual([0]);
            expect(run(d, "!=", 1.5)).toEqual([1, 2]);
            expect(run(d, ">", 1)).toEqual([0, 2]);
            expect(run(d, "<=", 3.5)).toEqual([0, 2]);
        });

        test("compares a Float column on its single precision values", () => {
            const f = new FloatFlatVector("f", new Float32Array([0.5, 1.5, 0.1]), 3);
            expect(run(f, "==", 1.5)).toEqual([1]);
            expect(run(f, ">=", 1.5)).toEqual([1]);
            // 0.1 is not representable in single precision, so it does not equal the double 0.1
            expect(run(f, "==", 0.1)).toEqual([]);
        });

        test("keeps the generic path for membership and non-number operands", () => {
            const rank = new Int32FlatVector("rank", new Int32Array([1, 2, 3]), 3);
            const table = featureTable([rank]);
            const on = (filter: unknown) => selection(filterFeatureTable(table, filter as FilterSpecification, 0));
            expect(on(["in", ["get", "rank"], ["literal", [1, 3]]])).toEqual([0, 2]);
            expect(on(["==", ["get", "rank"], "2"])).toEqual([]);
            expect(on(["!=", ["get", "rank"], "2"])).toEqual([0, 1, 2]);
        });
    });
});

/** Whether the filter normalizes for the columnar path at zoom 0. */
function isSupported(filter: unknown): boolean {
    return isColumnarFilterSupportedAtZoom(filter as FilterSpecification, 0);
}

function featureTable(properties: Vector[], idVector?: Int32FlatVector | Int64FlatVector): FeatureTable {
    const numFeatures = properties[0]?.size ?? idVector?.size ?? 0;
    const geometry = createConstGeometryVector(numFeatures, GEOMETRY_TYPE.POINT, {}, undefined, new Int32Array(0));
    return new FeatureTable("test", geometry, idVector, properties);
}

function selection(value: SelectionVector | undefined): number[] {
    return value ? Array.from(value.selectionValues()) : [];
}
