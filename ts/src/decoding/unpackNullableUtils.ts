import BitVector from "../vector/flat/bitVector.js";

/**
 * Type constraint for TypedArray types that can be unpacked
 */
export type TypedArrayConstructor =
    | Int32ArrayConstructor
    | Uint32ArrayConstructor
    | BigInt64ArrayConstructor
    | BigUint64ArrayConstructor
    | Float32ArrayConstructor
    | Float64ArrayConstructor;

export type TypedArrayInstance =
    | Int32Array
    | Uint32Array
    | BigInt64Array
    | BigUint64Array
    | Float32Array
    | Float64Array;

/**
 * Generic unpacking function.
 * Reconstructs the full array by inserting default values at null positions.
 *
 * @param dataStream The compact data stream containing only non-null values
 * @param presentBits BitVector indicating which positions have values (null if non-nullable)
 * @param defaultValue The default value to insert at null positions (0, 0n, etc.)
 * @returns Full array with default values at null positions
 */
export function unpackNullable<T extends TypedArrayInstance>(
    dataStream: T,
    presentBits: BitVector | null,
    defaultValue: number | bigint,
): T {
    // Non-nullable case: return data stream as-is
    if (!presentBits) {
        return dataStream;
    }

    const size = presentBits.size();
    // Create new array of same type with full size, null positions keep the default
    const constructor = dataStream.constructor as TypedArrayConstructor;
    const result = new constructor(size) as T;
    if (defaultValue) result.fill(defaultValue as never);

    // A byte of present bits covers 8 positions, a zero byte has no value to copy
    const bits = presentBits.getBuffer();
    let counter = 0;
    for (let start = 0; start < size; start += 8) {
        const byte = bits[start >> 3];
        if (byte === 0) continue;
        const end = Math.min(start + 8, size);
        for (let i = start; i < end; i++) {
            if ((byte >> (i - start)) & 1) result[i] = dataStream[counter++];
        }
    }

    return result;
}

/**
 * Special case for boolean columns because BitVector is not directly compatible with TypedArray.
 *
 * @param dataStream The compact BitVector data containing only non-null boolean values
 * @param dataStreamSize The number of actual values in dataStream
 * @param presentBits BitVector indicating which positions have values (null if non-nullable)
 * @returns Uint8Array buffer for BitVector with false at null positions
 */
export function unpackNullableBoolean(
    dataStream: Uint8Array,
    dataStreamSize: number,
    presentBits: BitVector | null,
): Uint8Array {
    // Non-nullable case
    if (!presentBits) {
        return dataStream;
    }

    const numFeatures = presentBits.size();
    const bitVector = new BitVector(dataStream, dataStreamSize);
    const result = new BitVector(new Uint8Array(Math.ceil(numFeatures / 8)), numFeatures);

    let counter = 0;
    for (let i = 0; i < numFeatures; i++) {
        // If position has a value, take from data stream; otherwise use false
        const value = presentBits.get(i) ? bitVector.get(counter++) : false;
        result.set(i, value);
    }

    return result.getBuffer();
}
