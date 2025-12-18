import { VariableSizeVector } from "../variableSizeVector";
import BitVector from "../flat/bitVector";
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

export function createStringDictionaryVector(values: (string | null)[]): StringDictionaryVector {
    const encoder = new TextEncoder();

    // Build unique dictionary
    const nonNullValues = values.filter((v): v is string => v !== null);
    const uniqueValues = Array.from(new Set(nonNullValues));
    const encodedDict = uniqueValues.map(v => encoder.encode(v));

    // Create dictionary buffers
    const dictSize = encodedDict.reduce((sum, v) => sum + v.length, 0);
    const offsetBuffer = new Int32Array(uniqueValues.length + 1);
    const dataBuffer = new Uint8Array(dictSize);

    let currentOffset = 0;
    offsetBuffer[0] = 0;
    for (let i = 0; i < encodedDict.length; i++) {
        dataBuffer.set(encodedDict[i], currentOffset);
        currentOffset += encodedDict[i].length;
        offsetBuffer[i + 1] = currentOffset;
    }

    // Create index and nullability buffers
    const indexBuffer = new Int32Array(values.length);
    const hasNulls = values.some(v => v === null);
    const nullabilityBytes = hasNulls ? new Uint8Array(Math.ceil(values.length / 8)) : undefined;

    for (let i = 0; i < values.length; i++) {
        if (values[i] !== null) {
            indexBuffer[i] = uniqueValues.indexOf(values[i]);
            if (nullabilityBytes) {
                nullabilityBytes[Math.floor(i / 8)] |= 1 << (i % 8);
            }
        }
        // else indexBuffer[i] remains 0 (default)
    }

    const bitVector = nullabilityBytes ? new BitVector(nullabilityBytes, values.length) : undefined;

    return new StringDictionaryVector("test", indexBuffer, offsetBuffer, dataBuffer, bitVector);
}

