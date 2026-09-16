import { VariableSizeVector } from "../variableSizeVector";
import BitVector from "../flat/bitVector";
import { decodeFsst } from "../../decoding/fsstDecoder";
import { decodeString } from "../../decoding/decodingUtils";

/** Mutable cache shared by the FSST child columns of one SharedDict. */
export type FsstDictionaryCache = {
    /** Undefined until one member of the SharedDict group decodes the dictionary on first access. */
    decodedDictionary?: Uint8Array;
};

export class StringFsstDictionaryVector extends VariableSizeVector<Uint8Array, string> {
    private symbolLengthBuffer?: Uint32Array;
    private decodedDictionary?: Uint8Array;
    /** One decoded string per dictionary code, filled in lazily — many rows share a code, so
     * decoding on every row access (as opposed to once per code) redundantly re-decodes the same
     * bytes. */
    private decodedValues?: Array<string | undefined>;

    constructor(
        name: string,
        private readonly indexBuffer: Uint32Array,
        offsetBuffer: Uint32Array,
        dictionaryBuffer: Uint8Array,
        private readonly symbolOffsetBuffer: Uint32Array,
        private readonly symbolTableBuffer: Uint8Array,
        nullabilityBuffer?: BitVector,
        /** Cache shared by the FSST child columns of one SharedDict. */
        private readonly sharedDictionaryCache?: FsstDictionaryCache,
    ) {
        super(name, offsetBuffer, dictionaryBuffer, nullabilityBuffer ?? indexBuffer.length);
    }

    protected getValueFromBuffer(index: number): string {
        return this.getDictionaryValue(this.indexBuffer[index]);
    }

    get indices(): Uint32Array {
        return this.indexBuffer;
    }

    get dictionaryOffsets(): Uint32Array {
        return this.offsetBuffer;
    }

    getDictionaryValue(code: number): string {
        this.decodedValues ??= new Array(this.offsetBuffer.length - 1);
        let value = this.decodedValues[code];
        if (value === undefined) {
            const dictionary = this.getDecodedDictionary();
            value = decodeString(dictionary, this.offsetBuffer[code], this.offsetBuffer[code + 1]);
            this.decodedValues[code] = value;
        }
        return value;
    }

    getDictionaryBytes(): Uint8Array {
        return this.getDecodedDictionary();
    }

    getDecodedDictionary(): Uint8Array {
        if (this.decodedDictionary == null) {
            this.decodedDictionary = this.sharedDictionaryCache?.decodedDictionary;
            if (this.decodedDictionary == null) {
                this.decodedDictionary = this.decodeDictionary();
                if (this.sharedDictionaryCache) {
                    this.sharedDictionaryCache.decodedDictionary = this.decodedDictionary;
                }
            }
        }
        return this.decodedDictionary;
    }

    private decodeDictionary(): Uint8Array {
        if (this.symbolLengthBuffer == null) {
            this.symbolLengthBuffer = this.offsetToLengthBuffer(this.symbolOffsetBuffer);
        }
        return decodeFsst(this.symbolTableBuffer, this.symbolLengthBuffer, this.dataBuffer);
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
}
