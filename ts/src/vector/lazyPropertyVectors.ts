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

/** Decodes each property column on first access, call `decodeAll()` before reusing or transferring the tile buffer. */
export class LazyPropertyVectors {
    readonly #tile: Uint8Array;
    readonly #columns: LazyPropertyColumn[];
    readonly #numFeatures: number;

    /** Resolved vectors by name, `null` is a cached miss. */
    readonly #vectorsByName = new Map<string, Vector | null>();
    #allVectors: Vector[] | null = null;

    constructor(tile: Uint8Array, columns: LazyPropertyColumn[], numFeatures: number) {
        this.#tile = tile;
        this.#columns = columns;
        this.#numFeatures = numFeatures;
    }

    /**
     * Returns the vector for `name`, decoding its column on first access, struct children via their parent.
     * The last column producing `name` wins, as in a Map built from all vectors.
     */
    get(name: string): Vector | undefined {
        const cached = this.#vectorsByName.get(name);
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

        this.#vectorsByName.set(name, resolved);
        return resolved ?? undefined;
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

    /** Drops every decoded column. The column positions stay, so the next access decodes again. */
    releaseDecoded(): void {
        for (const column of this.#columns) {
            column.vectors = null;
        }
        this.#vectorsByName.clear();
        this.#allVectors = null;
    }

    #decode(column: LazyPropertyColumn): Vector[] {
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
