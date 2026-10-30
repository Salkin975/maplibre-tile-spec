import { defineConfig } from "vitest/config";

// Separate from `npm test`, with a forced GC for the memory measurement.
export default defineConfig({
    test: {
        include: ["src/decodePhases.bench.ts"],
        pool: "forks",
        execArgv: ["--expose-gc"],
        testTimeout: 600_000,
    },
});
