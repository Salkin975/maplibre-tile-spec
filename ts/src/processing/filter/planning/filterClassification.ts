// validates, which of the two filter syntaxes a filter node belongs to.
// The 3 Methods were copied from https://github.com/maplibre/maplibre-style-spec/blob/main/src/feature_filter/index.ts (21.08.2026) 

type FilterClassification = "expression" | "legacy" | "neutral";

function classifyChildren(children: Array<any>): FilterClassification {
    let sawLegacy = false;
    for (const child of children) {
        const classification = classifyFilter(child);
        // A single expression-only child settles it for the whole tree.
        if (classification === 'expression') return 'expression';
        if (classification === 'legacy') sawLegacy = true;
    }
    return sawLegacy ? 'legacy' : 'neutral';
}

function classifyFilter(filter: any): FilterClassification {
    if (typeof filter === 'boolean') {
        return 'neutral';
    }

    if (!Array.isArray(filter) || filter.length === 0) {
        return 'legacy';
    }

    switch (filter[0]) {
        case 'has':
            if (filter.length < 2 || filter[1] === '$id' || filter[1] === '$type') {
                return 'legacy';
            }
            // Both syntaxes read the two-element form as "this property is present"; only the
            // expression takes a third argument.
            return filter.length === 2 ? 'neutral' : 'expression';

        case 'in':
            // Legacy `["in", key, ...values]` tests a property against a set, while the `in`
            // expression tests for a substring, so the scalar form is a conflict rather than a
            // neutral node. Keeping it legacy is what makes plain legacy `in` filters keep
            // matching, and what lets findMixedLegacyFilter report one inside an expression.
            return filter.length >= 3 && (typeof filter[1] !== 'string' || Array.isArray(filter[2]))
                ? 'expression'
                : 'legacy';

        case '!in':
        case '!has':
            return 'legacy';

        case '==':
        case '!=':
        case '>':
        case '>=':
        case '<':
        case '<=':
            return filter.length !== 3 || Array.isArray(filter[1]) || Array.isArray(filter[2])
                ? 'expression'
                : 'legacy';

        case 'none':
            return 'legacy';
        case 'any':
        case 'all':
            return classifyChildren(filter.slice(1));

        default:
            return 'expression';
    }
}

/** True for nodes that must be read as expression syntax, and for `neutral` nodes. */
export function isExpressionFilter(filter: unknown): boolean {
    return classifyFilter(filter) !== 'legacy';
}