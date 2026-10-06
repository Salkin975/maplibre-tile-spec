import { describe, it, expect } from "vitest";
import FeatureTable from "./featureTable";
import type Vector from "./vector";
import { encodePointGeometryVector } from "../encoding/constGeometryVectorEncoder";

const geometryVector = encodePointGeometryVector(1, 2);
const propertyVector = (name: string): Vector => ({ name }) as unknown as Vector;

describe("FeatureTable", () => {
    it("throws when constructed without a layer name", () => {
        expect(() => new FeatureTable("", geometryVector)).toThrow("Missing layer name");
    });

    it("returns an empty array when no property vectors are provided", () => {
        const table = new FeatureTable("layer", geometryVector);
        expect(table.propertyVectors).toEqual([]);
    });

    it("looks up property vectors by name and returns undefined for unknown names", () => {
        const a = propertyVector("a");
        const b = propertyVector("b");
        const table = new FeatureTable("layer", geometryVector, undefined, [a, b]);

        expect(table.getPropertyVector("a")).toBe(a);
        expect(table.getPropertyVector("b")).toBe(b);
        expect(table.getPropertyVector("missing")).toBeUndefined();
    });

    it("lists every property column name once, even when a name repeats", () => {
        const table = new FeatureTable("layer", geometryVector, undefined, [
            propertyVector("class"),
            propertyVector("name"),
            propertyVector("class"),
        ]);

        expect(table.getPropertyNames()).toEqual(["class", "name"]);
    });
});
