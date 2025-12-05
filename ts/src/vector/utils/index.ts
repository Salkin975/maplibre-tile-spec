/**
 * Vector utility functions for filtering and comparison operations.
 *
 * This module provides external utility functions for working with vectors,
 * promoting composition and enabling tree-shaking.
 *
 * @module vector/utils
 */

export {
    filterByValue,
    filterSelected,
    filterNotEqual,
    filterNotEqualSelected,
    match,
    matchSelected,
    noneMatch,
    noneMatchSelected,
} from './filterUtils';

export {
    greaterThanOrEqualTo,
    greaterThanOrEqualToSelected,
    smallerThanOrEqualTo,
    smallerThanOrEqualToSelected,
    type ComparableVector,
} from './comparisonUtils';

export {
    sortDictionary,
    binarySearchDictionary,
    findDictionaryIndex,
    filterStringDictionaryByValue,
    filterStringDictionaryNotEqual,
    matchStringDictionary,
    noneMatchStringDictionary,
    greaterThanOrEqualToStringDictionary,
    smallerThanOrEqualToStringDictionary,
    filterStringDictionarySelected,
    filterStringDictionaryNotEqualSelected,
    matchStringDictionarySelected,
    noneMatchStringDictionarySelected,
    greaterThanOrEqualToStringDictionarySelected,
    smallerThanOrEqualToStringDictionarySelected,
} from './stringDictionaryUtils';

export {
    filterStringFlatByValue,
    filterStringFlatNotEqual,
    matchStringFlat,
    noneMatchStringFlat,
    greaterThanOrEqualToStringFlat,
    smallerThanOrEqualToStringFlat,
    filterStringFlatSelected,
    filterStringFlatNotEqualSelected,
    matchStringFlatSelected,
    noneMatchStringFlatSelected,
    greaterThanOrEqualToStringFlatSelected,
    smallerThanOrEqualToStringFlatSelected,
} from './stringFlatVectorUtils';

export {
    filterStringFsstDictionaryByValue,
    filterStringFsstDictionaryNotEqual,
    matchStringFsstDictionary,
    noneMatchStringFsstDictionary,
    greaterThanOrEqualToStringFsstDictionary,
    smallerThanOrEqualToStringFsstDictionary,
    filterStringFsstDictionarySelected,
    filterStringFsstDictionaryNotEqualSelected,
    matchStringFsstDictionarySelected,
    noneMatchStringFsstDictionarySelected,
    greaterThanOrEqualToStringFsstDictionarySelected,
    smallerThanOrEqualToStringFsstDictionarySelected,
} from './stringFsstDictionaryUtils';
