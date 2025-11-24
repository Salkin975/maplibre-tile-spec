import { SequenceVector } from "./sequenceVector";
import { greaterThanOrEqualTo, greaterThanOrEqualToSelected, smallerThanOrEqualTo, smallerThanOrEqualToSelected } from "../utils";
import { type SelectionVector } from "../filter/selectionVector";

export class LongSequenceVector extends SequenceVector<BigInt64Array, bigint> {
    public constructor(name: string, baseValue: bigint, delta: bigint, size: number) {
        super(name, BigInt64Array.of(baseValue), delta, size);
    }

    protected getValueFromBuffer(index: number): bigint {
        return this.dataBuffer[0] + BigInt(index) * this.delta;
    }

    greaterThanOrEqualTo(value: number) : SelectionVector{
        return greaterThanOrEqualTo(this, value);
    }

    greaterThanOrEqualToSelected(value: number,selectionVector: SelectionVector): void {
        greaterThanOrEqualToSelected(this, value, selectionVector);
    }

    smallerThanOrEqualTo(value: number): SelectionVector {
        return smallerThanOrEqualTo(this, value);
    }

    smallerThanOrEqualToSelected(value: number,selectionVector: SelectionVector): void {
        smallerThanOrEqualToSelected(this, value, selectionVector);
    }
}
