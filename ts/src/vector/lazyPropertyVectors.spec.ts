import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeSharedDictionaryChild, readSharedDictionary } from "../decoding/stringDecoder";
import type * as StringDecoder from "../decoding/stringDecoder";
import { decodePropertyColumn } from "../decoding/propertyDecoder";
import type * as PropertyDecoder from "../decoding/propertyDecoder";
import { LazyPropertyVectors, type LazyPropertyColumn } from "./lazyPropertyVectors";
import { ScalarType, type Column } from "../metadata/tileset/tilesetMetadata";
import { encodeInt32NoneColumn } from "../encoding/propertyEncoder";
import { concatenateBuffers } from "../encoding/encodingUtils";
import {
    createColumnMetadataForStruct,
    encodeSharedDictionary,
    encodeStructField,
} from "../decoding/decodingTestUtils";

vi.mock("../decoding/stringDecoder", async (importOriginal) => {
    const actual = await importOriginal<typeof StringDecoder>();
    return {
        ...actual,
        readSharedDictionary: vi.fn(actual.readSharedDictionary),
        decodeSharedDictionaryChild: vi.fn(actual.decodeSharedDictionaryChild),
    };
});

vi.mock("../decoding/propertyDecoder", async (importOriginal) => {
    const actual = await importOriginal<typeof PropertyDecoder>();
    return { ...actual, decodePropertyColumn: vi.fn(actual.decodePropertyColumn) };
});

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

/** Tests the cold path of `get()`, which mltDecoder.spec.ts never hits since it decodes all columns first. */
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
        // The encoder groups sibling fields into an unnamed struct, only the `columnName === ""` fallback finds it.
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

    it.each([
        ["name:", "de", "name:de"],
        ["name", "_en", "name_en"],
    ])("finds the child %s + %s of a struct by its full name %s", (structName, childName, fullName) => {
        // Encoders join column and child name with any delimiter, or none at all.
        const { lengthStream, dataStream } = encodeSharedDictionary(["Berlin"]);
        const encoded = concatenateBuffers(lengthStream, dataStream, encodeStructField([0], [true]));
        const column: LazyPropertyColumn = {
            name: structName,
            metadata: createColumnMetadataForStruct(structName, [{ name: childName }]),
            numStreams: 1,
            start: 0,
            vectors: null,
        };
        const store = new LazyPropertyVectors(encoded, [column], 1);

        expect(store.get(fullName)?.getValue(0)).toBe("Berlin");
    });

    it("returns the last column with a repeated name, like a Map built from all columns", () => {
        const a = encodeInt32NoneColumn(new Int32Array([1]));
        const b = encodeInt32NoneColumn(new Int32Array([2]));
        const store = new LazyPropertyVectors(
            concatenateBuffers(a, b),
            [lazyColumn("x", 0), lazyColumn("x", a.length)],
            1,
        );

        expect(store.get("x")?.getValue(0)).toBe(2);
    });

    it("returns the last column with a repeated name even if an earlier one was decoded first", () => {
        // The struct also holds `y`, so get("y") decodes it, and its `x` child, before get("x").
        const { lengthStream, dataStream } = encodeSharedDictionary(["struct"]);
        const encodedStruct = concatenateBuffers(
            lengthStream,
            dataStream,
            encodeStructField([0], [true]),
            encodeStructField([0], [true]),
        );
        const encodedScalar = encodeInt32NoneColumn(new Int32Array([2]));
        const structColumn: LazyPropertyColumn = {
            name: "",
            metadata: createColumnMetadataForStruct("", [{ name: "x" }, { name: "y" }]),
            numStreams: 1,
            start: 0,
            vectors: null,
        };
        const store = new LazyPropertyVectors(
            concatenateBuffers(encodedStruct, encodedScalar),
            [structColumn, lazyColumn("x", encodedStruct.length)],
            1,
        );

        expect(store.get("y")?.getValue(0)).toBe("struct");
        expect(store.get("x")?.getValue(0)).toBe(2);
    });
});

describe("LazyPropertyVectors - struct children", () => {
    /** A scalar `rank`, then an unnamed struct with `name` and `class`, as the encoder groups them. */
    function structAndScalarStore(): LazyPropertyVectors {
        const { lengthStream, dataStream } = encodeSharedDictionary(["Berlin", "city"]);
        const encodedStruct = concatenateBuffers(
            lengthStream,
            dataStream,
            encodeStructField([0], [true]),
            encodeStructField([1], [true]),
        );
        const encodedRank = encodeInt32NoneColumn(new Int32Array([5]));
        const structColumn: LazyPropertyColumn = {
            name: "",
            metadata: createColumnMetadataForStruct("", [{ name: "name" }, { name: "class" }]),
            numStreams: 1,
            start: 0,
            vectors: null,
        };
        // The struct comes last, so a lookup walking the columns backwards meets it first
        return new LazyPropertyVectors(
            concatenateBuffers(encodedRank, encodedStruct),
            [lazyColumn("rank", 0), { ...structColumn, start: encodedRank.length }],
            1,
        );
    }

    beforeEach(() => {
        vi.mocked(readSharedDictionary).mockClear();
        vi.mocked(decodeSharedDictionaryChild).mockClear();
        vi.mocked(decodePropertyColumn).mockClear();
    });

    it("reads a scalar column without touching an unnamed struct", () => {
        const store = structAndScalarStore();

        expect(store.get("rank")?.getValue(0)).toBe(5);
        expect(decodePropertyColumn).toHaveBeenCalledTimes(1);
        expect(readSharedDictionary).not.toHaveBeenCalled();
    });

    it("decodes only the requested struct child", () => {
        const store = structAndScalarStore();

        expect(store.get("class")?.getValue(0)).toBe("city");
        expect(decodeSharedDictionaryChild).toHaveBeenCalledTimes(1);

        expect(store.get("name")?.getValue(0)).toBe("Berlin");
        expect(readSharedDictionary).toHaveBeenCalledTimes(1);
        expect(decodeSharedDictionaryChild).toHaveBeenCalledTimes(2);
    });

    it("decodes nothing for a name no column or child produces", () => {
        const store = structAndScalarStore();

        expect(store.get("name:fr")).toBeUndefined();
        expect(decodePropertyColumn).not.toHaveBeenCalled();
        expect(readSharedDictionary).not.toHaveBeenCalled();
    });

    it("returns the same child vectors from get() and decodeAll(), decoding each child once", () => {
        const store = structAndScalarStore();
        const classVector = store.get("class");

        const allVectors = store.decodeAll();
        expect(allVectors.map((vector) => vector.name)).toEqual(["rank", "name", "class"]);
        expect(allVectors[2]).toBe(classVector);
        expect(decodeSharedDictionaryChild).toHaveBeenCalledTimes(2);
    });
});
