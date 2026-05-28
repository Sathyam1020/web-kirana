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
      // Dummy Cloudinary creds so the /uploads/signature endpoints are
      // "configured" in tests and return a valid-shaped signed payload. The
      // signature is computed with this fake secret — tests verify shape +
      // authz, never a real upload (that's manual smoke).
      CLOUDINARY_CLOUD_NAME: "test-cloud",
      CLOUDINARY_API_KEY: "test-key",
      CLOUDINARY_API_SECRET: "test-secret",
      // Wider than the per-request operation cost (~1-2s on Neon) so the
      // within-grace tests pass deterministically, but short enough that
      // the outside-grace test can wait it out without a slow sleep.
      REFRESH_TOKEN_GRACE_MS: "5000",
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
