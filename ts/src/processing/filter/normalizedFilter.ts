import type { ColumnarComparisonOperator } from "./filterUtils";

export type FilterTarget = { kind: "property"; name: string } | { kind: "geometry-type" } | { kind: "id" };

export interface NormalizedConstant {
    kind: "constant";
    value: boolean;
}

export interface NormalizedLeaf {
    kind: "leaf";
    operator: ColumnarComparisonOperator;
    target: FilterTarget;
    values: unknown[];
}

export interface NormalizedCompound {
    kind: "compound";
    operator: "all" | "any" | "none";
    children: NormalizedFilter[];
}

export interface NormalizedTypeCheck {
    kind: "type-check";
    // geometry-type checks are unnecessary because it is always a string
    target: Exclude<FilterTarget, { kind: "geometry-type" }>;
    typeName: string;
    negated: boolean;
}

export type NormalizedFilter = NormalizedConstant | NormalizedLeaf | NormalizedCompound | NormalizedTypeCheck;
