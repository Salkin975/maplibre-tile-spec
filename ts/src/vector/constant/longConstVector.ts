import type BitVector from "../flat/bitVector";
import ComparisonVector from "../comparisonVector";

export class LongConstVector extends ComparisonVector<BigInt64Array, bigint> {
    public constructor(name: string, value: bigint, sizeOrNullabilityBuffer: number | BitVector) {
        super(name, BigInt64Array.of(value), sizeOrNullabilityBuffer);
    }

    protected getValueFromBuffer(index: number): bigint {
        return this.dataBuffer[0];
    }
}
