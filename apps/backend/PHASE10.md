# Phase 10 — Notifications (web-push + WhatsApp + celebration)

Out-of-app notifications + an in-app order-placed celebration. Subscribes to the
same domain events Phase 9 fans out over sockets (`order.placed`,
`order.status_changed`) and turns them into push / WhatsApp messages — services
and controllers are unchanged.

## Recipient × channel matrix

| Event | Owner | Customer |
|---|---|---|
| New order placed | web-push + WhatsApp | in-app celebration (no notification) |
| Customer cancels | web-push + WhatsApp | — |
| Accepted / Out-for-delivery / Delivered | — | web-push |
| Rejected (by owner) | — | web-push |

`dispatch.ts` routes on `order.status_changed`'s `toStatus` + `actorType`: a
customer-caused `CANCELLED` notifies the owner; owner-caused transitions notify
the customer. WhatsApp is owner-only.

## Architecture

- `src/notifications/` — `registerNotifications()` (wired in `server.ts`, NOT
  buildApp, so test suites don't auto-fire) subscribes the bus to `dispatch.ts`.
- Providers no-op gracefully when unconfigured, so the backend boots without
  any creds:
  - `providers/web-push.ts` — `web-push` lib; returns `"gone"` on 404/410 so the
    dispatcher prunes dead subscriptions.
  - `providers/whatsapp.ts` — Graph API template send via `fetch`; writes every
    attempt to the `WhatsAppMessageLog` outbox (PENDING→SENT→FAILED, `waMessageId`
    for receipt correlation). Unconfigured → writes a FAILED row, returns.
- `modules/push/` — `POST/DELETE /v1/push/subscribe` (requireAuth). Upsert keyed
  on the unique endpoint; refuses to rebind another user's endpoint.
- `modules/webhooks/` — `GET/POST /v1/webhooks/whatsapp`, mounted in `app.ts`
  BEFORE `express.json()` with `express.raw({ limit: "100kb" })` so the POST
  signature check sees the untouched body. GET echoes `hub.challenge` (timing-safe
  verify-token compare); POST verifies `X-Hub-Signature-256` (HMAC-SHA256 of raw
  body, timing-safe, fails closed) then advances outbox rows by `waMessageId`
  (forward-only, so a replayed receipt can't regress status).
- Web-push payload `url` is **relative** (`/orders/<id>`) — each app's own SW
  shows the notification, so it resolves against the right origin.

## Frontend

- `packages/auth/useWebPush(vapidPublicKey)` — permission → `PushManager.subscribe`
  → `POST /v1/push/subscribe`. `NotificationToggle` mounted in the customer
  account page and owner settings page (hidden when unsupported / no VAPID key).
- Both `public/sw.js` got `push` + `notificationclick` handlers (click focuses an
  existing window and navigates it, or opens a new one).
- Customer **order-success celebration** (`components/order-success-celebration.tsx`):
  full-screen green wash + self-drawing SVG tick + a synthesized Web Audio chime,
  ~2.5s, then routes to the order page. Replaces the success toast; the checkout's
  empty-cart redirect is guarded so it doesn't race the animation.

## Going live — what you need to set

**Web Push** (self-contained, no external account):
1. `npx web-push generate-vapid-keys`
2. Backend `.env`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (and optionally
   `VAPID_SUBJECT`, default `mailto:dev@kirana.local`).
3. Each app's `.env.local`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<the public key>`.

**WhatsApp** (needs a Meta WhatsApp Business setup):
1. Backend `.env`: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (system-user
   token), `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (any string you pick),
   `WHATSAPP_API_VERSION` (default `v22.0`).
2. Expose the backend publicly (the webhook can't reach localhost). In the Meta
   App dashboard → WhatsApp → Configuration: Callback URL =
   `https://<public-host>/v1/webhooks/whatsapp`, Verify token = your
   `WHATSAPP_VERIFY_TOKEN`; subscribe to the **messages** field.
3. Create + get approved these two UTILITY templates (language `en`). The code
   sends body vars `[customerName, #ORDERID, ₹total]` and a dynamic URL-button
   suffix = the order id:

   **`new_order_owner`**
   - Body: `🛒 New order from {{1}}\n\nOrder {{2}} · {{3}}\n\nTap below to view and accept it.`
   - Button (URL, "View order"): `https://owner.<your-domain>/orders/{{1}}`

   **`order_cancelled_owner`**
   - Body: `⚠️ Order {{2}} from {{1}} ({{3}}) was cancelled by the customer.`
   - Button (URL, "View order"): `https://owner.<your-domain>/orders/{{1}}`

   (Owner WhatsApp link opens in the installed PWA on Android with link-handling
   on, else the browser; iOS always opens the browser — OS behavior, not ours.)

## Security hardening (from the reviewer pass)

- Webhook POST: HMAC verified on the raw body, timing-safe, fails closed; raw
  body capped at 100kb. GET verify-token compare is timing-safe.
- Webhook status updates are forward-only (replay/out-of-order can't regress).
- Push subscribe refuses to rebind an endpoint owned by another user.
- Bearer token / app secret / VAPID private key never logged or sent to clients;
  only the (public) VAPID public key reaches the bundle.
- Authz audit: clean. Deliberately NOT added: a prod env guard requiring WhatsApp
  creds — that would break the "no-op until configured" design.

## Tests — `tests/notifications.test.ts` (11, green against Neon)

Dispatch routing (asserted via the outbox: new order + cancel → owner WhatsApp;
owner-driven ACCEPTED → no WhatsApp), push subscribe/unsubscribe + auth, and the
WhatsApp signature verify (correct / wrong / missing-secret / malformed) +
endpoint negative paths. Dispatch fns are called directly (not via a global bus
subscription) so the suite doesn't pollute other tests.

## Deferred

- WhatsApp outbox **retry worker** (rows are written PENDING/FAILED but not
  auto-retried) — a cron in Phase 11 can sweep FAILED/PENDING.
- WhatsApp **inbound** messages (customer replies) — webhook ignores them.
- Notification **preferences** (per-channel opt-out beyond the browser permission
  + the toggle).
- `WhatsAppMessageLog` **retention/TTL** (it stores recipient phone + body params).
