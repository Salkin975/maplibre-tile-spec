import IntWrapper from "../decoding/intWrapper";
import { decodePropertyColumn } from "../decoding/propertyDecoder";
import {
    decodeSharedDictionaryChild,
    readSharedDictionary,
    sharedDictionaryChildName,
    type SharedDictionary,
} from "../decoding/stringDecoder";
import { ComplexType, type Column } from "../metadata/tileset/tilesetMetadata";
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
    /** Struct columns only: the dictionary, read on first access to any child. */
    sharedDictionary?: SharedDictionary;
    /** Struct columns only: decoded children by child index, `null` for a child absent from the tile. */
    childVectors?: Array<Vector | null | undefined>;
}

function isStructColumn(column: LazyPropertyColumn): boolean {
    return column.metadata.type === "complexType" && column.metadata.complexType.physicalType !== ComplexType.MAP;
}

/** Decodes each property column on first access, call `decodeAll()` before reusing or transferring the tile buffer. */
export class LazyPropertyVectors {
    private readonly tile: Uint8Array;
    private readonly columns: LazyPropertyColumn[];
    private readonly numFeatures: number;

    /** Resolved vectors by name, `null` is a cached miss. */
    private readonly vectorsByName = new Map<string, Vector | null>();
    private allVectors: Vector[] | null = null;

    constructor(tile: Uint8Array, columns: LazyPropertyColumn[], numFeatures: number) {
        this.tile = tile;
        this.columns = columns;
        this.numFeatures = numFeatures;
    }

    /**
     * Returns the vector for `name`, decoding only the column, or struct child, that produces it.
     * The last column producing `name` wins, as in a Map built from all vectors.
     */
    get(name: string): Vector | undefined {
        const cached = this.vectorsByName.get(name);
        if (cached !== undefined) {
            return cached ?? undefined;
        }

        let resolved: Vector | null = null;
        const columns = this.columns;
        for (let i = columns.length - 1; i >= 0 && !resolved; i--) {
            resolved = this.resolveInColumn(columns[i], name);
        }

        this.vectorsByName.set(name, resolved);
        return resolved ?? undefined;
    }

    /** Decodes all remaining columns, e.g. before transferring across a worker boundary. */
    decodeAll(): Vector[] {
        if (this.allVectors) {
            return this.allVectors;
        }

        const collectedVectors: Vector[] = [];
        const columns = this.columns;
        for (let i = 0; i < columns.length; i++) {
            const column = columns[i];
            const vectors = column.vectors ?? this.decodeLazyColumn(column);
            for (let vectorIndex = 0; vectorIndex < vectors.length; vectorIndex++) {
                collectedVectors.push(vectors[vectorIndex]);
            }
        }

        this.allVectors = collectedVectors;
        return collectedVectors;
    }

    /** Drops every decoded column. The column positions stay, so the next access decodes again. */
    releaseDecoded(): void {
        for (const column of this.columns) {
            column.vectors = null;
            column.sharedDictionary = undefined;
            column.childVectors = undefined;
        }
        this.vectorsByName.clear();
        this.allVectors = null;
    }

    /** The vector `column` produces for `name`, decoding only what can produce it, null if none. */
    private resolveInColumn(column: LazyPropertyColumn, name: string): Vector | null {
        if (column.metadata.type === "scalarType") {
            // A scalar column produces one vector, named like the column
            if (column.name !== name) return null;
            const vectors = column.vectors ?? this.decodeLazyColumn(column);
            return vectors.length > 0 ? vectors[0] : null;
        }

        if (isStructColumn(column)) {
            // Child names are known from the metadata, so only a matching child is decoded
            const children = column.metadata.complexType.children;
            for (let childIndex = children.length - 1; childIndex >= 0; childIndex--) {
                if (sharedDictionaryChildName(column.name, children[childIndex]) !== name) continue;
                const childVector = this.decodeStructChild(column, childIndex);
                if (childVector) return childVector;
            }
            return null;
        }

        // MAP keys exist only in the data, so the whole column is decoded
        if (!name.startsWith(column.name)) return null;
        const vectors = column.vectors ?? this.decodeLazyColumn(column);
        for (let j = vectors.length - 1; j >= 0; j--) {
            if (vectors[j].name === name) return vectors[j];
        }
        return null;
    }

    private decodeStructChild(column: LazyPropertyColumn, childIndex: number): Vector | null {
        if (column.numStreams === 0) return null;
        const childVectors = (column.childVectors ??= []);
        const cached = childVectors[childIndex];
        if (cached !== undefined) return cached;

        column.sharedDictionary ??= readSharedDictionary(this.tile, new IntWrapper(column.start), column.metadata);
        const childVector = decodeSharedDictionaryChild(this.tile, column.sharedDictionary, childIndex);
        childVectors[childIndex] = childVector;
        return childVector;
    }

    private decodeLazyColumn(column: LazyPropertyColumn): Vector[] {
        let vectors: Vector[];
        if (isStructColumn(column)) {
            // Through the children, so a child that get() already returned is reused
            vectors = [];
            const numChildren = column.metadata.complexType?.children.length ?? 0;
            for (let childIndex = 0; childIndex < numChildren; childIndex++) {
                const childVector = this.decodeStructChild(column, childIndex);
                if (childVector) vectors.push(childVector);
            }
        } else {
            const offset = new IntWrapper(column.start);
            const decoded = decodePropertyColumn(
                this.tile,
                offset,
                column.metadata,
                column.numStreams,
                this.numFeatures,
            );
            if (!decoded) {
                vectors = NO_VECTORS;
            } else if (Array.isArray(decoded)) {
                vectors = decoded;
            } else {
                vectors = [decoded];
            }
        }

        column.vectors = vectors;
        return vectors;
    }
}
