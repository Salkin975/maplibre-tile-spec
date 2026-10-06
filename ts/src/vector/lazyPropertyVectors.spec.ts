import { describe, expect, it } from "vitest";
import { LazyPropertyVectors, type LazyPropertyColumn } from "./lazyPropertyVectors";
import { ScalarType, type Column } from "../metadata/tileset/tilesetMetadata";
import { encodeInt32NoneColumn } from "../encoding/propertyEncoder";
import { concatenateBuffers } from "../encoding/encodingUtils";
import {
    createColumnMetadataForStruct,
    encodeSharedDictionary,
    encodeStructField,
} from "../decoding/decodingTestUtils";

function scalarColumn(name: string): Column {
    return {
        name,
        nullable: false,
        type: "scalarType",
        scalarType: { physicalType: ScalarType.INT_32, type: "physicalType" },
    };
}

function lazyColumn(name: string, start: number): LazyPropertyColumn {
    return { name, metadata: scalarColumn(name), numStreams: 1, start, vectors: null };
}

/**
 * `get()`'s cold path - decode one column on demand and cache the result - is never hit by
 * mltDecoder.spec.ts: every existing caller reads `propertyVectors` (decodeAll) first, which warms
 * the whole cache before `get()` ever runs. These test it directly against a real encoded column.
 */
describe("LazyPropertyVectors", () => {
    it("decodes a column lazily on first get() and reuses the cached vector on the next call", () => {
        const encoded = encodeInt32NoneColumn(new Int32Array([1, 2, 3]));
        const store = new LazyPropertyVectors(encoded, [lazyColumn("a", 0)], 3);

        const vector = store.get("a");
        expect(vector?.getValue(0)).toBe(1);
        expect(store.get("a")).toBe(vector);
    });

    it("returns undefined for a name no column produces", () => {
        const encoded = encodeInt32NoneColumn(new Int32Array([1, 2, 3]));
        const store = new LazyPropertyVectors(encoded, [lazyColumn("a", 0)], 3);

        expect(store.get("missing")).toBeUndefined();
    });

    it("skips a column already decoded by an earlier get() while searching for another name", () => {
        const encodedColumnA = encodeInt32NoneColumn(new Int32Array([1]));
        const encodedColumnB = encodeInt32NoneColumn(new Int32Array([2]));
        const store = new LazyPropertyVectors(
            concatenateBuffers(encodedColumnA, encodedColumnB),
            [lazyColumn("a", 0), lazyColumn("b", encodedColumnA.length)],
            1,
        );

        store.get("a");
        const vector = store.get("b");

        expect(vector?.getValue(0)).toBe(2);
    });

    it("tries an anonymous struct (no name of its own) for a bare sibling field like `class`", () => {
        // The MLT encoder groups unrelated sibling scalar fields into a struct with no name of its
        // own, unlike a namespaced struct (`name:en`) whose parent keeps a real name to prefix-match.
        // Without the `columnName === ""` fallback, "class" never starts with the empty column's
        // ":"/"." prefix and the struct is never decoded.
        const { lengthStream, dataStream } = encodeSharedDictionary(["motorway", "trunk"]);
        const classField = encodeStructField([0, 1], [true, true]);
        const subclassField = encodeStructField([1, 0], [true, true]);
        const encoded = concatenateBuffers(lengthStream, dataStream, classField, subclassField);
        const column: LazyPropertyColumn = {
            name: "",
            metadata: createColumnMetadataForStruct("", [{ name: "class" }, { name: "subclass" }]),
            numStreams: 1,
            start: 0,
            vectors: null,
        };
        const store = new LazyPropertyVectors(encoded, [column], 2);

        expect(store.get("class")?.getValue(0)).toBe("motorway");
        expect(store.get("subclass")?.getValue(0)).toBe("trunk");
    });
});
