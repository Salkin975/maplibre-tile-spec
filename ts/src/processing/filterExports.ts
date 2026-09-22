export type { SelectionVector } from "../vector/filter/selectionVector";
export { SINGLE_PART_GEOMETRY_TYPE } from "../vector/geometry/geometryType";
export { unionSelectionVectors, intersectSelectionVectors } from "../vector/filter/selectionVectorUtils";
export { filterFeatureTable } from "./filter/execution/tableFilter";
export { isColumnarFilterSupportedAtZoom, isColumnarBucketSupported } from "./filter/planning/bucketSupport";
export { toSafeMLTNumber } from "./filter/filterUtils";
export { encodePlainStrings, encodeDictionaryStrings } from "../encoding/stringEncoder";
export { decodeString } from "../decoding/stringDecoder";
export { default as IntWrapper } from "../decoding/intWrapper";
