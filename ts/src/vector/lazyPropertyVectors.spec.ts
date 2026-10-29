import { describe, expect, it } from "vitest";
import { LazyPropertyVectors, type PendingPropertyColumn } from "./lazyPropertyVectors";
import { ScalarType, type Column } from "../metadata/tileset/tilesetMetadata";
import { encodeInt32NoneColumn } from "../encoding/propertyEncoder";
import { concatenateBuffers } from "../encoding/encodingUtils";

function scalarColumn(name: string): Column {
    return {
        name,
        nullable: false,
        type: "scalarType",
        scalarType: { physicalType: ScalarType.INT_32, type: "physicalType" },
    };
}

function pendingColumn(name: string, start: number): PendingPropertyColumn {
    return { name, metadata: scalarColumn(name), numStreams: 1, start, vectors: null };
}

/**
 * `get()`'s cold path - decode one column on demand and cache the result - is never hit by
 * mltDecoder.spec.ts: every existing caller reads `propertyVectors` (forceAll) first, which warms
 * the whole cache before `get()` ever runs. These test it directly against a real encoded column.
 */
describe("LazyPropertyVectors", () => {
    it("decodes a column lazily on first get() and reuses the cached vector on the next call", () => {
        const encoded = encodeInt32NoneColumn(new Int32Array([1, 2, 3]));
        const store = new LazyPropertyVectors(encoded, [pendingColumn("a", 0)], 3);

        const vector = store.get("a");
        expect(vector?.getValue(0)).toBe(1);
        expect(store.get("a")).toBe(vector);
    });

    it("returns undefined for a name no column produces", () => {
        const encoded = encodeInt32NoneColumn(new Int32Array([1, 2, 3]));
        const store = new LazyPropertyVectors(encoded, [pendingColumn("a", 0)], 3);

        expect(store.get("missing")).toBeUndefined();
    });

    it("skips a column already decoded by an earlier get() while searching for another name", () => {
        const a = encodeInt32NoneColumn(new Int32Array([1]));
        const b = encodeInt32NoneColumn(new Int32Array([2]));
        const store = new LazyPropertyVectors(
            concatenateBuffers(a, b),
            [pendingColumn("a", 0), pendingColumn("b", a.length)],
            1,
        );

        store.get("a");
        const vector = store.get("b");

        expect(vector?.getValue(0)).toBe(2);
    });
});
