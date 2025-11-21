import type BitVector from "./flat/bitVector";
import ComparisonVector from "./comparisonVector";

export abstract class VariableSizeVector<T extends ArrayBufferView, K> extends ComparisonVector<T, K> {
    //TODO: switch to Uint32Array by changing the decodings
    protected constructor(
        name: string,
        protected offsetBuffer: Int32Array,
        dataBuffer: T,
        sizeOrNullabilityBuffer: number | BitVector,
    ) {
        super(name, dataBuffer, sizeOrNullabilityBuffer);
    }
}
