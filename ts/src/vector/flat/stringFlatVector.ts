import { VariableSizeVector } from "../variableSizeVector";
import BitVector from "./bitVector";
import { decodeString } from "../../decoding/decodingUtils";

const encoder = new TextEncoder();

/**
 * Concatenates pre-encoded UTF-8 values into one contiguous data buffer plus its offsets array.
 * Shared by the string vector factories (flat and dictionary); not re-exported from any barrel.
 */
export function concatEncodedValues(encodedValues: Uint8Array[]): { offsets: Uint32Array; data: Uint8Array } {
    const offsets = new Uint32Array(encodedValues.length + 1);
    let encodedLength = 0;
    for (let i = 0; i < encodedValues.length; i++) {
        encodedLength += encodedValues[i].length;
        offsets[i + 1] = encodedLength;
    }

    const data = new Uint8Array(encodedLength);
    let offset = 0;
    for (const value of encodedValues) {
        data.set(value, offset);
        offset += value.length;
    }
    return { offsets, data };
}

export class StringFlatVector extends VariableSizeVector<Uint8Array, string> {
    constructor(name: string, offsetBuffer: Uint32Array, dataBuffer: Uint8Array, nullabilityBuffer?: BitVector) {
        super(name, offsetBuffer, dataBuffer, nullabilityBuffer ?? offsetBuffer.length - 1);
    }

    protected getValueFromBuffer(index: number): string {
        const start = this.offsetBuffer[index];
        const end = this.offsetBuffer[index + 1];
        return decodeString(this.dataBuffer, start, end);
    }

    get offsets(): Uint32Array {
        return this.offsetBuffer;
    }

    get encodedValues(): Uint8Array {
        return this.dataBuffer;
    }
}

export function createStringFlatVector(values: (string | null)[], name: string): StringFlatVector {
    const nullability = values.some((value) => value === null)
        ? new BitVector(new Uint8Array(Math.ceil(values.length / 8)), values.length)
        : undefined;

    const encodedValues = new Array<Uint8Array>(values.length);
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        encodedValues[i] = encoder.encode(value ?? "");
        if (value !== null) {
            nullability?.set(i, true);
        }
    }

    const { offsets, data } = concatEncodedValues(encodedValues);
    return new StringFlatVector(name, offsets, data, nullability);
}
