import { describe, it, expect } from "vitest";
import filter from "./filter";
import FeatureTable from "../vector/featureTable";
import { IntFlatVector } from "../vector/flat/intFlatVector";
import { createStringDictionaryVector } from "../vector/dictionary/stringDictionaryVector";
import { createStringFlatVector } from "../vector/flat/stringFlatVector";
import { createStringFsstDictionaryVector } from "../vector/fsst-dictionary/stringFsstDictionaryVector";
import { createConstGeometryVector } from "../vector/geometry/constGeometryVector";
import TopologyVector from "../vector/geometry/topologyVector";
import { GEOMETRY_TYPE, type SINGLE_PART_GEOMETRY_TYPE } from "../vector/geometry/geometryType";
import { type SelectionVector } from "../vector/filter/selectionVector";
import { FlatSelectionVector } from "../vector/filter/flatSelectionVector";
import { SequenceSelectionVector } from "../vector/filter/sequenceSelectionVector";
import type Vector from "../vector/vector";
import type { IGeometryVector } from "../vector/geometry/geometryVector";

function createTopology(n: number): TopologyVector {
    const o = new Uint32Array(n + 1);
    for (let i = 0; i <= n; i++) o[i] = i;
    return new TopologyVector(o, o, o);
}

const int = (v: number[], name: string) => new IntFlatVector(name, new Int32Array(v), v.length);
const strDict = (v: (string | null)[], name: string) => createStringDictionaryVector(v, name);
const strFlat = (v: string[], name: string) => createStringFlatVector(v, name);
const strFsst = (v: (string | null)[], name: string) => createStringFsstDictionaryVector(v, name);

class MockGeometry implements IGeometryVector {
    private _types: Int32Array;
    constructor(types: number[]) { this._types = new Int32Array(types); }
    get numGeometries() { return this._types.length; }
    geometryType(i: number) { return this._types[i]; }
    containsSingleGeometryType() { return false; }
    filter(t: SINGLE_PART_GEOMETRY_TYPE): SelectionVector {
        const idx: number[] = [];
        for (let i = 0; i < this.numGeometries; i++) {
            if (this._types[i] === t || this._types[i] === t + 3) idx.push(i);
        }
        return new FlatSelectionVector(new Uint32Array(idx));
    }
    filterSelected(t: SINGLE_PART_GEOMETRY_TYPE, sv: SelectionVector): void {
        const v = sv.selectionValues();
        let w = 0;
        for (let i = 0; i < sv.limit; i++) {
            if (this._types[v[i]] === t || this._types[v[i]] === t + 3) sv.setIndex(w++, v[i]);
        }
        sv.setLimit(w);
    }
    get vertexBufferType() { return 0 as never; }
    get topologyVector() { return createTopology(this.numGeometries); }
    get vertexOffsets() { return new Int32Array(0); }
    get vertexBuffer() { return new Int32Array(0); }
    get mortonSettings() { return undefined; }
    getVertex() { return [0, 0] as [number, number]; }
    getSimpleEncodedVertex() { return [0, 0] as [number, number]; }
    getGeometries() { return []; }
    containsPolygonGeometry() { return false; }
}

function ft(n: number, props: Vector[] = [], geoType?: GEOMETRY_TYPE, geoTypes?: number[]): FeatureTable {
    let gv: IGeometryVector;
    if (geoTypes) {
        gv = new MockGeometry(geoTypes);
    } else {
        const t = createTopology(n);
        const vo = new Int32Array(n + 1);
        for (let i = 0; i <= n; i++) vo[i] = i * 2;
        gv = createConstGeometryVector(n, geoType ?? GEOMETRY_TYPE.POINT, t, vo, new Int32Array(n * 2));
    }
    return new FeatureTable("test", gv, undefined, props);
}

describe("filter", () => {
    describe("expression parsing", () => {
        it("null returns full selection", () => {
            expect(filter(ft(5), null as never)).toBeInstanceOf(SequenceSelectionVector);
        });

        it("throws for unsupported expression", () => {
            expect(() => filter(ft(5), ["bad", "x", 1] as never)).toThrow("not supported");
        });

        it("throws for unsupported compound", () => {
            expect(() => filter(ft(5), ["any", ["==", "x", 1]] as never)).toThrow("CompoundExpression not supported");
        });
    });

    describe("missing property", () => {
        const f = ft(5);
        it("== empty", () => expect(filter(f, ["==", "x", 1]).limit).toBe(0));
        it("!= full", () => expect(filter(f, ["!=", "x", 1]).limit).toBe(5));
        it(">= empty", () => expect(filter(f, [">=", "x", 1]).limit).toBe(0));
        it("<= empty", () => expect(filter(f, ["<=", "x", 1]).limit).toBe(0));
        it("> empty", () => expect(filter(f, [">", "x", 1]).limit).toBe(0));
        it("< empty", () => expect(filter(f, ["<", "x", 1]).limit).toBe(0));
        it("in empty", () => expect(filter(f, ["in", "x", 1] as never).limit).toBe(0));
        it("!in full", () => expect(filter(f, ["!in", "x", 1] as never).limit).toBe(5));
        it("has empty", () => expect(filter(f, ["has", "x"]).limit).toBe(0));
        it("!has full", () => expect(filter(f, ["!has", "x"] as never).limit).toBe(5));
    });

    describe("geometry type", () => {
        it("Point", () => filter(ft(5, [], GEOMETRY_TYPE.POINT), ["==", "$type", "Point"]));
        it("LineString", () => filter(ft(5, [], GEOMETRY_TYPE.LINESTRING), ["==", "$type", "LineString"]));
        it("Polygon", () => filter(ft(5, [], GEOMETRY_TYPE.POLYGON), ["==", "$type", "Polygon"]));
        it("geometry-type alias", () => filter(ft(5), ["==", "geometry-type", "Point"]));
        it("throws for !=", () => expect(() => filter(ft(5), ["!=", "$type", "Point"])).toThrow());
        it("throws for invalid", () => expect(() => filter(ft(5), ["==", "$type", "Bad"])).toThrow());
    });

    describe("compound", () => {
        it("combines filters", () => filter(ft(5, [int([1, 2, 3, 4, 5], "v")]), ["all", [">=", "v", 2], ["<=", "v", 4]]));
        it("$type moves to front", () => {
            const types = [GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.LINESTRING, GEOMETRY_TYPE.POINT];
            filter(ft(3, [int([1, 2, 3], "v")], undefined, types), ["all", [">=", "v", 1], ["==", "$type", "Point"]]);
        });
    });

    // Vector type dispatch for ==
    describe("== dispatch", () => {
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s")]), ["==", "s", "a"]));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s")]), ["==", "s", "a"]));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s")]), ["==", "s", "a"]));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v")]), ["==", "v", 1]));
    });

    // Vector type dispatch for == selected
    describe("== selected dispatch", () => {
        const flag = int([1, 1, 1], "f");
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["==", "s", "a"]]));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["==", "s", "a"]]));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["==", "s", "a"]]));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], ["==", "v", 1]]));
    });

    // Vector type dispatch for !=
    describe("!= dispatch", () => {
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s")]), ["!=", "s", "a"]));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s")]), ["!=", "s", "a"]));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s")]), ["!=", "s", "a"]));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v")]), ["!=", "v", 1]));
    });

    // Vector type dispatch for != selected
    describe("!= selected dispatch", () => {
        const flag = int([1, 1, 1], "f");
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!=", "s", "a"]]));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!=", "s", "a"]]));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!=", "s", "a"]]));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], ["!=", "v", 1]]));
    });

    // Vector type dispatch for >=
    describe(">= dispatch", () => {
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s")]), [">=", "s", "b"]));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s")]), [">=", "s", "b"]));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s")]), [">=", "s", "b"]));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v")]), [">=", "v", 2]));
    });

    // Vector type dispatch for >= selected
    describe(">= selected dispatch", () => {
        const flag = int([1, 1, 1], "f");
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], [">=", "s", "b"]]));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], [">=", "s", "b"]]));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], [">=", "s", "b"]]));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], [">=", "v", 2]]));
    });

    // Vector type dispatch for <=
    describe("<= dispatch", () => {
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s")]), ["<=", "s", "b"]));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s")]), ["<=", "s", "b"]));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s")]), ["<=", "s", "b"]));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v")]), ["<=", "v", 2]));
    });

    // Vector type dispatch for <= selected
    describe("<= selected dispatch", () => {
        const flag = int([1, 1, 1], "f");
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["<=", "s", "b"]]));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["<=", "s", "b"]]));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["<=", "s", "b"]]));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], ["<=", "v", 2]]));
    });

    // Vector type dispatch for in
    describe("in dispatch", () => {
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s")]), ["in", "s", "a", "c"] as never));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s")]), ["in", "s", "a", "c"] as never));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s")]), ["in", "s", "a", "c"] as never));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v")]), ["in", "v", 1, 3] as never));
    });

    // Vector type dispatch for in selected
    describe("in selected dispatch", () => {
        const flag = int([1, 1, 1], "f");
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["in", "s", "a"]] as never));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["in", "s", "a"]] as never));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["in", "s", "a"]] as never));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], ["in", "v", 1]] as never));
    });

    // Vector type dispatch for !in
    describe("!in dispatch", () => {
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s")]), ["!in", "s", "a"] as never));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s")]), ["!in", "s", "a"] as never));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s")]), ["!in", "s", "a"] as never));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v")]), ["!in", "v", 1] as never));
    });

    // Vector type dispatch for !in selected
    describe("!in selected dispatch", () => {
        const flag = int([1, 1, 1], "f");
        it("StringDictionaryVector", () => filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!in", "s", "a"]] as never));
        it("StringFlatVector", () => filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!in", "s", "a"]] as never));
        it("StringFsstDictionaryVector", () => filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!in", "s", "a"]] as never));
        it("IntVector", () => filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], ["!in", "v", 1]] as never));
    });

    // Strict comparison (> and <) - filter.ts specific implementation
    describe("> and <", () => {
        it("> excludes exact match", () => {
            const r = filter(ft(3, [int([1, 2, 3], "v")]), [">", "v", 2]);
            expect(r.limit).toBe(1);
        });

        it("< excludes exact match", () => {
            const r = filter(ft(3, [int([1, 2, 3], "v")]), ["<", "v", 2]);
            expect(r.limit).toBe(1);
        });

        it("> selected", () => filter(ft(3, [int([1, 2, 3], "v"), int([1, 1, 1], "f")]), ["all", ["==", "f", 1], [">", "v", 1]]));
        it("< selected", () => filter(ft(3, [int([1, 2, 3], "v"), int([1, 1, 1], "f")]), ["all", ["==", "f", 1], ["<", "v", 3]]));
    });

    describe("has/!has", () => {
        it("has", () => filter(ft(3, [strDict(["a", null, "c"], "s")]), ["has", "s"]));
        it("!has", () => filter(ft(3, [strDict(["a", null, "c"], "s")]), ["!has", "s"] as never));
        it("has selected", () => filter(ft(3, [strDict(["a", null, "c"], "s"), int([1, 1, 1], "f")]), ["all", ["==", "f", 1], ["has", "s"]]));
        it("!has selected", () => filter(ft(3, [strDict(["a", null, "c"], "s"), int([1, 1, 1], "f")]), ["all", ["==", "f", 1], ["!has", "s"]] as never));
    });
});
