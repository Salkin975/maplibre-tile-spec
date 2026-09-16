import { VariableSizeVector } from "../variableSizeVector";
import BitVector from "./bitVector";
import { decodeString } from "../../decoding/decodingUtils";

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
