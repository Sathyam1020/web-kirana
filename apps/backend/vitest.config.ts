import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Sequential by default. Auth tests share a Postgres schema (Neon) and
    // some flows assert global state (rate limiter counters, etc.) that
    // doesn't survive parallelism on a single DB.
    fileParallelism: false,
    sequence: { concurrent: false },

    environment: "node",
    globals: false,
    env: {
      NODE_ENV: "test",
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },

    setupFiles: ["./tests/helpers/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
})
