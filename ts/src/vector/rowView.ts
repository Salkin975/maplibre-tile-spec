import type FeatureTable from "./featureTable";
import { toMvtValue } from "../decoding/mvtValue";

/**
 * Presents one row of a feature table's property columns as a plain object whose values are read
 * from the columns on access.
 *
 * A read goes to the one column that holds the name, so a row with thirty properties of which a
 * caller reads two costs two column reads.
 *
 * A property whose value is `null` or missing reads as absent: `in` is false for it and it is not
 * enumerated, which is how style expressions treat a missing value.
 */
export function createRowView(featureTable: FeatureTable, rowIndex: number): Record<string, unknown> {
    function readProperty(propertyName: string | symbol): unknown {
        if (typeof propertyName !== "string") return undefined;
        const propertyVector = featureTable.getPropertyVector(propertyName);
        if (!propertyVector) return undefined;
        return toMvtValue(propertyVector.getValue(rowIndex));
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
