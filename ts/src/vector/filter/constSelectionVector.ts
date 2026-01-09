import { type SelectionVector } from "./selectionVector";

/**
 * Minimal selection vector representing either a full or empty selection.
 * Uses minimal RAM by storing only state (full/empty) and length.
 */
export class ConstSelectionVector implements SelectionVector {
    constructor(
        private readonly _kind: 0 | 1,  // 0 = empty, 1 = full
        private readonly _length: number
    ) {}

    getIndex(index: number): number {
        return this._kind === 1 ? index : -1;
    }

    setIndex(index: number, value: number): void {
        throw new Error("ConstSelectionVector is immutable");
    }

    setLimit(limit: number): void {
        throw new Error("ConstSelectionVector is immutable");
    }

    selectionValues(): Uint32Array {
        throw new Error("ConstSelectionVector has no backing array");
    }

    get limit(): number {
        return this._kind === 0 ? 0 : this._length;
    }

    get capacity(): number {
        return this._length;
    }

    static full(length: number): ConstSelectionVector {
        return new ConstSelectionVector(1, length);
    }

    static empty(length: number): ConstSelectionVector {
        return new ConstSelectionVector(0, length);
    }
}
