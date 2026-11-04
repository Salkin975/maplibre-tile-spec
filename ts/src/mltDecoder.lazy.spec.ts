import { describe, expect, it, vi } from "vitest";
import decodeTile from "./mltDecoder";
import { encodeTile, type Feature } from "./encoding/mltEncoder";
import { decodeMapPropertyColumn } from "./decoding/mapPropertyDecoder";
import type * as MapPropertyDecoder from "./decoding/mapPropertyDecoder";

vi.mock("./decoding/mapPropertyDecoder", async (importOriginal) => {
    const actual = await importOriginal<typeof MapPropertyDecoder>();
    return { ...actual, decodeMapPropertyColumn: vi.fn(actual.decodeMapPropertyColumn) };
});

const FEATURES: Feature[] = [
    { id: 7, geometry: { type: "Point", coordinates: [1, 2] }, properties: { tags: { kind: "a", rank: 1 }, n: 10 } },
    { id: 8, geometry: { type: "Point", coordinates: [3, 4] }, properties: { tags: { kind: "b", rank: 2 }, n: 20 } },
];

describe("decodeTile - lazy columns", () => {
    it("decodes a MAP column only on access, and the columns after it at the right offset", () => {
        const tile = encodeTile([{ name: "layer", features: FEATURES }]);
        vi.mocked(decodeMapPropertyColumn).mockClear();
        const table = decodeTile(tile)[0];

        expect(table.getPropertyVector("n")?.getValue(1)).toBe(20);
        expect(decodeMapPropertyColumn).not.toHaveBeenCalled();

        expect(table.getPropertyVector("tags")?.getValue(1)).toEqual({ kind: "b", rank: 2 });
        expect(decodeMapPropertyColumn).toHaveBeenCalledTimes(1);
    });
});
