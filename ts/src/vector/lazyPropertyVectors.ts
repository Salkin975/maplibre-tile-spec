import IntWrapper from "../decoding/intWrapper";
import { decodePropertyColumn } from "../decoding/propertyDecoder";
import type { Column } from "../metadata/tileset/tilesetMetadata";
import type Vector from "./vector";

const NO_VECTORS: Vector[] = [];

/** Property column whose payload has not been decoded yet. */
export interface PendingPropertyColumn {
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
 * call `forceAll()` before transferring the results out of a worker.
 */
export class LazyPropertyVectors {
    readonly #tile: Uint8Array;
    readonly #columns: PendingPropertyColumn[];
    readonly #numFeatures: number;

    /** Resolved vectors by name, `null` is a cached miss. */
    readonly #byName = new Map<string, Vector | null>();
    #allVectors: Vector[] | null = null;

    constructor(tile: Uint8Array, columns: PendingPropertyColumn[], numFeatures: number) {
        this.#tile = tile;
        this.#columns = columns;
        this.#numFeatures = numFeatures;
    }

    /**
     * Returns the vector for `name`, decoding its column on first access.
     * Struct children (`name:en`, `name:de`) resolve through their parent column.
     * The last column producing `name` wins, as in a Map built from all vectors.
     */
    get(name: string): Vector | undefined {
        const cached = this.#byName.get(name);
        if (cached !== undefined) {
            return cached ?? undefined;
        }

        let resolved: Vector | null = null;
        const columns = this.#columns;
        // Struct children are named column name + child name, joined by any delimiter or none.
        for (let i = columns.length - 1; i >= 0 && !resolved; i--) {
            const column = columns[i];
            if (!name.startsWith(column.name)) continue;
            const vectors = column.vectors ?? this.#decode(column);
            for (let j = vectors.length - 1; j >= 0; j--) {
                if (vectors[j].name === name) {
                    resolved = vectors[j];
                    break;
                }
            }
        }

        this.#byName.set(name, resolved);
        return resolved ?? undefined;
    }

    /** Decodes all remaining columns, e.g. before transferring across a worker boundary. */
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
        const decoded = decodePropertyColumn(this.#tile, offset, column.metadata, column.numStreams, this.#numFeatures);

        let vectors: Vector[];
        if (!decoded) {
            vectors = NO_VECTORS;
        } else if (Array.isArray(decoded)) {
            vectors = decoded;
        } else {
            vectors = [decoded];
        }

        column.vectors = vectors;
        return vectors;
    }
}
