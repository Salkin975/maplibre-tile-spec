import type { SelectionVector } from "../filter/selectionVector";
import type { StringFsstDictionaryVector } from "../fsst-dictionary/stringFsstDictionaryVector";

export function filterStringFsstDictionaryByValue(
    vector: StringFsstDictionaryVector,
    value: string
): SelectionVector {
    throw new Error("Not implemented yet");
}

export function filterStringFsstDictionarySelected(
    vector: StringFsstDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    throw new Error("Not implemented yet");
}

export function filterStringFsstDictionaryByValueNotEqual(
    vector: StringFsstDictionaryVector,
    value: string
): SelectionVector {
    throw new Error("Not implemented yet");
}

export function filterStringFsstDictionarySelectedNotEqual(
    vector: StringFsstDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    throw new Error("Not implemented yet");
}

export function greaterThanOrEqualToStringFsstDictionary(
    vector: StringFsstDictionaryVector,
    value: string
): SelectionVector {
    throw new Error("Not implemented yet");
}

export function greaterThanOrEqualToStringFsstDictionarySelected(
    vector: StringFsstDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    throw new Error("Not implemented yet");
}

export function smallerThanOrEqualToStringFsstDictionary(
    vector: StringFsstDictionaryVector,
    value: string
): SelectionVector {
    throw new Error("Not implemented yet");
}

export function smallerThanOrEqualToStringFsstDictionarySelected(
    vector: StringFsstDictionaryVector,
    value: string,
    selectionVector: SelectionVector
): void {
    throw new Error("Not implemented yet");
}

export function matchStringFsstDictionary(
    vector: StringFsstDictionaryVector,
    values: string[]
): SelectionVector {
    throw new Error("Not implemented yet");
}

export function matchStringFsstDictionarySelected(
    vector: StringFsstDictionaryVector,
    values: string[],
    selectionVector: SelectionVector
): void {
    throw new Error("Not implemented yet");
}

export function noneMatchStringFsstDictionary(
    vector: StringFsstDictionaryVector,
    values: string[]
): SelectionVector {
    throw new Error("Not implemented yet");
}

export function noneMatchStringFsstDictionarySelected(
    vector: StringFsstDictionaryVector,
    values: string[],
    selectionVector: SelectionVector
): void {
    throw new Error("Not implemented yet");
}

