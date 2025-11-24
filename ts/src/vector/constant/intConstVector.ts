import type BitVector from "../flat/bitVector";
import Vector from "../vector";
import { greaterThanOrEqualTo, greaterThanOrEqualToSelected, smallerThanOrEqualTo, smallerThanOrEqualToSelected } from "../utils";
import { type SelectionVector } from "../filter/selectionVector";

export class IntConstVector extends Vector<Int32Array, number> {
    public constructor(name: string, value: number, sizeOrNullabilityBuffer: number | BitVector) {
        super(name, Int32Array.of(value), sizeOrNullabilityBuffer);
    }

    protected getValueFromBuffer(index: number): number {
        return this.dataBuffer[0];
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
