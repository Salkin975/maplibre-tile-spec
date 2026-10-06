import IntWrapper from "../decoding/intWrapper";
import { decodePropertyColumn } from "../decoding/propertyDecoder";
import type { Column } from "../metadata/tileset/tilesetMetadata";
import type Vector from "./vector";

const NO_VECTORS: Vector[] = [];

/** Property column whose payload has not been decoded yet. */
export interface LazyPropertyColumn {
    /** Top-level column name from the tile metadata. */
    readonly name: string;
    readonly metadata: Column;
    readonly numStreams: number;
    /** Byte offset of the first stream. */
    readonly start: number;
    /** Populated on first decode. `null` means "not decoded yet". */
    vectors: Vector[] | null;
}

/**
 * Holds property columns in encoded form and decodes each one on first access.
 * The tile buffer must not be reused or transferred while a feature table is alive,
 * call `decodeAll()` before transferring the results out of a worker.
 */
export class LazyPropertyVectors {
    readonly #tile: Uint8Array;
    readonly #columns: LazyPropertyColumn[];
    readonly #numFeatures: number;
    /** `DecodeTileOptions.propertyColumnNames`, applied when a column is decoded. */
    readonly #propertyColumnNames?: ReadonlySet<string>;

    /** Resolved vectors by name, `null` is a cached miss. */
    readonly #vectorsByName = new Map<string, Vector | null>();
    #allVectors: Vector[] | null = null;

    constructor(
        tile: Uint8Array,
        columns: LazyPropertyColumn[],
        numFeatures: number,
        propertyColumnNames?: ReadonlySet<string>,
    ) {
        this.#tile = tile;
        this.#columns = columns;
        this.#numFeatures = numFeatures;
        this.#propertyColumnNames = propertyColumnNames;
    }

    /**
     * Returns the vector for `name`, decoding its column on first access.
     * Struct children (`name:en`, `name:de`) resolve through their parent column.
     */
    get(name: string): Vector | undefined {
        const cached = this.#vectorsByName.get(name);
        if (cached !== undefined) {
            return cached ?? undefined;
        }

        const columns = this.#columns;
        for (let i = 0; i < columns.length; i++) {
            const column = columns[i];
            if (column.vectors !== null) {
                // Already decoded, and it did not produce this name.
                continue;
            }
            const columnName = column.name;
            // An unnamed struct (sibling fields such as `class` and `subclass` the encoder groups under no
            // name) has no prefix to match, so it is tried for every name.
            if (
                columnName === "" ||
                columnName === name ||
                name.startsWith(`${columnName}:`) ||
                name.startsWith(`${columnName}.`)
            ) {
                this.#decode(column);
                const resolved = this.#vectorsByName.get(name);
                if (resolved) {
                    return resolved;
                }
            }
        }

        this.#vectorsByName.set(name, null);
        return undefined;
    }

    /** Decodes all remaining columns, e.g. before transferring across a worker boundary. */
    decodeAll(): Vector[] {
        if (this.#allVectors) {
            return this.#allVectors;
        }

        const collectedVectors: Vector[] = [];
        const columns = this.#columns;
        for (let i = 0; i < columns.length; i++) {
            const column = columns[i];
            const vectors = column.vectors ?? this.#decode(column);
            for (let vectorIndex = 0; vectorIndex < vectors.length; vectorIndex++) {
                collectedVectors.push(vectors[vectorIndex]);
            }
        }

        this.#allVectors = collectedVectors;
        return collectedVectors;
    }

    #decode(column: LazyPropertyColumn): Vector[] {
        const offset = new IntWrapper(column.start);
        const decoded = decodePropertyColumn(
            this.#tile,
            offset,
            column.metadata,
            column.numStreams,
            this.#numFeatures,
            this.#propertyColumnNames,
        );

        let vectors: Vector[];
        if (!decoded) {
            vectors = NO_VECTORS;
        } else if (Array.isArray(decoded)) {
            vectors = decoded;
        } else {
            vectors = [decoded];
        }

        column.vectors = vectors;

        for (let i = 0; i < vectors.length; i++) {
            const vector = vectors[i];
            const name = (vector as { name?: string }).name ?? column.name;
            // Overwrite cached misses, but never a vector that already claimed the name.
            if (!this.#vectorsByName.get(name)) {
                this.#vectorsByName.set(name, vector);
            }
        }

        return vectors;
    }
}
