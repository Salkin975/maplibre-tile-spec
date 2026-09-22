import { VariableSizeVector } from "../variableSizeVector";
import type BitVector from "../flat/bitVector";
import { decodeString } from "../../decoding/decodingUtils";

export class StringDictionaryVector extends VariableSizeVector<Uint8Array, string> {
    /** Decoded strings per dictionary code, filled lazily. */
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
