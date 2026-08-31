# Dictionary value caching

Notes on a decode-performance investigation and the resulting change to
`StringDictionaryVector` and `StringFsstDictionaryVector`
(`ts/src/vector/dictionary/stringDictionaryVector.ts`,
`ts/src/vector/fsst-dictionary/stringFsstDictionaryVector.ts`). Filed here because it came out of
the same session as the filter-engine work in this directory, not because the change itself is
filter-specific — it affects every column read, filtered or not.

## Starting point

`realTileParity.bench.ts` (real Bayern tiles, not synthetic fixtures) showed MLT decoding
7x–43x slower than MVT decoding the same tile, even in the "parse + read every feature" comparison
that's fair to both formats. The working hypothesis was dictionary sorting.

## Dictionary sorting: ruled out

`StringDictionaryVector.getSortedDictionaryIndices()` has **zero callers anywhere in `src/`** —
not from decode, not from the filter engine's ordering-operator kernel (`filterKernel.ts`'s
`resolveDictionaryExecutor` does a linear scan over `getDictionaryValue(code)` for `>`/`>=`/`<`/`<=`,
never the sorted index). It's dead code. Whatever the decode cost is, it isn't this.

## Where the time actually goes

Measured on tile z14/8720/5686 (5,281 features, the largest tile in the local Bayern set):

| phase | share of total |
|---|---|
| `decodeTile()` (columnar stream decode) | ~40% |
| `getFeatures()` materialization | ~60%, split further: |
| — `getGeometries()` | ~20% of total |
| — property materialization (`propertyColumn.getValue(i)` per row per column) | ~30–40% of total, the single biggest phase |
| — per-feature id/geometry object churn | negligible |

## Root cause in property materialization

`FeatureTable.getFeatures()` calls `propertyColumn.getValue(i)` once per row per column.
For dictionary-encoded string columns, that resolved to a fresh UTF-8 (or FSST) decode of the
dictionary bytes **on every row**, even though many rows share the same dictionary code — there
was no cache from code → decoded string. On the measured tile: 19,063 row reads against only 7,433
distinct dictionary entries (~2.6x redundant decode work), concentrated unevenly — e.g.
`transportation.access` was 82 rows sharing 1 distinct value, `poi.subclass` was 3,633 rows across
185 distinct values, while the largest columns by row count (`poi.name` and its four language
variants, FSST-encoded) were close to 1:1 — 1,237 distinct values out of 1,407 rows.

A sharper instance of the same class of problem, found while checking this: `poi.name` and
`poi.name:latin` decode to **byte-identical** dictionaries, decompressed independently. The decoder
already has a cross-column sharing mechanism for exactly this (`FsstDictionaryCache`, wired up in
`stringDecoder.ts`'s `decodeSharedDictionary`), but it only applies within one shared-dictionary
group as encoded in the tile — these five `name*` columns weren't grouped that way at encode time,
so the existing sharing mechanism doesn't reach them. Left unaddressed (see below).

## The fix

Added a per-dictionary-code decoded-value cache (`decodedValues?: Array<string | undefined>`) to
both `StringDictionaryVector.getDictionaryValue()` and `StringFsstDictionaryVector.getDictionaryValue()`,
populated lazily on first access per code. `getValueFromBuffer()` on both classes already routed
(or now routes, for the FSST vector) through `getDictionaryValue()`, so every row-level read
benefits automatically, as does the filter engine's ordering-operator kernel, without either
needing to know the cache exists.

Full test suite (694 tests, including `realTileParity.spec.ts`'s real-tile correctness checks)
passes unchanged after the change.

## Honest performance result

This is the part worth being direct about: **a same-session A/B (3 runs each, caching vs. no
caching, same tile, same process) did not show a clear win** for the "decode a tile once and read
every row once" workload that `realTileParity.bench.ts` measures. Both configurations landed in the
27–39ms range for the full decode+materialize pass, with ~20–30% run-to-run variance on this
machine swamping whatever the caching contributed.

That's expected once you think through what the cache actually saves here, given the redundancy
distribution above:

- The cache is per-vector-instance. A benchmark that calls `decodeTile()` fresh every iteration
  (simulating a new network response) gets a brand-new, empty cache every time — there's no
  cross-decode benefit to measure in that harness.
- Even *within* one decode, the columns with real redundancy to exploit (`transportation.access`,
  `poi.subclass`, etc.) are cheap to decode regardless (short plain strings, small dictionaries).
  The columns expensive enough to matter (`poi.name*`, multi-KB FSST dictionaries) are ~88% unique
  per row on this tile, so there's little redundancy for the cache to remove.

So: the change is correct, has no measured downside, and directly fixes the redundant-decode
pattern the investigation set out to find — but it is not the fix for the MVT-vs-MLT decode gap
`realTileParity.bench.ts` surfaced. That gap is still open. The cache should matter more for access
patterns that revisit the same `StringDictionaryVector`/`StringFsstDictionaryVector` instance
repeatedly — e.g. a filter evaluating an ordering operator over a whole column, or a consumer
reading the same `FeatureTable`'s properties more than once (filter, then style-property
evaluation, then a feature query) — but that wasn't isolated and measured here.

## Still open

- Property materialization and `getGeometries()` remain the two biggest phases; neither was changed.
- The `poi.name`/`poi.name:latin` duplicate-dictionary case: either encode `name`/`name:latin`/etc.
  as one shared-dictionary group (`decodeSharedDictionary` already handles that correctly), or have
  the decoder detect byte-identical dictionaries across sibling columns at decode time and dedupe.
  Neither is implemented.

## Follow-up: is the MVT-vs-MLT gap real, and is the benchmark fair?

Follow-up investigation into whether MVT is just faster, full stop, or whether
`realTileParity.bench.ts`'s original two groups ("parse", "parse + read all features") were
comparing the wrong thing.

### MVT's own dictionary, and why it never had this problem

`@mapbox/vector-tile` (`node_modules/@mapbox/vector-tile/index.js`) turns out to have essentially
the same dictionary idea MLT does — every layer carries `keys`/`values` arrays deduplicating every
distinct property key/value used in that layer. The difference is *when* it's decoded:
`VectorTileLayer`'s constructor decodes the **entire** `values` array eagerly, once, when the layer
opens (`readValueMessage`, called once per distinct value — `index.js:283-291`); after that,
reading a feature's properties (`readTag`, `index.js:213-223`) is just array-index lookups into an
already-decoded dictionary, zero decode cost per row. MVT structurally can't have MLT's original
redundant-decode problem, because it never decodes lazily-per-row in the first place. It follows
that the per-code caching fix above brings MLT's *repeated-value* cost to roughly what MVT's always
was — it doesn't explain any gap beyond that.

### The benchmark bug: decode cost was leaking into the wrong measurement

Two new comparisons were added to `realTileParity.bench.ts` — reading one property from every
feature, and filtering + materializing only matches — meant to isolate MLT's actual structural
advantage (columnar access, skip what you don't need) instead of the "materialize everything"
shape of the first two groups, which plays entirely to MVT's strength. The first version of these
new benchmarks still called `decodeTile()`/`new VectorTile()` *inside* the timed function on every
iteration. For MLT that silently re-included the ~12–30ms full columnar decode in every sample; for
MVT, `new VectorTile()` was comparatively cheap (~0.5–6ms depending on tile size) so it barely
mattered. Result: MLT looked 9–12x *slower* even in the scenarios designed to favor it — an
artifact of the harness, not the format. Fixed by decoding once, outside `bench()`, for both sides,
so what's measured is the marginal cost of a read/filter against an already-decoded tile — the
realistic case for a map client that decodes a tile once and then runs multiple style layers'
queries against it.

### Results, corrected

Across every tile with a `transportation.class` column (z9 through the largest local tile,
z14/8720/5686 at 5,281 features):

| scenario | small tiles (z5/z9) | largest tile (z14/8720/5686, 5281 features) |
|---|---|---|
| read one property, already-decoded | ~1.1x MVT / 5.2x MLT (mixed) | **10.0x MLT** |
| filter + materialize matches, already-decoded | ~1.1–1.4x either way (wash) | **19.4x MLT** |

The pattern holds across every tile measured (z9, z11, z13, both z14 tiles): MLT's per-query
advantage grows with feature count, is a wash on small tiles (fixed per-call overhead — `Pbf`
construction, `SelectionVector` allocation — dominates when there's little data to amortize it
over), and reaches an order of magnitude on the largest real tile in the set.

### The real trade-off

MLT pays a larger, roughly size-proportional decode cost up front (`decodeTile()` must build
index/offset/nullability streams for every row of every column, not just distinct values — this is
inherent to a column-oriented format, not fixable without abandoning columnar storage) and gets a
much cheaper marginal cost per query afterward. MVT is nearly free to open and gets increasingly
expensive per query, because `layer.feature(i)` re-parses that feature's raw protobuf bytes from
scratch on every single call — there's no caching in the library, and none is structurally possible
without changing the row-oriented format itself.

Which format "wins" therefore depends entirely on how many times a decoded tile gets queried before
being discarded — decode-once-render-once clearly favors MVT; decode-once-query-many-times
(multiple style layers over one source-layer, re-filtering, hover/click feature queries) favors
MLT, more so the larger the tile. On the largest local tile, the one-time decode cost the "already
-decoded" benchmarks factor out is ~6ms more than MVT's equivalent open cost, and each query is
~0.15ms cheaper on MLT — so roughly 40 queries against one decoded tile is where MLT's total cost
(decode + N queries) crosses over MVT's (N × re-parse). A style with more than a handful of layers
referencing the same source-layer, or any interaction that re-queries a tile (hover, click,
re-styling), clears that bar easily.

So: the original "MVT is 7–43x faster" framing was real for the specific "decode once, materialize
everything once" workload it measured, but not representative of how a tile actually gets used by a
renderer, and the naive extension of that benchmark to "prove" MLT is *always* slower was itself
measuring the wrong thing. The gap is real, understood, and situational — not a bug.
