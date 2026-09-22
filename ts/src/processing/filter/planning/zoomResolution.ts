import type { ValueComparisonOperator } from "../filterUtils";
import {
    COMPARISON_OPERATORS,
    COMPOUND_OPERATORS,
    EXISTENCE_OPERATORS,
    MEMBERSHIP_OPERATORS,
    createValueMatcher,
    normalizeComparisonValue,
    normalizeLiteralMembershipValue,
} from "../filterUtils";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";

/** Replaces `["zoom"]` with the zoom level and folds literal sub-expressions. */
export function resolveZoomExpression(expression: unknown, zoom: number): unknown {
    // Non-expression values are left unchanged.
    if (!Array.isArray(expression)) return expression;

    const operator = expression[0] as string;

    // A bare zoom expression resolves to the current tile zoom.
    if (operator === "zoom" && expression.length === 1) return zoom;

    // Compound expressions recurse into children and rebuild the same shape.
    if (COMPOUND_OPERATORS.has(operator)) {
        const resolvedChildren = expression.slice(1).map((child) => resolveZoomExpression(child, zoom));
        return [operator, ...resolvedChildren];
    }

    // Resolve nested zooms, then fold to a boolean where possible
    if (
        COMPARISON_OPERATORS.has(operator) ||
        MEMBERSHIP_OPERATORS.has(operator) ||
        EXISTENCE_OPERATORS.has(operator) ||
        operator === "match"
    ) {
        const resolvedArgs = expression.slice(1).map((child) => resolveZoomExpression(child, zoom));
        const resolvedExpression = [operator, ...resolvedArgs] as ExpressionSpecification;
        return foldLiteralLeaf(resolvedExpression);
    }

    return expression;
}

function foldLiteralLeaf(expression: ExpressionSpecification): unknown {
    const operator = expression[0] as string;
    const targetValue = expression[1];

    // A nested expression or string target is not a literal value
    if (Array.isArray(targetValue) || typeof targetValue === "string") return expression;

    // Existence checks reduce to a boolean for a literal target
    if (operator === "has" || operator === "!has") return operator === "has";

    // match is not folded, it needs its full structure
    if (operator === "match") return expression;

    // Extract the literal comparison operands from the expression.
    const comparisonValues = MEMBERSHIP_OPERATORS.has(operator)
        ? normalizeLiteralMembershipValue(expression)
        : normalizeComparisonValue(expression[2]);

    // Without comparable values the expression cannot be reduced
    if (!comparisonValues) return expression;

    // Evaluate the matcher against the resolved target
    return createValueMatcher(operator as ValueComparisonOperator, comparisonValues)(targetValue as number | boolean);
}
