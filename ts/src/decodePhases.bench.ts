// Per-phase decode time and memory per tile. Run with `npm run bench:decode`.
// Env: BENCH_TILES (default test/expected/0x01/omt), BENCH_ROUNDS, BENCH_ITERS, BENCH_OUT (JSON lines).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import { it } from "vitest";
import decodeTile, { scanLayerBlocks } from "./mltDecoder";
import { decodeEmbeddedTileSetMetadata } from "./metadata/tileset/embeddedTilesetMetadataDecoder";
import IntWrapper from "./decoding/intWrapper";
import { readVarint } from "./decoding/integerDecodingUtils";
import type FeatureTable from "./vector/featureTable";

const tilesDir = process.env.BENCH_TILES ?? fileURLToPath(new URL("../../test/expected/0x01/omt", import.meta.url));
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 15);
const ITERS = Number(process.env.BENCH_ITERS ?? 20);
const WARMUP_ROUNDS = 2;

const tiles: { id: string; bytes: Uint8Array }[] = [];
(function collectTiles(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectTiles(filePath);
        } else if (entry.name.endsWith(".mlt")) {
            tiles.push({ id: path.relative(tilesDir, filePath), bytes: new Uint8Array(fs.readFileSync(filePath)) });
        }
    }
})(tilesDir);

const gc = (globalThis as { gc?: () => void }).gc;

/** Metadata of every block, without the column walk. */
function decodeMetadataOnly(tile: Uint8Array) {
    const offset = new IntWrapper(0);
    while (offset.get() < tile.length) {
        const blockLength = readVarint(tile, offset);
        const blockEnd = offset.get() + blockLength;
        const tag = readVarint(tile, offset);
        if (tag === 1 || tag === 2) {
            decodeEmbeddedTileSetMetadata(tile, offset);
        }
        offset.set(blockEnd);
    }
}

function decodeAllColumns(featureTables: FeatureTable[]) {
    for (const featureTable of featureTables) {
        void featureTable.idVector;
        void featureTable.geometryVector;
        void featureTable.propertyVectors;
    }
}

const DECODE_PHASE = "decodeTile (metadata + column walk)";
const decodePhases: Record<string, (tile: Uint8Array) => unknown> = {
    scanLayerBlocks: (tile) => scanLayerBlocks(tile),
    metadata: (tile) => decodeMetadataOnly(tile),
    [DECODE_PHASE]: (tile) => decodeTile(tile),
};
// Timed on a freshly decoded tile each time.
const lazyPhases: Record<string, (featureTables: FeatureTable[]) => void> = {
    ids: (featureTables) => {
        for (const featureTable of featureTables) void featureTable.idVector;
    },
    geometry: (featureTables) => {
        for (const featureTable of featureTables) void featureTable.geometryVector;
    },
    properties: (featureTables) => {
        for (const featureTable of featureTables) void featureTable.propertyVectors;
    },
};

/** ms per tile. */
function timeDecodePhase(decode: (tile: Uint8Array) => unknown): number {
    const start = performance.now();
    for (let i = 0; i < ITERS; i++) {
        for (const tile of tiles) decode(tile.bytes);
    }
    return (performance.now() - start) / (ITERS * tiles.length);
}

/** ms per tile, excluding decodeTile. */
function timeLazyPhase(materialize: (featureTables: FeatureTable[]) => void): number {
    let total = 0;
    for (let i = 0; i < ITERS; i++) {
        for (const tile of tiles) {
            const featureTables = decodeTile(tile.bytes);
            const start = performance.now();
            materialize(featureTables);
            total += performance.now() - start;
        }
    }
    return total / (ITERS * tiles.length);
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function settleHeap() {
    gc?.();
    await new Promise((resolve) => setImmediate(resolve));
    gc?.();
}

const retainedBytes = () => {
    const usage = process.memoryUsage();
    return usage.heapUsed + usage.arrayBuffers;
};

// Needs --expose-gc, so `npm run bench` skips it.
it.skipIf(!gc)(
    "decode phases",
    async () => {
        if (tiles.length === 0) {
            throw new Error(`No .mlt tiles found in ${tilesDir}`);
        }

        const samples: Record<string, number[]> = {};
        const addSample = (name: string, value: number) => (samples[name] ??= []).push(value);

        for (let round = 0; round < WARMUP_ROUNDS + ROUNDS; round++) {
            gc?.();
            for (const [name, decode] of Object.entries(decodePhases)) {
                const msPerTile = timeDecodePhase(decode);
                if (round >= WARMUP_ROUNDS) addSample(name, msPerTile);
            }
            for (const [name, materialize] of Object.entries(lazyPhases)) {
                const msPerTile = timeLazyPhase(materialize);
                if (round >= WARMUP_ROUNDS) addSample(name, msPerTile);
            }
        }

        const result: Record<string, number> = {};
        for (const [name, values] of Object.entries(samples)) result[name] = median(values);
        result["column walk (derived)"] = result[DECODE_PHASE] - result.metadata;
        result["end to end"] = result[DECODE_PHASE] + result.ids + result.geometry + result.properties;

        // Allocated and retained memory of a full decode.
        await settleHeap();
        const allocatedBefore = v8.getHeapStatistics().total_allocated_bytes;
        for (const tile of tiles) decodeAllColumns(decodeTile(tile.bytes));
        result["full decode alloc KB"] =
            (v8.getHeapStatistics().total_allocated_bytes - allocatedBefore) / tiles.length / 1024;

        await settleHeap();
        const baseline = retainedBytes();
        const heldTiles = tiles.map((tile) => {
            const featureTables = decodeTile(tile.bytes);
            decodeAllColumns(featureTables);
            return featureTables;
        });
        await settleHeap();
        result["full decode retained KB"] = (retainedBytes() - baseline) / tiles.length / 1024;

        // Retained memory after releaseDecodedColumns(), and the cost of decoding everything again.
        const releaseStart = performance.now();
        for (const featureTables of heldTiles) {
            for (const featureTable of featureTables) featureTable.releaseDecodedColumns();
        }
        result["release ms"] = (performance.now() - releaseStart) / tiles.length;
        await settleHeap();
        result["after release retained KB"] = (retainedBytes() - baseline) / tiles.length / 1024;

        const redecodePasses: number[] = [];
        for (let pass = 0; pass < 15; pass++) {
            for (const featureTables of heldTiles) {
                for (const featureTable of featureTables) featureTable.releaseDecodedColumns();
            }
            const start = performance.now();
            for (const featureTables of heldTiles) decodeAllColumns(featureTables);
            redecodePasses.push((performance.now() - start) / tiles.length);
        }
        result["re-decode after release ms"] = median(redecodePasses);
        heldTiles.length = 0;

        console.log(`\n${tiles.length} tiles from ${tilesDir}, ${ROUNDS} rounds x ${ITERS} iters, median per tile`);
        for (const [name, value] of Object.entries(result)) {
            console.log(`  ${name.padEnd(38)} ${value.toFixed(4)}`);
        }

        if (process.env.BENCH_OUT) {
            const line = {
                date: new Date().toISOString(),
                tilesDir,
                tiles: tiles.length,
                rounds: ROUNDS,
                iters: ITERS,
                result,
            };
            fs.appendFileSync(process.env.BENCH_OUT, `${JSON.stringify(line)}\n`);
        }
    },
    600_000,
);
