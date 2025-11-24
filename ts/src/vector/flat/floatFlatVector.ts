import { FixedSizeVector } from "../fixedSizeVector";
import type { SelectionVector } from "../filter/selectionVector";
import { greaterThanOrEqualTo, greaterThanOrEqualToSelected, smallerThanOrEqualTo, smallerThanOrEqualToSelected } from "../utils";

export class FloatFlatVector extends FixedSizeVector<Float32Array, number> {
    protected getValueFromBuffer(index: number): number {
        return this.dataBuffer[index];
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
