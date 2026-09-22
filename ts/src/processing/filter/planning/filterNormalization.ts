import type { ColumnarComparisonOperator } from "../filterUtils";
import {
    COMPARISON_OPERATORS,
    EXISTENCE_OPERATORS,
    MEMBERSHIP_OPERATORS,
    ORDERING_OPERATORS,
    normalizeComparisonValue,
    normalizeLiteralMembershipValue,
} from "../filterUtils";
import type { FilterTarget, NormalizedFilter, NormalizedLeaf, NormalizedTypeCheck } from "../normalizedFilter";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import { isExpressionFilter } from "./filterClassification";

function constant(value: boolean): NormalizedFilter {
    return { kind: "constant", value };
}

function leaf(operator: string, target: FilterTarget, values: unknown[]): NormalizedLeaf {
    return { kind: "leaf", operator: operator as ColumnarComparisonOperator, target, values };
}

function normalizeExpressionTarget(expression: unknown): FilterTarget | undefined {
    if (!Array.isArray(expression)) return undefined;
    const targetKind = expression[0];
    if (targetKind === "get" && expression.length === 2 && typeof expression[1] === "string") {
        return { kind: "property", name: expression[1] };
    }
    if (targetKind === "geometry-type" && expression.length === 1) return { kind: "geometry-type" };
    if (targetKind === "id" && expression.length === 1) return { kind: "id" };
    return undefined;
}

function normalizeLegacyTarget(expression: unknown): FilterTarget | undefined {
    if (typeof expression !== "string") return undefined;
    if (expression === "$type") return { kind: "geometry-type" };
    if (expression === "$id") return { kind: "id" };
    return { kind: "property", name: expression };
}

function normalizeMatch(expression: ExpressionSpecification): NormalizedLeaf | undefined {
    const target = normalizeExpressionTarget(expression[1]);
    if (!target) return undefined;

    const fallbackValue = expression[expression.length - 1];
    if (typeof fallbackValue !== "boolean") return undefined;

    const trueValues: unknown[] = [];
    const falseValues: unknown[] = [];

    for (let i = 2; i < expression.length - 1; i += 2) {
        const label = expression[i];
        const outputValue = expression[i + 1];
        if (typeof outputValue !== "boolean") return undefined;

        const bucket = outputValue ? trueValues : falseValues;
        if (Array.isArray(label)) {
            bucket.push(...label);
        } else {
            bucket.push(label);
        }
    }

    return leaf(fallbackValue ? "!in" : "in", target, fallbackValue ? falseValues : trueValues);
}

function normalizeTypeCheck(expression: readonly unknown[], negated: boolean): NormalizedTypeCheck | undefined {
    if (expression.length !== 3) return undefined;
    const probeExpression = expression[1];
    if (!Array.isArray(probeExpression) || probeExpression[0] !== "typeof" || probeExpression.length !== 2)
        return undefined;

    const typeName = expression[2];
    if (typeof typeName !== "string") return undefined;

    const target = normalizeExpressionTarget(probeExpression[1]);

    if (!target || target.kind === "geometry-type") return undefined;
    return { kind: "type-check", target, typeName, negated };
}

function normalizeCase(expression: readonly unknown[]): NormalizedFilter | undefined {
    if (expression.length < 4 || expression.length % 2 !== 0) return undefined;

    const branches: NormalizedFilter[] = [];
    const negatedPriorTests: NormalizedFilter[] = [];

    for (let i = 1; i < expression.length - 1; i += 2) {
        const testExpression = normalizeExpression(expression[i]);
        const outputExpression = normalizeExpression(expression[i + 1]);
        if (!testExpression || !outputExpression) return undefined;

        branches.push({
            kind: "compound",
            operator: "all",
            children: [...negatedPriorTests, testExpression, outputExpression],
        });
        negatedPriorTests.push({ kind: "compound", operator: "none", children: [testExpression] });
    }

    const fallbackExpression = normalizeExpression(expression[expression.length - 1]);
    if (!fallbackExpression) return undefined;

    branches.push({ kind: "compound", operator: "all", children: [...negatedPriorTests, fallbackExpression] });

    return { kind: "compound", operator: "any", children: branches };
}

function normalizeExpressionNode(expression: readonly unknown[]): NormalizedFilter | undefined {
    const operator = expression[0] as string;

    if (operator === "==" || operator === "!=") {
        const typeCheck = normalizeTypeCheck(expression, operator === "!=");
        if (typeCheck) return typeCheck;
    }

    if (COMPARISON_OPERATORS.has(operator)) {
        if (expression.length !== 3) return undefined;
        const target = normalizeExpressionTarget(expression[1]);
        if (!target) return undefined;
        if (target.kind === "geometry-type" && ORDERING_OPERATORS.has(operator)) return undefined;
        const comparisonValues = normalizeComparisonValue(expression[2]);
        if (!comparisonValues) return undefined;
        return leaf(operator, target, comparisonValues);
    }

    if (operator === "in") {
        const target = normalizeExpressionTarget(expression[1]);
        if (!target) return undefined;
        const comparisonValues = normalizeLiteralMembershipValue(expression as ExpressionSpecification);
        if (!comparisonValues) return undefined;
        return leaf(operator, target, comparisonValues);
    }

    if (operator == "has") {
        if (expression.length !== 2 || typeof expression[1] !== "string") return undefined;
        return leaf(operator, { kind: "property", name: expression[1] }, []);
    }

    if (operator === "all" || operator === "any" || operator === "!") {
        if (operator === "!" && expression.length !== 2) return undefined;
        const children = normalizeChildren(expression);
        if (!children) return undefined;
        return { kind: "compound", operator: operator === "!" ? "none" : operator, children };
    }

    if (operator === "match") return normalizeMatch(expression as ExpressionSpecification);
    if (operator === "case") return normalizeCase(expression);

    return undefined;
}

function normalizeLegacyNode(expression: readonly unknown[]): NormalizedFilter | undefined {
    const operator = expression[0] as string;

    if (expression.length <= 1) return constant(operator !== "any");

    if (operator === "all" || operator === "any" || operator === "none") {
        const children = normalizeChildren(expression);
        if (!children) return undefined;
        return { kind: "compound", operator, children };
    }

    if (COMPARISON_OPERATORS.has(operator)) {
        if (expression.length !== 3) return undefined;
        const target = normalizeLegacyTarget(expression[1]);
        if (!target) return undefined;
        if (target.kind === "geometry-type" && ORDERING_OPERATORS.has(operator)) return undefined;

        if (expression[2] === null && target.kind === "property" && (operator === "==" || operator === "!=")) {
            const present = leaf(operator === "==" ? "has" : "!has", target, []);
            return {
                kind: "compound",
                operator: operator === "==" ? "all" : "any",
                children: [present, leaf(operator, target, [null])],
            };
        }

        return leaf(operator, target, [expression[2]]);
    }

    if (MEMBERSHIP_OPERATORS.has(operator)) {
        const target = normalizeLegacyTarget(expression[1]);
        if (!target) return undefined;

        return leaf(operator, target, expression.slice(2));
    }

    if (EXISTENCE_OPERATORS.has(operator)) {
        if (expression.length !== 2) return undefined;
        const target = normalizeLegacyTarget(expression[1]);
        if (!target) return undefined;

        if (target.kind === "geometry-type") return constant(operator === "has");
        return leaf(operator, target, []);
    }

    return undefined;
}

function normalizeChildren(expression: readonly unknown[]): NormalizedFilter[] | undefined {
    const children: NormalizedFilter[] = [];
    for (let i = 1; i < expression.length; i++) {
        const child = normalizeExpression(expression[i]);
        if (!child) return undefined;
        children.push(child);
    }
    return children;
}

/** Normalizes a legacy or expression filter, returns undefined if it is not supported. */
export function normalizeExpression(expression: unknown): NormalizedFilter | undefined {
    if (typeof expression === "boolean") return constant(expression);
    if (expression === undefined) return constant(true);
    if (!Array.isArray(expression)) return undefined;
    return isExpressionFilter(expression) ? normalizeExpressionNode(expression) : normalizeLegacyNode(expression);
}
