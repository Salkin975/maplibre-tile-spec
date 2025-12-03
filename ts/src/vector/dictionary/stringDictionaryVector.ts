import { VariableSizeVector } from "../variableSizeVector";
import type BitVector from "../flat/bitVector";
import { decodeString } from "../../decoding/decodingUtils";

export class StringDictionaryVector extends VariableSizeVector<Uint8Array, string> {
    private readonly textEncoder: TextEncoder;
    private readonly sortedIndices?: Uint32Array;

    constructor(
        name: string,
        private readonly indexBuffer: Int32Array,
        offsetBuffer: Int32Array,
        dictionaryBuffer: Uint8Array,
        nullabilityBuffer?: BitVector,
        sortedIndices?: Uint32Array
    ) {
        super(name, offsetBuffer, dictionaryBuffer, nullabilityBuffer ?? indexBuffer.length);
        this.indexBuffer = indexBuffer;
        this.sortedIndices = sortedIndices;
        this.textEncoder = new TextEncoder();
    }

    protected getValueFromBuffer(index: number): string {
        const offset = this.indexBuffer[index];
        const start = this.offsetBuffer[offset];
        const end = this.offsetBuffer[offset + 1];
        return decodeString(this.dataBuffer, start, end);
    }

    get index(){
        return this.indexBuffer;
    }

    get isSorted (): boolean {
        return this.sortedIndices !== undefined;
    }

    get sorted(){
        return this.sortedIndices;
    }
}
