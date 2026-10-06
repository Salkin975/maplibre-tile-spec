import { describe, expect, it } from "vitest";
import { toMvtValue } from "./mvtValue";

describe("toMvtValue", () => {
    it("passes other values through, converts a bigint and turns null into undefined", () => {
        expect(toMvtValue("motorway")).toBe("motorway");
        expect(toMvtValue(true)).toBe(true);
        expect(toMvtValue(1.5)).toBe(1.5);
        expect(toMvtValue(42n)).toBe(42);
        expect(toMvtValue(null)).toBeUndefined();
    });

    it("rounds a bigint outside the safe range as MVT does", () => {
        expect(toMvtValue(2n ** 53n + 1n)).toBe(2 ** 53);
        expect(toMvtValue(-(2n ** 60n))).toBe(-(2 ** 60));
    });
});
