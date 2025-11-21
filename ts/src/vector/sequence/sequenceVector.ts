import ComparisonVector from "../comparisonVector";

export abstract class SequenceVector<T extends ArrayBufferView, K> extends ComparisonVector<T, K> {
    protected readonly delta: K;

    protected constructor(name: string, baseValueBuffer: T, delta: K, size: number) {
        super(name, baseValueBuffer, size);
        this.delta = delta;
    }
}
