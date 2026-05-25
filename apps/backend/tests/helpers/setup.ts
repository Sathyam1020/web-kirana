// Global setup: assertion of test-mode env, single shared agent.
// Tests use phone numbers prefixed with `+TEST-` (after normalize: `+TEST...`
// is impossible because TEST has letters) — so we use `+99TEST00*` instead,
// which normalize() converts to `+9900*` (T/E/S/T stripped as non-digits).
//
// We rely on cleanup() in helpers/factories.ts to remove every user this run
// created. We do NOT truncate the DB because Phase 1 seed rows are shared.

import "dotenv/config"
