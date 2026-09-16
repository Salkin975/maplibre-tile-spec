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


export function resolveZoomExpression(expression: unknown, zoom: number): unknown {
    // Non-expression values are left unchanged.
    if(!Array.isArray(expression)) return expression;

    const operator = expression[0] as string;

    // A bare zoom expression resolves to the current tile zoom.
    if (operator === "zoom" && expression.length === 1) return zoom;

    // Compound expressions recurse into children and rebuild the same shape.
    if(COMPOUND_OPERATORS.has(operator)){
        const resolvedChildren = expression.slice(1).map((child) => resolveZoomExpression(child, zoom));
        return [operator, ...resolvedChildren];
    }

    // Comparison, membership, existence, and match expressions resolve nested zooms,
    // then fold to a concrete boolean when possible.
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

function foldLiteralLeaf(expression: ExpressionSpecification): unknown{
    const operator = expression[0] as string;
    const targetValue = expression[1];

    // A nested expression or string target is not a leaf value and must stay in expression form.
    if(Array.isArray(targetValue) || typeof targetValue === "string") return expression;

    // Existence checks reduce directly to a boolean when the target is a known literal value.
    if(operator === "has" || operator === "!has") return operator === "has";

    // Match expressions are not folded here; they require their full match structure.
    if(operator === "match") return expression;

    // Extract the literal comparison operands from the expression.
    const comparisonValues = MEMBERSHIP_OPERATORS.has(operator)
        ? normalizeLiteralMembershipValue(expression)
        : normalizeComparisonValue(expression[2]);

    // No comparable values means the expression cannot be reduced yet.
    if (!comparisonValues) return expression;

    // Build a matcher for the operator and evaluate it against the resolved target.
    return createValueMatcher(operator as ValueComparisonOperator, comparisonValues)(targetValue as number | boolean);
}
