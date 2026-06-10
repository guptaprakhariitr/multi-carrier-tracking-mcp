# Changelog

## [0.3.0] — 2026-06-10

### Changed
- **Billing migrated to Dodo Payments** (was: planned Stripe). Merchant-of-Record model — Dodo handles VAT/GST/sales-tax remittance worldwide on our behalf, lifting tax compliance off the operator.
- Env vars: `STRIPE_*` → `DODO_API_KEY` / `DODO_WEBHOOK_SECRET`. New `[vars]`: `DODO_PRODUCT_ID_{SOLO,TEAM,PRO}`, `PRODUCT_NAME`, `FROM_EMAIL`.

### Added
- `GET /upgrade?tier=…` — creates a Dodo hosted checkout link, 302s to it.
- `GET /account` — returns the caller's key + tier + Dodo customer-portal link (requires `Authorization: Bearer …`).
- `POST /webhooks/dodo` — verifies Standard-Webhooks signature (HMAC-SHA256 + 5-minute replay window), mints API keys on `subscription.active`, downgrades on cancellation/failure, idempotent on retries.
- `src/dodo.ts`, `src/webhook.ts`, `src/checkout.ts` — vendored shim, identical across all Category-1 products.
- `mintApiKey()`, `updateKeyStatus()`, `getKeyBySubscription()` in `auth.ts`.
- `KeyRecord.status` field — tracks `active` / `cancelled` / `past_due`.
- Optional Resend integration: API key emailed to the customer on subscription start.


## [0.2.0] — 2026-06-09

### Added
- `detect_carrier` and `list_carriers` tools exposed.
- BlueDart and Aramex carrier clients.
- Multi-carrier fallback when detection is ambiguous (parallel-fetch with first non-404 wins).

### Changed
- Detection regex table moved to `src/detect.ts` and now covers 8 carriers (up from 5 in 0.1.0).

## [0.1.1] — 2026-05-28

### Fixed
- USPS tracking numbers starting with `91` were misclassified as UPS due to overlap with old UPS InfoNotice. Added carrier-disambiguation via prefix priority.
- DHL "Delivered" events without a recipient name no longer crash the parser.

## [0.1.0] — 2026-05-14

### Added
- Initial release. Tools: `track_package`, `track_multiple`.
- Carriers: USPS, UPS, FedEx, DHL, India Post, Delhivery.
- Detection by tracking-number regex pattern.
- KV cache with 5-min TTL for "out for delivery" and 1-hr for "in transit".
