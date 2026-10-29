import { describe, expect, test } from "vitest";
import { filterFeatureTable } from "./execution/tableFilter";
import { isColumnarFilterSupportedAtZoom } from "./planning/bucketSupport";
import { isExpressionFilter } from "./planning/filterClassification";
import FeatureTable from "../../vector/featureTable";
import { GEOMETRY_TYPE } from "../../vector/geometry/geometryType";
import { createConstGeometryVector } from "../../vector/geometry/constGeometryVector";
import { Int32FlatVector } from "../../vector/flat/int32FlatVector";
import { BooleanFlatVector } from "../../vector/flat/booleanFlatVector";
import { StringFlatVector } from "../../vector/flat/stringFlatVector";
import BitVector from "../../vector/flat/bitVector";
import type { SelectionVector } from "../../vector/filter/selectionVector";
import type Vector from "../../vector/vector";
import type { FilterSpecification } from "@maplibre/maplibre-gl-style-spec";

/**
 * Port of style-spec's `feature_filter.test.ts` onto `filterFeatureTable`, with three differences:
 * 1. Unsupported expressions (`within`, `global-state`, type assertions, ...) are checked to decline.
 * 2. MLT stores null and missing alike, so for `has`/`!has` and legacy `== null`/`!= null`
 *    upstream's two answers collapse into one.
 * 3. APIs without an MLT equivalent (`getGlobalStateRefs`, `convertFilter` output, warning text) are skipped.
 */

function selection(value: SelectionVector | undefined): number[] {
    return value ? Array.from(value.selectionValues()) : [];
}

/** One property value → one column, `null` and `undefined` become no column (point 2). */
function valueVector(name: string, value: unknown): Vector | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "number") {
        return new Int32FlatVector(name, new Int32Array([value]), 1);
    }
    if (typeof value === "boolean") {
        return new BooleanFlatVector(name, new BitVector(new Uint8Array([value ? 1 : 0]), 1), 1);
    }
    if (typeof value === "string") {
        const bytes = new TextEncoder().encode(value);
        return new StringFlatVector(name, new Uint32Array([0, bytes.length]), bytes);
    }
    throw new Error(`unsupported test property value: ${JSON.stringify(value)}`);
}

/** MVT's feature.type numbering (1/2/3) onto MLT's `GEOMETRY_TYPE` enum. */
const MVT_TYPE: Record<number, GEOMETRY_TYPE> = {
    1: GEOMETRY_TYPE.POINT,
    2: GEOMETRY_TYPE.LINESTRING,
    3: GEOMETRY_TYPE.POLYGON,
};

interface RowOptions {
    id?: number;
    /** MVT feature.type numbering: 1 = Point, 2 = LineString, 3 = Polygon. */
    mvtType?: number;
    zoom?: number;
}

function oneRowTable(properties: Record<string, unknown>, options: RowOptions = {}): FeatureTable {
    const vectors: Vector[] = [];
    for (const [name, value] of Object.entries(properties)) {
        const vector = valueVector(name, value);
        if (vector) vectors.push(vector);
    }
    const idVector = options.id !== undefined ? new Int32FlatVector("id", new Int32Array([options.id]), 1) : undefined;
    const geometryType = options.mvtType !== undefined ? MVT_TYPE[options.mvtType] : GEOMETRY_TYPE.POINT;
    const geometry = createConstGeometryVector(1, geometryType, {}, undefined, new Int32Array(0));
    return new FeatureTable("test", geometry, idVector, vectors);
}

/** Runs `filter` on a one-row table, asserts it is supported and returns whether the row matched. */
function matches(
    filter: FilterSpecification | undefined,
    properties: Record<string, unknown> = {},
    options: RowOptions = {},
): boolean {
    const zoom = options.zoom ?? 0;
    expect(isColumnarFilterSupportedAtZoom(filter, zoom)).toBe(true);
    const table = oneRowTable(properties, options);
    return selection(filterFeatureTable(table, filter, zoom)).includes(0);
}

/** Asserts `filter` is declined rather than evaluated. */
function declines(filter: FilterSpecification | undefined, zoom = 0): void {
    expect(isColumnarFilterSupportedAtZoom(filter, zoom)).toBe(false);
    expect(filterFeatureTable(oneRowTable({}), filter, zoom)).toBeUndefined();
}

describe("expression syntax", () => {
    test("zoom comparison against a wrapped target declines (target isn't a plain accessor)", () => {
        declines([">=", ["number", ["get", "x"]], ["zoom"]] as unknown as FilterSpecification);
    });

    test("comparing two properties declines (both sides wrapped in a type assertion)", () => {
        declines(["==", ["string", ["get", "x"]], ["string", ["get", "y"]]] as unknown as FilterSpecification);
    });

    test("collator comparison declines (target wrapped, plus an unsupported 4th argument)", () => {
        declines([
            "==",
            ["string", ["get", "x"]],
            ["string", ["get", "y"]],
            ["collator", { "case-sensitive": true }],
        ] as unknown as FilterSpecification);
    });

    test("any/all over literal booleans", () => {
        expect(matches(["all"])).toBe(true);
        expect(matches(["all", true])).toBe(true);
        expect(matches(["all", true, false])).toBe(false);
        expect(matches(["all", true, true])).toBe(true);
        expect(matches(["any"])).toBe(false);
        expect(matches(["any", true])).toBe(true);
        expect(matches(["any", true, false])).toBe(true);
        expect(matches(["any", false, false])).toBe(false);
    });

    test("a bare `literal` filter declines (not a recognized filter operator)", () => {
        declines(["literal", true] as unknown as FilterSpecification);
        declines(["literal", false] as unknown as FilterSpecification);
    });

    test("match", () => {
        const filter = ["match", ["get", "x"], ["a", "b", "c"], true, false] as FilterSpecification;
        expect(matches(filter, { x: "a" })).toBe(true);
        expect(matches(filter, { x: "c" })).toBe(true);
        expect(matches(filter, { x: "d" })).toBe(false);
    });

    test("type error cases decline instead of throwing (MLT's normalizeExpression never throws)", () => {
        declines(["==", ["number", ["get", "x"]], ["string", ["get", "y"]]] as unknown as FilterSpecification);
        declines(["number", ["get", "x"]] as unknown as FilterSpecification);
        declines(["boolean", ["get", "x"]] as unknown as FilterSpecification);
    });

    test("within declines", () => {
        declines([
            "within",
            {
                type: "Polygon",
                coordinates: [
                    [
                        [0, 0],
                        [5, 0],
                        [5, 5],
                        [0, 5],
                        [0, 0],
                    ],
                ],
            },
        ] as unknown as FilterSpecification);
    });

    test("global-state declines", () => {
        declines(["==", ["global-state", "x"], ["get", "x"]] as unknown as FilterSpecification);
    });
});

// `getGlobalStateRefs()` has no MLT equivalent, not ported.

describe("legacy filter detection (isExpressionFilter — MLT's copy is a verbatim port of upstream's)", () => {
    test("definitely legacy filters", () => {
        expect(isExpressionFilter(["in", "color", "red", "blue"])).toBeFalsy();
        expect(isExpressionFilter(["in", "value", 42])).toBeFalsy();
        expect(isExpressionFilter(["in", "value", true])).toBeFalsy();
    });

    test("ambiguous value", () => {
        expect(isExpressionFilter(["in", "color", "red"])).toBeFalsy();
    });

    test("definitely expressions", () => {
        expect(isExpressionFilter(["in", ["get", "color"], "reddish"])).toBeTruthy();
        expect(isExpressionFilter(["in", ["get", "color"], ["red", "blue"]])).toBeTruthy();
        expect(isExpressionFilter(["in", 42, 42])).toBeTruthy();
        expect(isExpressionFilter(["in", true, true])).toBeTruthy();
        expect(isExpressionFilter(["in", "red", ["get", "colors"]])).toBeTruthy();
    });
});

describe("legacy filter semantics (ported without convertFilter — see README.md 'Known gaps')", () => {
    test("mimics the upstream legacy type-mismatch semantics", () => {
        // MLT lowers legacy syntax directly, so the unconverted filter is run.
        const filter = ["any", ["all", [">", "y", 0], [">", "y", 0]], [">", "x", 0]] as FilterSpecification;
        expect(matches(filter, { x: 0, y: 1 })).toBe(true);
        expect(matches(filter, { x: 1, y: 0 })).toBe(true);
        expect(matches(filter, { x: 0, y: 0 })).toBe(false);
        expect(matches(filter, { x: null, y: 1 })).toBe(true);
        expect(matches(filter, { x: 1, y: null })).toBe(true);
        expect(matches(filter, { x: null, y: null })).toBe(false);
    });

    // The two convertFilter AST-shape tests have no MLT equivalent.
});

describe("legacy filter tests", () => {
    test("degenerate", () => {
        expect(matches(undefined)).toBe(true);
        expect(matches(null)).toBe(true);
    });

    test("==, string", () => {
        const filter = ["==", "foo", "bar"] as FilterSpecification;
        expect(matches(filter, { foo: "bar" })).toBe(true);
        expect(matches(filter, { foo: "baz" })).toBe(false);
    });

    test("==, number", () => {
        const filter = ["==", "foo", 0] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false); // null, undefined, and missing all collapse to this
    });

    test("==, null", () => {
        const filter = ["==", "foo", null] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        // Upstream: explicit null matches, missing does not. MLT collapses both (point 2).
        expect(matches(filter, {})).toBe(false); // upstream: null -> true, missing/undefined -> false
    });

    test("==, $type", () => {
        const filter = ["==", "$type", "LineString"] as FilterSpecification;
        expect(matches(filter, {}, { mvtType: 1 })).toBe(false);
        expect(matches(filter, {}, { mvtType: 2 })).toBe(true);
    });

    test("==, $id", () => {
        const filter = ["==", "$id", 1234] as FilterSpecification;
        expect(matches(filter, {}, { id: 1234 })).toBe(true);
        // A property named "id" is not the feature id, $id reads the unset id vector.
        expect(matches(filter, { id: 1234 })).toBe(false);
        // Upstream's third case (a *string* `id: '1234'`) has no MLT equivalent: an id vector is
        // always numeric, so a string id can't be represented at all.
    });

    test("!=, string", () => {
        const filter = ["!=", "foo", "bar"] as FilterSpecification;
        expect(matches(filter, { foo: "bar" })).toBe(false);
        expect(matches(filter, { foo: "baz" })).toBe(true);
    });

    test("!=, number", () => {
        const filter = ["!=", "foo", 0] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: 1 })).toBe(true);
        expect(matches(filter, { foo: "0" })).toBe(true);
        expect(matches(filter, { foo: true })).toBe(true);
        expect(matches(filter, { foo: false })).toBe(true);
        expect(matches(filter, {})).toBe(true);
    });

    test("!=, null", () => {
        const filter = ["!=", "foo", null] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: 1 })).toBe(true);
        expect(matches(filter, { foo: "0" })).toBe(true);
        expect(matches(filter, { foo: true })).toBe(true);
        expect(matches(filter, { foo: false })).toBe(true);
        // Upstream: explicit null fails, missing passes. MLT collapses both.
        expect(matches(filter, {})).toBe(true); // upstream: null -> false, missing/undefined -> true
    });

    test("!=, $type", () => {
        const filter = ["!=", "$type", "LineString"] as FilterSpecification;
        expect(matches(filter, {}, { mvtType: 1 })).toBe(true);
        expect(matches(filter, {}, { mvtType: 2 })).toBe(false);
    });

    test("<, number", () => {
        const filter = ["<", "foo", 0] as FilterSpecification;
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: -1 })).toBe(true);
        expect(matches(filter, { foo: "1" })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: "-1" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false);
    });

    test("<, string", () => {
        const filter = ["<", "foo", "0"] as FilterSpecification;
        expect(matches(filter, { foo: -1 })).toBe(false);
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: "1" })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: "-1" })).toBe(true);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false);
    });

    test("<=, number", () => {
        const filter = ["<=", "foo", 0] as FilterSpecification;
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: -1 })).toBe(true);
        expect(matches(filter, { foo: "1" })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: "-1" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false);
    });

    test("<=, string", () => {
        const filter = ["<=", "foo", "0"] as FilterSpecification;
        expect(matches(filter, { foo: -1 })).toBe(false);
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: "1" })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(true);
        expect(matches(filter, { foo: "-1" })).toBe(true);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false);
    });

    test(">, number", () => {
        const filter = [">", "foo", 0] as FilterSpecification;
        expect(matches(filter, { foo: 1 })).toBe(true);
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: -1 })).toBe(false);
        expect(matches(filter, { foo: "1" })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: "-1" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false);
    });

    test(">, string", () => {
        const filter = [">", "foo", "0"] as FilterSpecification;
        expect(matches(filter, { foo: -1 })).toBe(false);
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: "1" })).toBe(true);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: "-1" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false);
    });

    test(">=, number", () => {
        const filter = [">=", "foo", 0] as FilterSpecification;
        expect(matches(filter, { foo: 1 })).toBe(true);
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: -1 })).toBe(false);
        expect(matches(filter, { foo: "1" })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: "-1" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false);
    });

    test(">=, string", () => {
        const filter = [">=", "foo", "0"] as FilterSpecification;
        expect(matches(filter, { foo: -1 })).toBe(false);
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: "1" })).toBe(true);
        expect(matches(filter, { foo: "0" })).toBe(true);
        expect(matches(filter, { foo: "-1" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false);
    });

    test("in, degenerate", () => {
        const filter = ["in", "foo"] as FilterSpecification;
        expect(matches(filter, { foo: 1 })).toBe(false);
    });

    test("in, string", () => {
        const filter = ["in", "foo", "0"] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(true);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false);
    });

    test("in, number", () => {
        const filter = ["in", "foo", 0] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, {})).toBe(false);
    });

    test("in, null", () => {
        // Legacy `in` has no has-guard, so null and missing agree with upstream.
        const filter = ["in", "foo", null] as unknown as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        expect(matches(filter, { foo: null })).toBe(true);
    });

    test("in, multiple", () => {
        const filter = ["in", "foo", 0, 1] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: 1 })).toBe(true);
        expect(matches(filter, { foo: 3 })).toBe(false);
    });

    test("in, large_multiple", () => {
        const values = Array.from({ length: 2000 }).map(Number.call, Number) as number[];
        values.reverse();
        const filter = ["in", "foo"].concat(values) as unknown as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: 1 })).toBe(true);
        expect(matches(filter, { foo: 1999 })).toBe(true);
        expect(matches(filter, { foo: 2000 })).toBe(false);
    });

    test("in, large_multiple, heterogeneous", () => {
        const values: unknown[] = Array.from({ length: 2000 }).map(Number.call, Number);
        values.push("a");
        values.unshift("b");
        const filter = ["in", "foo"].concat(values) as unknown as FilterSpecification;
        expect(matches(filter, { foo: "b" })).toBe(true);
        expect(matches(filter, { foo: "a" })).toBe(true);
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: 1 })).toBe(true);
        expect(matches(filter, { foo: 1999 })).toBe(true);
        expect(matches(filter, { foo: 2000 })).toBe(false);
    });

    test("in, $type", () => {
        const filter = ["in", "$type", "LineString", "Polygon"] as FilterSpecification;
        expect(matches(filter, {}, { mvtType: 1 })).toBe(false);
        expect(matches(filter, {}, { mvtType: 2 })).toBe(true);
        expect(matches(filter, {}, { mvtType: 3 })).toBe(true);

        const filter1 = ["in", "$type", "Polygon", "LineString", "Point"] as FilterSpecification;
        expect(matches(filter1, {}, { mvtType: 1 })).toBe(true);
        expect(matches(filter1, {}, { mvtType: 2 })).toBe(true);
        expect(matches(filter1, {}, { mvtType: 3 })).toBe(true);
    });

    test("!in, degenerate", () => {
        const filter = ["!in", "foo"] as FilterSpecification;
        expect(matches(filter, { foo: 1 })).toBe(true);
    });

    test("!in, string", () => {
        const filter = ["!in", "foo", "0"] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, {})).toBe(true); // null, undefined, missing all collapse to this
    });

    test("!in, number", () => {
        const filter = ["!in", "foo", 0] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(true);
        expect(matches(filter, {})).toBe(true);
    });

    test("!in, null", () => {
        const filter = ["!in", "foo", null] as unknown as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: "0" })).toBe(true);
        expect(matches(filter, { foo: null })).toBe(false);
    });

    test("!in, multiple", () => {
        const filter = ["!in", "foo", 0, 1] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: 3 })).toBe(true);
    });

    test("!in, large_multiple", () => {
        const values = Array.from({ length: 2000 }).map(Number.call, Number) as number[];
        const filter = ["!in", "foo"].concat(values) as unknown as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: 1999 })).toBe(false);
        expect(matches(filter, { foo: 2000 })).toBe(true);
    });

    test("!in, $type", () => {
        const filter = ["!in", "$type", "LineString", "Polygon"] as FilterSpecification;
        expect(matches(filter, {}, { mvtType: 1 })).toBe(true);
        expect(matches(filter, {}, { mvtType: 2 })).toBe(false);
        expect(matches(filter, {}, { mvtType: 3 })).toBe(false);
    });

    test("any", () => {
        expect(matches(["any"] as FilterSpecification, { foo: 1 })).toBe(false);
        expect(matches(["any", ["==", "foo", 1]] as FilterSpecification, { foo: 1 })).toBe(true);
        expect(matches(["any", ["==", "foo", 0]] as FilterSpecification, { foo: 1 })).toBe(false);
        expect(matches(["any", ["==", "foo", 0], ["==", "foo", 1]] as FilterSpecification, { foo: 1 })).toBe(true);
    });

    test("all", () => {
        expect(matches(["all"] as FilterSpecification, { foo: 1 })).toBe(true);
        expect(matches(["all", ["==", "foo", 1]] as FilterSpecification, { foo: 1 })).toBe(true);
        expect(matches(["all", ["==", "foo", 0]] as FilterSpecification, { foo: 1 })).toBe(false);
        expect(matches(["all", ["==", "foo", 0], ["==", "foo", 1]] as FilterSpecification, { foo: 1 })).toBe(false);
    });

    test("none", () => {
        expect(matches(["none"] as FilterSpecification, { foo: 1 })).toBe(true);
        expect(matches(["none", ["==", "foo", 1]] as FilterSpecification, { foo: 1 })).toBe(false);
        expect(matches(["none", ["==", "foo", 0]] as FilterSpecification, { foo: 1 })).toBe(true);
        expect(matches(["none", ["==", "foo", 0], ["==", "foo", 1]] as FilterSpecification, { foo: 1 })).toBe(false);
    });

    test("has", () => {
        const filter = ["has", "foo"] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(true);
        expect(matches(filter, { foo: 1 })).toBe(true);
        expect(matches(filter, { foo: "0" })).toBe(true);
        expect(matches(filter, { foo: true })).toBe(true);
        expect(matches(filter, { foo: false })).toBe(true);
        // A null row is never "has": upstream's explicit null (true) collapses to false.
        expect(matches(filter, {})).toBe(false); // upstream: null -> true, missing/undefined -> false
    });

    test("!has", () => {
        const filter = ["!has", "foo"] as FilterSpecification;
        expect(matches(filter, { foo: 0 })).toBe(false);
        expect(matches(filter, { foo: 1 })).toBe(false);
        expect(matches(filter, { foo: "0" })).toBe(false);
        expect(matches(filter, { foo: true })).toBe(false);
        expect(matches(filter, { foo: false })).toBe(false);
        // Mirrors "has" above.
        expect(matches(filter, {})).toBe(true); // upstream: null -> false, missing/undefined -> true
    });

    test("pure legacy filter using `has` still matches the right features", () => {
        const filter = [
            "all",
            ["==", "$type", "LineString"],
            ["all", ["==", "class", "rail"], ["has", "service"]],
        ] as FilterSpecification;
        expect(matches(filter, { class: "rail", service: "yard" }, { mvtType: 2 })).toBe(true);
        expect(matches(filter, { class: "rail" }, { mvtType: 2 })).toBe(false);
        expect(matches(filter, { class: "road", service: "yard" }, { mvtType: 2 })).toBe(false);
    });
});

describe("global-state in filter", () => {
    test("basic global-state equality filter declines", () => {
        declines(["==", ["get", "id"], ["global-state", "activeId"]] as unknown as FilterSpecification);
    });

    test("global-state in a case filter expression declines", () => {
        declines([
            "case",
            ["==", ["get", "id"], ["global-state", "activeId"]],
            true,
            ["any", ["==", ["get", "role"], "start"], ["==", ["get", "role"], "end"]],
        ] as unknown as FilterSpecification);
    });

    test("isExpressionFilter recognizes filters mixing $type with expression operators", () => {
        // Upstream issue #1544: a legacy-looking ["==", "$type", …] next to an expression-only `case`.
        const filter = [
            "all",
            ["==", "$type", "Point"],
            [
                "case",
                ["==", ["get", "id"], ["global-state", "activeTrackId"]],
                true,
                ["any", ["==", ["get", "role"], "start"], ["==", ["get", "role"], "end"]],
            ],
        ] as unknown as FilterSpecification;
        expect(isExpressionFilter(filter)).toBe(true);
    });

    test("a mixed filter with an ordering operator on $type declines", () => {
        // Upstream also checks its warning text, MLT words it differently, so only the decline is checked.
        declines([
            "all",
            [">", "$type", "Point"],
            ["==", ["global-state", "active"], true],
        ] as unknown as FilterSpecification);
    });

    test("none is never an expression, so it is always converted from legacy syntax", () => {
        const filter = [
            "none",
            ["==", "$type", "Polygon"],
            ["case", ["==", ["get", "id"], ["global-state", "activeTrackId"]], true, false],
        ] as unknown as FilterSpecification;
        expect(isExpressionFilter(filter)).toBe(false);
    });

    test('a mixed "$type" != filter declines', () => {
        declines([
            "all",
            ["!=", "$type", "LineString"],
            ["==", ["global-state", "active"], true],
        ] as unknown as FilterSpecification);
    });
});
