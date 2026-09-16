import { VariableSizeVector } from "../variableSizeVector";
import BitVector from "../flat/bitVector";
import { decodeString } from "../../decoding/decodingUtils";
import { concatEncodedValues } from "../flat/stringFlatVector";

const encoder = new TextEncoder();

export class StringDictionaryVector extends VariableSizeVector<Uint8Array, string> {
    /** One decoded string per dictionary code, filled in lazily — many rows share a code, so
     * decoding on every row access (as opposed to once per code) redundantly re-decodes the same
     * bytes. */
    private decodedValues?: Array<string | undefined>;

    constructor(
        name: string,
        private readonly indexBuffer: Uint32Array,
        offsetBuffer: Uint32Array,
        dictionaryBuffer: Uint8Array,
        nullabilityBuffer?: BitVector,
    ) {
        super(name, offsetBuffer, dictionaryBuffer, nullabilityBuffer ?? indexBuffer.length);
        this.indexBuffer = indexBuffer;
    }

    protected getValueFromBuffer(index: number): string {
        const offset = this.indexBuffer[index];
        return this.getDictionaryValue(offset);
    }

    get indices(): Uint32Array {
        return this.indexBuffer;
    }

    get dictionaryOffsets(): Uint32Array {
        return this.offsetBuffer;
    }

    getDictionaryValue(index: number): string {
        this.decodedValues ??= new Array(this.offsetBuffer.length - 1);
        let value = this.decodedValues[index];
        if (value === undefined) {
            value = decodeString(this.dataBuffer, this.offsetBuffer[index], this.offsetBuffer[index + 1]);
            this.decodedValues[index] = value;
        }
        return value;
    }

    getDictionaryBytes(): Uint8Array {
        return this.dataBuffer;
    }

}

export function createStringDictionaryVector(values: (string | null)[], name: string): StringDictionaryVector {
    const dictionary = new Map<string, number>();
    const encodedValues: Uint8Array[] = [];
    const indices = new Uint32Array(values.length);
    const nullability = values.some((value) => value === null)
        ? new BitVector(new Uint8Array(Math.ceil(values.length / 8)), values.length)
        : undefined;

    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value === null) {
            continue;
        }
        let dictionaryIndex = dictionary.get(value);
        if (dictionaryIndex === undefined) {
            dictionaryIndex = dictionary.size;
            dictionary.set(value, dictionaryIndex);
            encodedValues.push(encoder.encode(value));
        }
        indices[i] = dictionaryIndex;
        nullability?.set(i, true);
    }

    const { offsets, data } = concatEncodedValues(encodedValues);
    return new StringDictionaryVector(name, indices, offsets, data, nullability);
}
