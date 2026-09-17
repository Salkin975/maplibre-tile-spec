import IntWrapper from "../decoding/intWrapper";
import { decodePropertyColumn } from "../decoding/propertyDecoder";
import type { Column } from "../metadata/tileset/tilesetMetadata";
import type Vector from "./vector";

const NO_VECTORS: Vector[] = [];

/**
 * A property column whose stream headers have been walked (so we know where it starts
 * and where it ends) but whose payload has not been touched.
 */
export interface PendingPropertyColumn {
    /** Top-level column name from the tile metadata. */
    readonly name: string;
    readonly metadata: Column;
    readonly numStreams: number;
    /** Byte offset of the column's first stream, relative to the buffer held by the store. */
    readonly start: number;
    /** Populated on first decode. `null` means "not decoded yet". */
    vectors: Vector[] | null;
}

/**
 * Holds property columns in their encoded form and decodes each one the first time it
 * is requested.
 *
 * IMPORTANT - buffer lifetime: unless the tile bytes were copied before construction, the
 * store keeps a view onto the tile bytes passed to `decodeTile`. The caller must not
 * reuse, pool, or transfer that ArrayBuffer while any feature table is still alive. If you
 * decode in a worker and transfer results to the main thread, call `forceAll()` before
 * transferring
 */
export class LazyPropertyVectors {
    readonly #tile: Uint8Array;
    readonly #columns: PendingPropertyColumn[];
    readonly #numFeatures: number;
    /** Projection from `DecodeTileOptions.propertyColumns`, applied when a column is decoded. */
    readonly #propertyColumnNames?: ReadonlySet<string>;

    /** Resolved vector names. A `null` value is a cached miss. */
    readonly #byName = new Map<string, Vector | null>();
    #allVectors: Vector[] | null = null;

    constructor(
        tile: Uint8Array,
        columns: PendingPropertyColumn[],
        numFeatures: number,
        propertyColumnNames?: ReadonlySet<string>,
    ) {
        this.#tile = tile;
        this.#columns = columns;
        this.#numFeatures = numFeatures;
        this.#propertyColumnNames = propertyColumnNames;
    }

    /**
     * Returns the vector for `name`, decoding its column on first request.
     * Child vectors of a struct column (`name:en`, `name:de`) resolve by decoding
     * their parent column once.
     */
    get(name: string): Vector | undefined {
        const cached = this.#byName.get(name);
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
            if (columnName === name || name.startsWith(`${columnName}:`) || name.startsWith(`${columnName}.`)) {
                this.#decode(column);
                const resolved = this.#byName.get(name);
                if (resolved) {
                    return resolved;
                }
            }
        }

        this.#byName.set(name, null);
        return undefined;
    }

    /** Decodes every remaining column. Use before transferring across a worker boundary. */
    forceAll(): Vector[] {
        if (this.#allVectors) {
            return this.#allVectors;
        }

        const all: Vector[] = [];
        const columns = this.#columns;
        for (let i = 0; i < columns.length; i++) {
            const column = columns[i];
            const vectors = column.vectors ?? this.#decode(column);
            for (let v = 0; v < vectors.length; v++) {
                all.push(vectors[v]);
            }
        }

        this.#allVectors = all;
        return all;
    }

    #decode(column: PendingPropertyColumn): Vector[] {
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
            if (!this.#byName.get(name)) {
                this.#byName.set(name, vector);
            }
        }

        return vectors;
    }
}
