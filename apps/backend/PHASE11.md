# Phase 11 — Cron jobs

In-process scheduled jobs via `node-cron`, wired in `server.ts`
(`registerJobs()` — never `buildApp()`, so tests don't schedule). Each tick is
guarded: failures are logged (never crash), and a job that's still running skips
its next tick so it can't overlap itself.

> **Single-instance assumption.** In-process scheduling is correct for the MVP
> single-instance deploy. A horizontally-scaled backend needs a distributed lock
> (or an external scheduler hitting an endpoint) or each job runs N times.

## Jobs

| Job | Schedule | What |
|---|---|---|
| auto-cancel stale orders | every 5 min | Cancel orders left in PLACED past the cutoff. |
| whatsapp retry | every 2 min | Re-send transiently-failed WhatsApp outbox rows. |
| availability reset | 05:00 IST daily | Re-enable products for opted-in stores. |

### Auto-cancel stale PLACED orders
`autoCancelStalePlacedOrders(olderThan, limit=200)` (orders.service). Finds PLACED
orders with `placedAt < cutoff`, and per order runs the same guarded
`updateMany WHERE status=PLACED` claim the lifecycle uses (so it can't race an
owner-accept / customer-cancel), writes an `OrderStatusHistory` row
(`actorType=SYSTEM`, `actorUserId=null`), and emits `order.status_changed`. The
dispatcher routes a SYSTEM cancel → **customer** push ("the store didn't accept
in time — you haven't been charged"). Cutoff = `ORDER_AUTO_CANCEL_MINUTES` (env,
default 30).

### WhatsApp outbox retry
`retryFailedWhatsApp(limit=50)` (whatsapp provider). No-ops until WhatsApp is
configured. Selects `FAILED` rows with `attempts < 3` (excluding the "not
configured" rows), **claims each** (`FAILED → PENDING` guarded updateMany) before
re-POSTing the stored payload — so an overlapping/slow tick can't double-send.
The shared `dispatchToGraph` records the outcome.

### Daily availability reset (opt-in)
`resetAvailabilityForOptedInStores()` (stores.service). For stores with
`autoResetAvailability=true` (new column, default false — additive migration),
flips their active products from `isAvailable=false → true`. Opt-in per store via
the owner **Settings** toggle, so no store is surprised by sold-out items
reappearing. (By design this also re-enables items an owner marked out-of-stock —
that's the point of the daily re-check; it only affects stores that turned it on.)

## Schema / migration
- `Store.autoResetAvailability Boolean @default(false)` — additive; the
  `ADD COLUMN ... DEFAULT false` backfills existing rows atomically (safe).
- Generated with `migrate dev --create-only`, hand-stripped the 3 spurious
  PostGIS/pg_trgm `DROP INDEX` lines (the documented gotcha), applied with
  `migrate deploy`.

## Contract / FE
- `StoreOwnerView` + `UpdateStoreBody` gained `autoResetAvailability`; owner
  Settings has a toggle wired to `updateMine`.

## New env
- `ORDER_AUTO_CANCEL_MINUTES` (default 30).

## Tests — `tests/cron.test.ts` (5, green against Neon)
- Auto-cancel: cancels a backdated PLACED order as SYSTEM (with history), leaves
  a recent one, and never touches an already-accepted one.
- Availability reset: re-enables products only for an opted-in store.
- WhatsApp retry: no-ops when unconfigured.

## Reviewer pass (data-integrity)
Migration safe for existing rows; auto-cancel concurrency-correct (history can't
diverge from order status); availability-reset WHERE scoping correct + monotonic.
Fixed the one MEDIUM: the WhatsApp retry now claims rows before dispatch (no
double-send) and cron ticks don't overlap.

## Deferred
- Distributed lock / external scheduler for multi-instance.
- WhatsApp `waMessageId` is overwritten on a successful resend (acceptable —
  Meta has no client idempotency key for messages).
