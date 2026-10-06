import { describe, expect, it, vi } from "vitest";
import FeatureTable from "./featureTable";
import { createRowView } from "./rowView";
import { StringFlatVector } from "./flat/stringFlatVector";
import { Int64FlatVector } from "./flat/int64FlatVector";
import BitVector from "./flat/bitVector";
import { encodePointGeometryVector } from "../encoding/constGeometryVectorEncoder";

/**
 * Two roads: the first is a `motorway` with a population of 5, the second has no `class` and a
 * population that does not fit a JS number.
 */
function createRoadTable(): FeatureTable {
    const classBytes = new TextEncoder().encode("motorway");
    const classNullability = new BitVector(new Uint8Array(1), 2);
    classNullability.set(0, true);
    const classVector = new StringFlatVector(
        "class",
        new Uint32Array([0, classBytes.length, classBytes.length]),
        classBytes,
        classNullability,
    );
    const populationVector = new Int64FlatVector("population", BigInt64Array.from([5n, 2n ** 60n]), 2);

    return new FeatureTable(
        "roads",
        encodePointGeometryVector(1, 2),
        undefined,
        [classVector, populationVector],
        4096,
        2,
    );
}

describe("createRowView", () => {
    it("reads a property from its own column without listing the others", () => {
        const featureTable = createRoadTable();
        const getPropertyVector = vi.spyOn(featureTable, "getPropertyVector");
        const getPropertyNames = vi.spyOn(featureTable, "getPropertyNames");

        const rowView = createRowView(featureTable, 0);

        expect(rowView.class).toBe("motorway");
        expect(getPropertyVector).toHaveBeenCalledExactlyOnceWith("class");
        expect(getPropertyNames).not.toHaveBeenCalled();
    });

    it("enumerates every present property, narrowing a safe 64-bit value", () => {
        const rowView = createRowView(createRoadTable(), 0);

        expect(Object.keys(rowView)).toEqual(["class", "population"]);
        expect({ ...rowView }).toEqual({ class: "motorway", population: 5 });
    });

    it("treats a null value as absent for reads, `in` and enumeration", () => {
        const rowView = createRowView(createRoadTable(), 1);

        expect(rowView.class).toBeUndefined();
        expect("class" in rowView).toBe(false);
        expect(Object.keys(rowView)).not.toContain("class");
    });

    it("drops a 64-bit value outside the safe range and reports its column", () => {
        const onUnsafeValue = vi.fn();

        const rowView = createRowView(createRoadTable(), 1, { onUnsafeValue });

        expect(rowView.population).toBeUndefined();
        expect(onUnsafeValue).toHaveBeenCalledExactlyOnceWith("population");
    });

    it("returns undefined for a column the table does not have", () => {
        const rowView = createRowView(createRoadTable(), 0);

        expect(rowView.name).toBeUndefined();
        expect("name" in rowView).toBe(false);
    });
});
