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

/** Geometry column whose payload has not been decoded yet. */
export class PendingGeometryColumn {
    constructor(
        readonly tile: Uint8Array,
        readonly start: number,
        readonly numStreams: number,
        readonly numFeatures: number,
        readonly scaling?: { extent: number; min: number; max: number; scale?: number },
    ) {}
}

/** ID column whose DATA stream has not been decoded yet, the PRESENT stream already is. */
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
        /** Feature count, so that it does not require decoding the geometry. */
        private readonly _numFeatures?: number,
    ) {
        if (_name.length === 0) {
            throw new Error("Missing layer name");
        }
    }

    get name(): string {
        return this._name;
    }

    /** Decodes the ID data stream on first access. */
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

    /** Decodes the geometry on first access, null if decoded with `includeGeometry: false`. */
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

    /** Decodes all remaining property columns. */
    get propertyVectors(): Vector[] {
        if (!this._propertyVectors) {
            return [];
        }
        if (this._propertyVectors instanceof LazyPropertyVectors) {
            return this._propertyVectors.forceAll();
        }
        return this._propertyVectors;
    }

    /** Looks up a property column by name, decoding only that column. */
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

    /** Returns all features as an array, requires includeGeometry = true */
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
