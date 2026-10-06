/** The largest integer a JS number holds exactly, as a bigint for comparing against 64-bit values. */
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

/** The smallest integer a JS number holds exactly, as a bigint for comparing against 64-bit values. */
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Narrows a 64-bit MLT integer to a JS number, or returns `undefined` when it does not fit.
 */
export function toSafeMltNumber(value: number | bigint): number | undefined {
    if (typeof value === "number") return value;
    if (value > MAX_SAFE_BIGINT || value < MIN_SAFE_BIGINT) return undefined;
    return Number(value);
}

/**
 * Reads a decoded value for a caller that expects JS numbers: a `bigint` is narrowed through
 * {@link toSafeMltNumber}, every other value passes through, and `null` becomes `undefined`.
 */
export function readSafeValue(value: unknown, onUnsafeValue?: () => void): unknown {
    if (typeof value !== "bigint") return value ?? undefined;

    const safeValue = toSafeMltNumber(value);
    if (safeValue === undefined) onUnsafeValue?.();
    return safeValue;
}
