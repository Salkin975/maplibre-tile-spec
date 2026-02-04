import { describe, it, expect, vi, afterEach, type MockInstance } from "vitest";
import filter from "./filter";
import FeatureTable from "../vector/featureTable";
import { IntFlatVector } from "../vector/flat/intFlatVector";
import { createStringDictionaryVector } from "../vector/dictionary/stringDictionaryVector";
import { createStringFlatVector } from "../vector/flat/stringFlatVector";
import { createStringFsstDictionaryVector } from "../vector/fsst-dictionary/stringFsstDictionaryVector";
import { createConstGeometryVector } from "../vector/geometry/constGeometryVector";
import TopologyVector from "../vector/geometry/topologyVector";
import { GEOMETRY_TYPE } from "../vector/geometry/geometryType";
import { SequenceSelectionVector } from "../vector/filter/sequenceSelectionVector";
import type Vector from "../vector/vector";
import * as utils from "../vector/utils";

function createTopology(n: number): TopologyVector {
    const o = new Uint32Array(n + 1);
    for (let i = 0; i <= n; i++) o[i] = i;
    return new TopologyVector(o, o, o);
}

const int = (v: number[], name: string) => new IntFlatVector(name, new Int32Array(v), v.length);
const strDict = (v: (string | null)[], name: string) => createStringDictionaryVector(v, name);
const strFlat = (v: string[], name: string) => createStringFlatVector(v, name);
const strFsst = (v: (string | null)[], name: string) => createStringFsstDictionaryVector(v, name);

function ft(n: number, props: Vector[] = [], geoType?: GEOMETRY_TYPE): FeatureTable {
    const t = createTopology(n);
    const vo = new Int32Array(n + 1);
    for (let i = 0; i <= n; i++) vo[i] = i * 2;
    const gv = createConstGeometryVector(n, geoType ?? GEOMETRY_TYPE.POINT, t, vo, new Int32Array(n * 2));
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
        it("$type in compound expression", () => {
            filter(ft(3, [int([1, 2, 3], "v")], GEOMETRY_TYPE.POINT), ["all", [">=", "v", 1], ["==", "$type", "Point"]]);
        });
    });

    // Vector type dispatch for ==
    describe("== dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "filterStringDictionaryByValue");
            filter(ft(3, [strDict(["a", "b", "c"], "s")]), ["==", "s", "a"]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "filterStringFlatByValue");
            filter(ft(3, [strFlat(["a", "b", "c"], "s")]), ["==", "s", "a"]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "filterStringFsstDictionaryByValue");
            filter(ft(3, [strFsst(["a", "b", "c"], "s")]), ["==", "s", "a"]);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "filterByValue");
            filter(ft(3, [int([1, 2, 3], "v")]), ["==", "v", 1]);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for == selected
    describe("== selected dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());
        const flag = int([1, 1, 1], "f");

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "filterStringDictionarySelected");
            filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["==", "s", "a"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "filterStringFlatSelected");
            filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["==", "s", "a"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "filterStringFsstDictionarySelected");
            filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["==", "s", "a"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "filterSelected");
            filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], ["==", "v", 1]]);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for !=
    describe("!= dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "filterStringDictionaryNotEqual");
            filter(ft(3, [strDict(["a", "b", "c"], "s")]), ["!=", "s", "a"]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "filterStringFlatNotEqual");
            filter(ft(3, [strFlat(["a", "b", "c"], "s")]), ["!=", "s", "a"]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "filterStringFsstDictionaryNotEqual");
            filter(ft(3, [strFsst(["a", "b", "c"], "s")]), ["!=", "s", "a"]);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "filterNotEqual");
            filter(ft(3, [int([1, 2, 3], "v")]), ["!=", "v", 1]);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for != selected
    describe("!= selected dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());
        const flag = int([1, 1, 1], "f");

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "filterStringDictionaryNotEqualSelected");
            filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!=", "s", "a"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "filterStringFlatNotEqualSelected");
            filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!=", "s", "a"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "filterStringFsstDictionaryNotEqualSelected");
            filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!=", "s", "a"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "filterNotEqualSelected");
            filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], ["!=", "v", 1]]);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for >=
    describe(">= dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "greaterThanOrEqualToStringDictionary");
            filter(ft(3, [strDict(["a", "b", "c"], "s")]), [">=", "s", "b"]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "greaterThanOrEqualToStringFlat");
            filter(ft(3, [strFlat(["a", "b", "c"], "s")]), [">=", "s", "b"]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "greaterThanOrEqualToStringFsstDictionary");
            filter(ft(3, [strFsst(["a", "b", "c"], "s")]), [">=", "s", "b"]);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "greaterThanOrEqualTo");
            filter(ft(3, [int([1, 2, 3], "v")]), [">=", "v", 2]);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for >= selected
    describe(">= selected dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());
        const flag = int([1, 1, 1], "f");

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "greaterThanOrEqualToStringDictionarySelected");
            filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], [">=", "s", "b"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "greaterThanOrEqualToStringFlatSelected");
            filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], [">=", "s", "b"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "greaterThanOrEqualToStringFsstDictionarySelected");
            filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], [">=", "s", "b"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "greaterThanOrEqualToSelected");
            filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], [">=", "v", 2]]);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for <=
    describe("<= dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "smallerThanOrEqualToStringDictionary");
            filter(ft(3, [strDict(["a", "b", "c"], "s")]), ["<=", "s", "b"]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "smallerThanOrEqualToStringFlat");
            filter(ft(3, [strFlat(["a", "b", "c"], "s")]), ["<=", "s", "b"]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "smallerThanOrEqualToStringFsstDictionary");
            filter(ft(3, [strFsst(["a", "b", "c"], "s")]), ["<=", "s", "b"]);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "smallerThanOrEqualTo");
            filter(ft(3, [int([1, 2, 3], "v")]), ["<=", "v", 2]);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for <= selected
    describe("<= selected dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());
        const flag = int([1, 1, 1], "f");

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "smallerThanOrEqualToStringDictionarySelected");
            filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["<=", "s", "b"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "smallerThanOrEqualToStringFlatSelected");
            filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["<=", "s", "b"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "smallerThanOrEqualToStringFsstDictionarySelected");
            filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["<=", "s", "b"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "smallerThanOrEqualToSelected");
            filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], ["<=", "v", 2]]);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for in
    describe("in dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "matchStringDictionary");
            filter(ft(3, [strDict(["a", "b", "c"], "s")]), ["in", "s", "a", "c"] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "matchStringFlat");
            filter(ft(3, [strFlat(["a", "b", "c"], "s")]), ["in", "s", "a", "c"] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "matchStringFsstDictionary");
            filter(ft(3, [strFsst(["a", "b", "c"], "s")]), ["in", "s", "a", "c"] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "match");
            filter(ft(3, [int([1, 2, 3], "v")]), ["in", "v", 1, 3] as never);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for in selected
    describe("in selected dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());
        const flag = int([1, 1, 1], "f");

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "matchStringDictionarySelected");
            filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["in", "s", "a"]] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "matchStringFlatSelected");
            filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["in", "s", "a"]] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "matchStringFsstDictionarySelected");
            filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["in", "s", "a"]] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "matchSelected");
            filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], ["in", "v", 1]] as never);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for !in
    describe("!in dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "noneMatchStringDictionary");
            filter(ft(3, [strDict(["a", "b", "c"], "s")]), ["!in", "s", "a"] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "noneMatchStringFlat");
            filter(ft(3, [strFlat(["a", "b", "c"], "s")]), ["!in", "s", "a"] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "noneMatchStringFsstDictionary");
            filter(ft(3, [strFsst(["a", "b", "c"], "s")]), ["!in", "s", "a"] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "noneMatch");
            filter(ft(3, [int([1, 2, 3], "v")]), ["!in", "v", 1] as never);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Vector type dispatch for !in selected
    describe("!in selected dispatch", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());
        const flag = int([1, 1, 1], "f");

        it("StringDictionaryVector", () => {
            spy = vi.spyOn(utils, "noneMatchStringDictionarySelected");
            filter(ft(3, [strDict(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!in", "s", "a"]] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFlatVector", () => {
            spy = vi.spyOn(utils, "noneMatchStringFlatSelected");
            filter(ft(3, [strFlat(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!in", "s", "a"]] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("StringFsstDictionaryVector", () => {
            spy = vi.spyOn(utils, "noneMatchStringFsstDictionarySelected");
            filter(ft(3, [strFsst(["a", "b", "c"], "s"), flag]), ["all", ["==", "f", 1], ["!in", "s", "a"]] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("IntVector", () => {
            spy = vi.spyOn(utils, "noneMatchSelected");
            filter(ft(3, [int([1, 2, 3], "v"), flag]), ["all", ["==", "f", 1], ["!in", "v", 1]] as never);
            expect(spy).toHaveBeenCalled();
        });
    });

    // Strict comparison (> and <) - filter.ts specific implementation
    describe("> and <", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());

        it("> uses greaterThanOrEqualTo then excludes exact match", () => {
            spy = vi.spyOn(utils, "greaterThanOrEqualTo");
            const r = filter(ft(3, [int([1, 2, 3], "v")]), [">", "v", 2]);
            expect(spy).toHaveBeenCalled();
            expect(r.limit).toBe(1);
        });

        it("< uses smallerThanOrEqualTo then excludes exact match", () => {
            spy = vi.spyOn(utils, "smallerThanOrEqualTo");
            const r = filter(ft(3, [int([1, 2, 3], "v")]), ["<", "v", 2]);
            expect(spy).toHaveBeenCalled();
            expect(r.limit).toBe(1);
        });

        it("> selected uses greaterThanOrEqualToSelected", () => {
            spy = vi.spyOn(utils, "greaterThanOrEqualToSelected");
            filter(ft(3, [int([1, 2, 3], "v"), int([1, 1, 1], "f")]), ["all", ["==", "f", 1], [">", "v", 1]]);
            expect(spy).toHaveBeenCalled();
        });
        it("< selected uses smallerThanOrEqualToSelected", () => {
            spy = vi.spyOn(utils, "smallerThanOrEqualToSelected");
            filter(ft(3, [int([1, 2, 3], "v"), int([1, 1, 1], "f")]), ["all", ["==", "f", 1], ["<", "v", 3]]);
            expect(spy).toHaveBeenCalled();
        });
    });

    describe("has/!has", () => {
        let spy: MockInstance;
        afterEach(() => spy?.mockRestore());

        it("has uses createNonNullSelectionVector", () => {
            spy = vi.spyOn(utils, "createNonNullSelectionVector");
            filter(ft(3, [strDict(["a", null, "c"], "s")]), ["has", "s"]);
            expect(spy).toHaveBeenCalled();
        });
        it("!has uses nullableValues", () => {
            spy = vi.spyOn(utils, "nullableValues");
            filter(ft(3, [strDict(["a", null, "c"], "s")]), ["!has", "s"] as never);
            expect(spy).toHaveBeenCalled();
        });
        it("has selected uses filterNonNullSelected", () => {
            spy = vi.spyOn(utils, "filterNonNullSelected");
            filter(ft(3, [strDict(["a", null, "c"], "s"), int([1, 1, 1], "f")]), ["all", ["==", "f", 1], ["has", "s"]]);
            expect(spy).toHaveBeenCalled();
        });
        it("!has selected uses filterNullSelected", () => {
            spy = vi.spyOn(utils, "filterNullSelected");
            filter(ft(3, [strDict(["a", null, "c"], "s"), int([1, 1, 1], "f")]), ["all", ["==", "f", 1], ["!has", "s"]] as never);
            expect(spy).toHaveBeenCalled();
        });
    });
});
