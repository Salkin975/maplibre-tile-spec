import type FeatureTable from "./featureTable";
import { readSafeValue } from "../decoding/numericSafety";

/** Options for {@link createRowView}. */
export interface RowViewOptions {
    /** Called for a read whose 64-bit value was dropped for not fitting a JS number, with its column name. */
    onUnsafeValue?: (columnName: string) => void;
}

/**
 * Presents one row of a feature table's property columns as a plain object whose values are read
 * from the columns on access.
 */
export function createRowView(
    featureTable: FeatureTable,
    rowIndex: number,
    options?: RowViewOptions,
): Record<string, unknown> {
    function readProperty(propertyName: string | symbol): unknown {
        if (typeof propertyName !== "string") return undefined;
        const propertyVector = featureTable.getPropertyVector(propertyName);
        if (!propertyVector) return undefined;
        return readSafeValue(propertyVector.getValue(rowIndex), () => options?.onUnsafeValue?.(propertyName));
    }

    return new Proxy(
        {},
        {
            get: (_target, propertyName) => readProperty(propertyName),
            has: (_target, propertyName) => readProperty(propertyName) !== undefined,
            ownKeys: () =>
                featureTable.getPropertyNames().filter((propertyName) => readProperty(propertyName) !== undefined),
            getOwnPropertyDescriptor: (_target, propertyName) => {
                const value = readProperty(propertyName);
                if (value === undefined) return undefined;
                return { value, enumerable: true, configurable: true, writable: true };
            },
        },
    );
}
