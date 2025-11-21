import ComparisonVector from "./comparisonVector";

export abstract class FixedSizeVector<T extends ArrayBufferView, K> extends ComparisonVector<T, K> {}
