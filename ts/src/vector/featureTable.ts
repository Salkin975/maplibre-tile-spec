import { type Geometry, type IGeometryVector } from "./geometry/geometryVector";
import type Vector from "./vector";
import { type IntVector } from "./intVector";
import { IntFlatVector } from "./flat/intFlatVector";
import { DoubleFlatVector } from "./flat/doubleFlatVector";
import { IntSequenceVector } from "./sequence/intSequenceVector";
import { IntConstVector } from "./constant/intConstVector";
import { type IGpuVector } from "./geometry/gpuVector";
import { type SelectionVector } from "./filter/selectionVector";

export interface Feature {
    id: number | bigint;
    geometry: Geometry;
    properties: { [key: string]: unknown };
}

export default class FeatureTable {
    private propertyVectorsMap: Map<string, Vector>;

    constructor(
        private readonly _name: string,
        private readonly _geometryVector: IGeometryVector | IGpuVector,
        private readonly _idVector?: IntVector,
        private readonly _propertyVectors?: Vector[],
        private readonly _extent = 4096,
    ) {}

    get name(): string {
        return this._name;
    }

    get idVector(): IntVector {
        return this._idVector;
    }

    get geometryVector(): IGeometryVector | IGpuVector {
        return this._geometryVector;
    }

    get propertyVectors(): Vector[] {
        return this._propertyVectors;
    }

    getPropertyVector(name: string): Vector {
        if (!this.propertyVectorsMap) {
            this.propertyVectorsMap = new Map(this._propertyVectors.map((vector) => [vector.name, vector]));
        }

        return this.propertyVectorsMap.get(name);
    }

    get numFeatures(): number {
        return this.geometryVector.numGeometries;
    }

    get extent(): number {
        return this._extent;
    }

    /**
     * Returns only the features at indices given by the SelectionVector.
     * getGeometries() is still called once for the full geometry column, but
     * property extraction and Feature object creation are skipped for
     * non-selected indices.
     */
    getFeaturesForSelection(sel: SelectionVector): Feature[] {
        const features: Feature[] = [];
        const geometries = this.geometryVector.getGeometries();

        for (let j = 0; j < sel.limit; j++) {
            const i = sel.getIndex(j);

            let id;
            if (this._idVector) {
                id = this.containsMaxSaveIntegerValues(this._idVector)
                    ? Number(this._idVector.getValue(i))
                    : this._idVector.getValue(i);
            }

            const geometry = {
                coordinates: geometries[i],
                type: this.geometryVector.geometryType(i),
            };

            const properties: { [key: string]: unknown } = {};
            if (this._propertyVectors) {
                for (const propertyColumn of this._propertyVectors) {
                    if (!propertyColumn) continue;
                    const propertyValue = propertyColumn.getValue(i);
                    if (propertyValue !== null) {
                        properties[propertyColumn.name] = propertyValue;
                    }
                }
            }

            features.push({ id, geometry, properties });
        }
        return features;
    }

    /**
     * Returns all features as an array
     */
    getFeatures(): Feature[] {
        const features: Feature[] = [];
        const geometries = this.geometryVector.getGeometries();

        for (let i = 0; i < this.numFeatures; i++) {
            let id;
            if (this.idVector) {
                id = this.containsMaxSaveIntegerValues(this.idVector)
                    ? Number(this.idVector.getValue(i))
                    : this.idVector.getValue(i);
            }

            const geometry = {
                coordinates: geometries[i],
                type: this.geometryVector.geometryType(i),
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

    private containsMaxSaveIntegerValues(intVector: IntVector) {
        return (
            intVector instanceof IntFlatVector ||
            (intVector instanceof IntConstVector && intVector instanceof IntSequenceVector) ||
            intVector instanceof DoubleFlatVector
        );
    }
}
