import Point from "@mapbox/point-geometry";
import { describe, expect, it } from "vitest";
import { createConstGeometryVector } from "./constGeometryVector";
import { createFlatGeometryVector } from "./flatGeometryVector";
import { GEOMETRY_TYPE, SINGLE_PART_GEOMETRY_TYPE } from "./geometryType";
import { ConstSelectionVector } from "../filter/constSelectionVector";

describe("GeometryVector.filter", () => {
    it("resolves in O(1) for const vectors: full selection when the type matches", () => {
        const vector = createConstGeometryVector(5, GEOMETRY_TYPE.POLYGON, {}, undefined, new Int32Array(0));
        const selection = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON);
        expect(selection).toBeInstanceOf(ConstSelectionVector);
        expect(selection.limit).toBe(5);
    });

    it("resolves in O(1) for const vectors: empty selection when the type doesn't match", () => {
        const vector = createConstGeometryVector(5, GEOMETRY_TYPE.POLYGON, {}, undefined, new Int32Array(0));
        const selection = vector.filter(SINGLE_PART_GEOMETRY_TYPE.LINESTRING);
        expect(selection).toBeInstanceOf(ConstSelectionVector);
        expect(selection.limit).toBe(0);
    });

    it("matches multi-part types against their single-part filter", () => {
        const vector = createConstGeometryVector(3, GEOMETRY_TYPE.MULTIPOLYGON, {}, undefined, new Int32Array(0));
        expect(vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON).limit).toBe(3);
    });

    it("handles an empty const vector", () => {
        const vector = createConstGeometryVector(0, GEOMETRY_TYPE.POLYGON, {}, undefined, new Int32Array(0));
        expect(vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON).limit).toBe(0);
    });

    it("scans mixed-type flat vectors and returns matching indices", () => {
        const vector = createFlatGeometryVector(
            new Uint32Array([
                GEOMETRY_TYPE.POINT,
                GEOMETRY_TYPE.POLYGON,
                GEOMETRY_TYPE.MULTIPOLYGON,
                GEOMETRY_TYPE.LINESTRING,
            ]),
            {},
            undefined,
            new Int32Array(0),
        );
        const selection = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON);
        expect(Array.from(selection.selectionValues())).toEqual([1, 2]);
    });

    it("collapses to a full selection when every flat entry matches", () => {
        const vector = createFlatGeometryVector(
            new Uint32Array([GEOMETRY_TYPE.POINT, GEOMETRY_TYPE.MULTIPOINT]),
            {},
            undefined,
            new Int32Array(0),
        );
        const selection = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POINT);
        expect(selection).toBeInstanceOf(ConstSelectionVector);
        expect(selection.limit).toBe(2);
    });

    it("collapses to an empty selection when no flat entry matches", () => {
        const vector = createFlatGeometryVector(
            new Uint32Array([GEOMETRY_TYPE.LINESTRING]),
            {},
            undefined,
            new Int32Array(0),
        );
        const selection = vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON);
        expect(selection).toBeInstanceOf(ConstSelectionVector);
        expect(selection.limit).toBe(0);
    });

    it("handles an empty flat vector", () => {
        const vector = createFlatGeometryVector(new Uint32Array([]), {}, undefined, new Int32Array(0));
        expect(vector.filter(SINGLE_PART_GEOMETRY_TYPE.POLYGON).limit).toBe(0);
    });
});

describe("GeometryVector.getGeometry", () => {
    it("decodes only the requested line string", () => {
        const vector = createConstGeometryVector(
            3,
            GEOMETRY_TYPE.LINESTRING,
            { partOffsets: new Uint32Array([0, 2, 5, 7]) },
            undefined,
            new Int32Array([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]),
        );

        expect(vector.getGeometry(1)).toEqual([[new Point(2, 2), new Point(3, 3), new Point(4, 4)]]);
    });
});
