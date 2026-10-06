/**
 * Reads a decoded value the way MVT reports it: a `bigint` becomes a JS number, rounded when it is
 * outside the safe-integer range, every other value passes through, and `null` becomes `undefined`.
 */
export function toMvtValue(value: unknown): unknown {
    if (typeof value === "bigint") return Number(value);
    return value ?? undefined;
}
