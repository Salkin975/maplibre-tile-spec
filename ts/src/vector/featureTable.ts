import type { Geometry, GeometryVector } from "./geometry/geometryVector";
import type Vector from "./vector";
import type { IdVector } from "./idVector";
import { Int32FlatVector } from "./flat/int32FlatVector";
import { DoubleFlatVector } from "./flat/doubleFlatVector";
import { Int32SequenceVector } from "./sequence/int32SequenceVector";
import { Int32ConstVector } from "./constant/int32ConstVector";
import type { GpuVector } from "./geometry/gpuVector";
import { LazyPropertyVectors } from "./lazyPropertyVectors";
import IntWrapper from "../decoding/intWrapper";
import { decodeGeometryColumn } from "../decoding/geometryDecoder";
import { decodeIdColumn } from "../decoding/idColumnDecoder";
import type { Column } from "../metadata/tileset/tilesetMetadata";
import type { StreamMetadata } from "../metadata/tile/streamMetadataDecoder";
import type BitVector from "./flat/bitVector";

export interface Feature {
    id: number | bigint | undefined;
    geometry: Geometry;
    properties: { [key: string]: unknown };
}

/**
 * A geometry column whose stream headers have been walked (so its start offset and stream
 * count are known) but whose payload has not been decoded. Built by decodeTile's scan and
 * decoded on first `FeatureTable.geometryVector` access.
 *
 * `scaling` is a snapshot (`{ extent, min, max, scale }`), never the caller's live
 * `GeometryScaling` object: that object is mutable and may be reused across `decodeTile()`
 * calls, so holding a live reference would let a later tile's mutation corrupt this one's
 * deferred decode.
 */
export class PendingGeometryColumn {
    constructor(
        readonly tile: Uint8Array,
        readonly start: number,
        readonly numStreams: number,
        readonly numFeatures: number,
        readonly scaling?: { extent: number; min: number; max: number; scale?: number },
    ) {}
}

/**
 * An ID column whose PRESENT stream (if any) has already been decoded - it's cheap and is how
 * `numFeatures` gets resolved for a nullable ID column - but whose DATA stream has not. Decoded
 * on first `FeatureTable.idVector` access.
 */
export class PendingIdColumn {
    constructor(
        readonly tile: Uint8Array,
        readonly start: number,
        readonly columnMetadata: Column,
        readonly columnName: string,
        readonly idDataStreamMetadata: StreamMetadata,
        readonly sizeOrNullabilityBuffer: number | BitVector,
        readonly idWithinMaxSafeInteger: boolean,
    ) {}
}

export default class FeatureTable {
    private propertyVectorsMap?: Map<string, Vector>;

    constructor(
        private readonly _name: string,
        private _geometryVector: GeometryVector | GpuVector | PendingGeometryColumn | null,
        private _idVector?: IdVector | PendingIdColumn,
        private readonly _propertyVectors?: Vector[] | LazyPropertyVectors,
        private readonly _extent = 4096,
        /** Authoritative feature count - avoids forcing a geometry decode just to learn it. */
        private readonly _numFeatures?: number,
    ) {
        if (_name.length === 0) {
            throw new Error("Missing layer name");
        }
    }

    get name(): string {
        return this._name;
    }

    /** Decodes the ID column's data stream on first access if it was deferred. */
    get idVector(): IdVector | undefined {
        if (this._idVector instanceof PendingIdColumn) {
            const pending = this._idVector;
            this._idVector = decodeIdColumn(
                pending.tile,
                pending.columnMetadata,
                new IntWrapper(pending.start),
                pending.columnName,
                pending.idDataStreamMetadata,
                pending.sizeOrNullabilityBuffer,
                pending.idWithinMaxSafeInteger,
            );
        }
        return this._idVector;
    }

    /** Null when the table was decoded with `includeGeometry: false`. Decodes on first access otherwise. */
    get geometryVector(): GeometryVector | GpuVector | null {
        if (this._geometryVector instanceof PendingGeometryColumn) {
            const pending = this._geometryVector;
            this._geometryVector = decodeGeometryColumn(
                pending.tile,
                pending.numStreams,
                new IntWrapper(pending.start),
                pending.numFeatures,
                pending.scaling,
            );
        }
        return this._geometryVector;
    }

    /** Forces every remaining property column to decode. Prefer `getPropertyVector` for a single column. */
    get propertyVectors(): Vector[] {
        if (!this._propertyVectors) {
            return [];
        }
        if (this._propertyVectors instanceof LazyPropertyVectors) {
            return this._propertyVectors.forceAll();
        }
        return this._propertyVectors;
    }

    /** Looks up a single property column by name, decoding only that column if the table is lazy. */
    getPropertyVector(name: string): Vector | undefined {
        if (this._propertyVectors instanceof LazyPropertyVectors) {
            return this._propertyVectors.get(name);
        }

        if (!this.propertyVectorsMap) {
            this.propertyVectorsMap = new Map(this.propertyVectors.map((vector) => [vector.name, vector]));
        }

        return this.propertyVectorsMap.get(name);
    }

    get numFeatures(): number {
        if (this._numFeatures !== undefined) {
            return this._numFeatures;
        }
        return this._geometryVector && !(this._geometryVector instanceof PendingGeometryColumn)
            ? this._geometryVector.numGeometries
            : 0;
    }

    get extent(): number {
        return this._extent;
    }

    /**
     * Returns all features as an array. Requires geometry - throws if the table was decoded
     * with `includeGeometry: false`; use `getPropertyVector`/`idVector` for an attribute-only read.
     */
    getFeatures(): Feature[] {
        const geometryVector = this.geometryVector;
        if (!geometryVector) {
            throw new Error(
                `Feature table "${this._name}" was decoded with includeGeometry: false; getFeatures() needs geometry.`,
            );
        }

        const features: Feature[] = [];
        const geometries = geometryVector.getGeometries();

        for (let i = 0; i < this.numFeatures; i++) {
            let id: number | bigint | undefined;
            if (this.idVector) {
                const idValue = this.idVector.getValue(i);
                if (idValue !== null) {
                    id = this.containsMaxSafeIntegerValues(this.idVector) ? Number(idValue) : idValue;
                }
            }
            const geometry = {
                coordinates: geometries[i],
                type: geometryVector.geometryType(i),
            };

            const properties: { [key: string]: unknown } = {};
            for (const propertyColumn of this.propertyVectors) {
                if (!propertyColumn) continue;
                const columnName = propertyColumn.name;
                const propertyValue = propertyColumn.getValue(i);
                if (propertyValue !== null) {
                    properties[columnName] = propertyValue;
                }
            }

            features.push({ id, geometry, properties });
        }
        return features;
    }

    private containsMaxSafeIntegerValues(idVector: IdVector) {
        return (
            idVector instanceof Int32FlatVector ||
            idVector instanceof Int32ConstVector ||
            idVector instanceof Int32SequenceVector ||
            idVector instanceof DoubleFlatVector
        );
    }
}
