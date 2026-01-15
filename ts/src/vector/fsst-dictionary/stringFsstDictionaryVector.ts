import { VariableSizeVector } from "../variableSizeVector";
import BitVector from "../flat/bitVector";
import { decodeFsst } from "../../decoding/fsstDecoder";
import { decodeString } from "../../decoding/decodingUtils";

export class StringFsstDictionaryVector extends VariableSizeVector<Uint8Array, string> {
    private readonly textEncoder: TextEncoder;

    // TODO: extend from StringVector
    private symbolLengthBuffer: Uint32Array;
    private lengthBuffer: Uint32Array;
    private decodedDictionary: Uint8Array;

    constructor(
        name: string,
        private readonly indexBuffer: Int32Array,
        offsetBuffer: Uint32Array,
        dictionaryBuffer: Uint8Array,
        private readonly symbolOffsetBuffer: Uint32Array,
        private readonly symbolTableBuffer: Uint8Array,
        nullabilityBuffer: BitVector,
    ) {
        super(name, offsetBuffer, dictionaryBuffer, nullabilityBuffer);
        this.textEncoder = new TextEncoder();
    }

    protected getValueFromBuffer(index: number): string {
        //if (this.decodedValues == null) {
        /*if (this.decodedDictionary == null) {
            if (this.symbolLengthBuffer == null) {
                // TODO: change FsstEncoder to take offsets instead of length to get rid of this conversion
                this.symbolLengthBuffer = this.offsetToLengthBuffer(this.symbolOffsetBuffer);
                this.lengthBuffer = this.offsetToLengthBuffer(this.offsetBuffer);
            }

            const dictionaryBuffer = decodeFsst(this.symbolTableBuffer, this.symbolLengthBuffer,
                this.dataBuffer);

            this.decodedDictionary = new Array<string>(this.lengthBuffer.length);
            let i = 0;
            let strStart = 0;
            for (const strLength of this.lengthBuffer) {
                this.decodedDictionary[i++] = decodeString(dictionaryBuffer, strStart, strStart + strLength);
                strStart += strLength;
            }

            /!*this.decodedValues = new Array(this.indexBuffer.length);
            i = 0;
            for (const index of this.indexBuffer) {
                const value = decodedDictionary[index];
                this.decodedValues[i++] = value;
            }*!/
        }*/
        /*this.decodedValues = new Array(this.indexBuffer.length);
            i = 0;
            for (const index of this.indexBuffer) {
                const value = decodedDictionary[index];
                this.decodedValues[i++] = value;
            }*/

        if (this.decodedDictionary == null) {
            if (this.symbolLengthBuffer == null) {
                // TODO: change FsstEncoder to take offsets instead of length to get rid of this conversion
                this.symbolLengthBuffer = this.offsetToLengthBuffer(this.symbolOffsetBuffer);
                this.lengthBuffer = this.offsetToLengthBuffer(this.offsetBuffer);
            }

            this.decodedDictionary = decodeFsst(this.symbolTableBuffer, this.symbolLengthBuffer, this.dataBuffer);
        }

        const offset = this.indexBuffer[index];
        const start = this.offsetBuffer[offset];
        const end = this.offsetBuffer[offset + 1];
        return decodeString(this.decodedDictionary, start, end);
    }

    // TODO: get rid of that conversion
    private offsetToLengthBuffer(offsetBuffer: Uint32Array): Uint32Array {
        const lengthBuffer = new Uint32Array(offsetBuffer.length - 1);
        let previousOffset = offsetBuffer[0];
        for (let i = 1; i < offsetBuffer.length; i++) {
            const offset = offsetBuffer[i];
            lengthBuffer[i - 1] = offset - previousOffset;
            previousOffset = offset;
        }

        return lengthBuffer;
    }

    get decoded() {
        return this.decodedDictionary;
    }

    get index() {
        return this.indexBuffer;
    }
}

export function createStringFsstDictionaryVector(values: (string | null)[], name: string): StringFsstDictionaryVector {
    const encoder = new TextEncoder();
    const nonNullValues = values.filter((v): v is string => v !== null);
    const uniqueValues = Array.from(new Set(nonNullValues));
    const encodedDict = uniqueValues.map(v => encoder.encode(v));

    // Create FSST-compressed dictionary
    const compressedSize = encodedDict.reduce((sum, v) => sum + v.length * 2, 0);
    const dictionaryBuffer = new Uint8Array(compressedSize);
    const offsetBuffer = new Int32Array(uniqueValues.length + 1);
    let compressedOffset = 0;
    let decompressedOffset = 0;
    offsetBuffer[0] = 0;

    for (let i = 0; i < encodedDict.length; i++) {
        const encoded = encodedDict[i];
        for (let j = 0; j < encoded.length; j++) {
            dictionaryBuffer[compressedOffset++] = 255; // Escape code
            dictionaryBuffer[compressedOffset++] = encoded[j];
        }
        decompressedOffset += encoded.length;
        offsetBuffer[i + 1] = decompressedOffset;
    }

    // Create index and nullability buffers
    const indexBuffer = new Int32Array(values.length);
    const nullabilityBytes = new Uint8Array(Math.ceil(values.length / 8));

    for (let i = 0; i < values.length; i++) {
        if (values[i] !== null) {
            indexBuffer[i] = uniqueValues.indexOf(values[i]);
            const byteIndex = Math.floor(i / 8);
            const bitIndex = i % 8;
            nullabilityBytes[byteIndex] |= (1 << bitIndex);
        } else {
            indexBuffer[i] = 0;
        }
    }

    const symbolOffsetBuffer = new Int32Array([0, 0]);
    const symbolTableBuffer = new Uint8Array(0);
    const bitVector = new BitVector(nullabilityBytes, values.length);

    return new StringFsstDictionaryVector(
        name,
        indexBuffer,
        offsetBuffer,
        dictionaryBuffer,
        symbolOffsetBuffer,
        symbolTableBuffer,
        bitVector
    );
}
