import { SequenceVector } from "./sequenceVector";
import { greaterThanOrEqualTo, greaterThanOrEqualToSelected, smallerThanOrEqualTo, smallerThanOrEqualToSelected } from "../utils";
import { type SelectionVector } from "../filter/selectionVector";

export class IntSequenceVector extends SequenceVector<Int32Array, number> {
    public constructor(name: string, baseValue: number, delta: number, size: number) {
        super(name, Int32Array.of(baseValue), delta, size);
    }
    protected getValueFromBuffer(index: number): number {
        return this.dataBuffer[0] + index * this.delta;
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
