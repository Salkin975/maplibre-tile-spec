export interface SelectionVector {
    getIndex(index: number): number;
    setIndex(index: number, value: number): void;
    setLimit(limit: number): void;
    /**
     * The selected indices, narrowed to `limit`.
     *
     * Returns a **view onto internal state**, not a copy: implementations may hand back their
     * own backing array (or a `subarray` of it), and `ConstSelectionVector` caches the array it
     * materialises. Callers must therefore treat the result as read-only, and must `.slice()` it
     * if they need to keep it across a later `setIndex`/`setLimit` on the same vector.
     *
     * Returning a view is deliberate — it keeps `cloneSelection` (filterExecution.ts) and the
     * `limit`-narrowing in `FlatSelectionVector` allocation-free on the hot path.
     */
    selectionValues(): Uint32Array;
    /* Index of the first element that should not be read or written.
     * It's not the last index that can be accessed, but rather the index that marks the end of
     * the valid data in the buffer */
    get limit(): number;
    /* Total size of the buffer */
    get capacity(): number;
}
