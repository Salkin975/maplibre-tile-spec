import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

// Types and Kinds of Operators supported in the Expressions
export const COMPARISON_OPERATORS = new Set(["==", "!=", ">", ">=", "<", "<="]);
export const ORDERING_OPERATORS = new Set([">", ">=", "<", "<="]);
export const MEMBERSHIP_OPERATORS = new Set(["in", "!in"]);
export const EXISTENCE_OPERATORS = new Set(["has", "!has"]);
export const COMPOUND_OPERATORS = new Set(["all", "any", "none", "!", "case"]);


// Normalizes the comparison value to an array of values for consistent processing
export function normalizeComparisonValue(comparisonValue: unknown): unknown[] | undefined {
    if(!Array.isArray(comparisonValue)) return [comparisonValue];
    if (comparisonValue[0] === "literal" && comparisonValue.length === 2) return [comparisonValue[1]];
    return undefined;
}

// Normalizes the membership value to an array of values for consistent processing
export function normalizeLiteralMembershipValue(expression: ExpressionSpecification): unknown[] | undefined {
    const literalValues = expression[2];
    if(!Array.isArray(literalValues)) return undefined;
    return literalValues[0] === "literal" ? (literalValues[1] as unknown[]) : undefined;
}


export type ColumnarComparisonOperator = "==" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "!in" | "has" | "!has";
type Comparable = string | number | boolean | bigint;
type OrderingOperator = ">" | ">=" | "<" | "<=";

export type ValueMatcher = (value: Comparable) => boolean;

const Max_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const Min_SAFE_INTEGER = BigInt(Number.MIN_SAFE_INTEGER);


const MATCHES_NOTHING: ValueMatcher = () => false;
const MATCHES_ANYTHING: ValueMatcher = () => true;

// make sure the number can be parsed into a TypeScript number without losing validity
export function toSafeMLTNumber(value: number | bigint): number | undefined {
    if (typeof value === "number") return value;
    if (value > Max_SAFE_INTEGER || value < Min_SAFE_INTEGER) return undefined;
    return Number(value);
}

// Normalizes the value to a Comparable type for consistent processing
export function normalizeComparable(value:unknown): Comparable | undefined {
    if(typeof value === "bigint") return toSafeMLTNumber(value);
    if(typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
    return undefined;
}

export type ValueComparisonOperator = Exclude<ColumnarComparisonOperator, "has" | "!has">;

// returns true if the operator is a negated operator
export function isNegatedOperator(operator: ValueComparisonOperator): boolean {
    return operator === "!=" || operator === "!in";
}

// returns true if the value is null or undefined
function isNullOperand(value: unknown): boolean {
    return value === null || value === undefined;
}


// returns true if the operator is a null comparison operator and the value is null or undefined
export function matchesNull(operator: ValueComparisonOperator, value: readonly unknown[]): boolean {
    switch (operator) {
        case "==":
            return value.every(isNullOperand);
        case "!=":
            return !value.every(isNullOperand);
        case "in":
            return value.some(isNullOperand);
        case "!in":
            return !value.some(isNullOperand);
        default:
            return false;
    }
}

/**
 * Values handed to a matcher are already comparable, so only integers need narrowing. An integer
 * too wide to narrow yields `undefined`, which is equal to no operand and therefore never matches.
 */
function narrow(value: Comparable): Comparable | undefined {
    return typeof value === "bigint" ? toSafeMLTNumber(value) : value;
}

/** Orders numbers and integers; anything else yields NaN, which fails every relational operator. */
function numericKey(value: Comparable): number {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return toSafeMLTNumber(value) ?? Number.NaN;
    return Number.NaN;
}

/** Booleans only order against booleans, so every other type yields NaN. */
function booleanKey(value: Comparable): number {
    return typeof value === "boolean" ? Number(value) : Number.NaN;
}

function createEqualityMatcher(operand: unknown, negated: boolean): ValueMatcher {
    const matchValue = normalizeComparable(operand);
    // An operand with no comparable representation is equal to nothing at all.
    if (matchValue === undefined) return negated ? MATCHES_ANYTHING : MATCHES_NOTHING;

    // Only a numeric operand can be reached by an integer value, so only it pays for narrowing.
    if (typeof matchValue === "number") {
        return negated
            ? (value) => narrow(value) !== matchValue
            : (value) => narrow(value) === matchValue;
    }
    return negated ? (value) => value !== matchValue : (value) => value === matchValue;
}
function createMembershipMatcher(operands: readonly unknown[], negated: boolean): ValueMatcher {
    // Hashing the operands once turns membership from a scan of the list into a single lookup.
    const matchValues = new Set<unknown>();
    for (const operand of operands) {
        const matchValue = normalizeComparable(operand);
        if (matchValue !== undefined) matchValues.add(matchValue);
    }
    if (matchValues.size === 0) return negated ? MATCHES_ANYTHING : MATCHES_NOTHING;

    return negated
        ? (value) => !matchValues.has(narrow(value))
        : (value) => matchValues.has(narrow(value));
}

function createOrderingMatcher(operator: OrderingOperator, operand: unknown): ValueMatcher {
    const threshold = normalizeComparable(operand);

    if (typeof threshold === "string") {
        switch (operator) {
            case ">":
                return (value) => typeof value === "string" && value > threshold;
            case ">=":
                return (value) => typeof value === "string" && value >= threshold;
            case "<":
                return (value) => typeof value === "string" && value < threshold;
            default:
                return (value) => typeof value === "string" && value <= threshold;
        }
    }

    // Numbers, integers and booleans all order numerically. A threshold with no comparable
    // representation becomes NaN, which is unordered against everything.
    const keyOf = typeof threshold === "boolean" ? booleanKey : numericKey;
    const target = typeof threshold === "number"
        ? threshold
        : typeof threshold === "boolean"
        ? Number(threshold)
        : Number.NaN;

    switch (operator) {
        case ">":
            return (value) => keyOf(value) > target;
        case ">=":
            return (value) => keyOf(value) >= target;
        case "<":
            return (value) => keyOf(value) < target;
        default:
            return (value) => keyOf(value) <= target;
    }
}

export function createValueMatcher(operator: ValueComparisonOperator, values: readonly unknown[]): ValueMatcher {
    switch (operator) {
        case "==":
            return createEqualityMatcher(values[0], false);
        case "!=":
            return createEqualityMatcher(values[0], true);
        case "in":
            return createMembershipMatcher(values, false);
        case "!in":
            return createMembershipMatcher(values, true);
        case ">":
        case ">=":
        case "<":
        case "<=":
            return createOrderingMatcher(operator, values[0]);
        default:
            throw new Error(`Unsupported operator: ${operator}`);
    }

}
