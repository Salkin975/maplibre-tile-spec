// Classifies which of the two filter syntaxes a filter node belongs to.
// The 3 Methods were copied from https://github.com/maplibre/maplibre-style-spec/blob/main/src/feature_filter/index.ts (21.08.2026)

type FilterClassification = "expression" | "legacy" | "neutral";

function classifyChildren(children: Array<any>): FilterClassification {
    let sawLegacy = false;
    for (const child of children) {
        const classification = classifyFilter(child);
        // A single expression child settles the whole tree
        if (classification === "expression") return "expression";
        if (classification === "legacy") sawLegacy = true;
    }
    return sawLegacy ? "legacy" : "neutral";
}

function classifyFilter(filter: any): FilterClassification {
    if (typeof filter === "boolean") {
        return "neutral";
    }

    if (!Array.isArray(filter) || filter.length === 0) {
        return "legacy";
    }

    switch (filter[0]) {
        case "has":
            if (filter.length < 2 || filter[1] === "$id" || filter[1] === "$type") {
                return "legacy";
            }
            // Both syntaxes read the two-element form as "property is present"
            return filter.length === 2 ? "neutral" : "expression";

        case "in":
            // Legacy `in` tests set membership, the `in` expression tests for a substring, so it stays legacy
            return filter.length >= 3 && (typeof filter[1] !== "string" || Array.isArray(filter[2]))
                ? "expression"
                : "legacy";

        case "!in":
        case "!has":
            return "legacy";

        case "==":
        case "!=":
        case ">":
        case ">=":
        case "<":
        case "<=":
            return filter.length !== 3 || Array.isArray(filter[1]) || Array.isArray(filter[2])
                ? "expression"
                : "legacy";

        case "none":
            return "legacy";
        case "any":
        case "all":
            return classifyChildren(filter.slice(1));

        default:
            return "expression";
    }
}

/** True for nodes that must be read as expression syntax, and for `neutral` nodes. */
export function isExpressionFilter(filter: unknown): boolean {
    return classifyFilter(filter) !== "legacy";
}
