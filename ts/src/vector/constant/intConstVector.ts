import type BitVector from "../flat/bitVector";
import ComparisonVector from "../comparisonVector";

export class IntConstVector extends ComparisonVector<Int32Array, number> {
    public constructor(name: string, value: number, sizeOrNullabilityBuffer: number | BitVector) {
        super(name, Int32Array.of(value), sizeOrNullabilityBuffer);
    }

    protected getValueFromBuffer(index: number): number {
        return this.dataBuffer[0];
    }
}
