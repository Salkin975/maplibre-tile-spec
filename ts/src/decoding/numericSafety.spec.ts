import { describe, expect, it, vi } from "vitest";
import { readSafeValue, toSafeMltNumber } from "./numericSafety";

describe("toSafeMltNumber", () => {
    it("passes numbers through and narrows a bigint at either end of the safe range", () => {
        expect(toSafeMltNumber(1.5)).toBe(1.5);
        expect(toSafeMltNumber(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
        expect(toSafeMltNumber(BigInt(Number.MIN_SAFE_INTEGER))).toBe(Number.MIN_SAFE_INTEGER);
    });

    it("returns undefined for a bigint one past either end of the safe range", () => {
        expect(toSafeMltNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBeUndefined();
        expect(toSafeMltNumber(BigInt(Number.MIN_SAFE_INTEGER) - 1n)).toBeUndefined();
    });
});

describe("readSafeValue", () => {
    it("passes other values through, narrows a safe bigint and turns null into undefined", () => {
        const onUnsafeValue = vi.fn();

        expect(readSafeValue("motorway", onUnsafeValue)).toBe("motorway");
        expect(readSafeValue(true, onUnsafeValue)).toBe(true);
        expect(readSafeValue(42n, onUnsafeValue)).toBe(42);
        expect(readSafeValue(null, onUnsafeValue)).toBeUndefined();
        expect(onUnsafeValue).not.toHaveBeenCalled();
    });

    it("drops a bigint outside the safe range and reports it", () => {
        const onUnsafeValue = vi.fn();

        expect(readSafeValue(2n ** 60n, onUnsafeValue)).toBeUndefined();
        expect(onUnsafeValue).toHaveBeenCalledTimes(1);
    });

    it("drops a bigint outside the safe range without a callback", () => {
        expect(readSafeValue(2n ** 60n)).toBeUndefined();
    });
});
