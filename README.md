# multi-carrier-tracking-mcp — SCAFFOLD

> Auto-detect shipping carrier from a tracking number, return structured tracking events. Wraps USPS, UPS, FedEx, DHL, India Post, Delhivery, BlueDart, Aramex. **Universal pain across every shopping/logistics agent.**

**Status:** scaffolded. Build this second (after `sec-edgar-mcp`). Idea #17 from [`../../../ai-as-customer-ideas.md`](../../../ai-as-customer-ideas.md).

---

## Why this is the warm-up

- No domain edge needed — every dev has hit "the agent couldn't track my package" once.
- Each carrier API is small; the integration cost is in volume (8 carriers), not depth.
- Broad horizontal install — fintech, e-commerce, customer-support agents, personal-life agents.
- Low support load: one input (tracking #), one output (events).

## Planned tools

| Tool | What it does |
|---|---|
| `track_package(tracking_number, carrier?)` | Auto-detect carrier; return latest status + event timeline. |
| `track_multiple(tracking_numbers[])` | Batch (up to 25). |
| `subscribe_tracking(tracking_number, webhook_url)` | Premium tier: webhook on status change. |

## Carrier auto-detection

Each carrier has a tracking-number format signature. Build a regex table — most carriers have unique enough patterns that 90% of detections are deterministic. Fallback: query 2-3 most-likely carriers in parallel and use whichever responds with a non-404.

| Carrier | Pattern (rough) | API |
|---|---|---|
| USPS | 20 or 22 digit | USPS Web Tools (free key) |
| UPS  | 1Z + 16 char | UPS Tracking API (free tier 10k/mo) |
| FedEx| 12, 15, 20 digit | FedEx Track API (free tier) |
| DHL  | 10 digit | DHL Express API (free tier 250/day) |
| India Post | 13-char EE...IN | IndiaPost JSON (scrapable) |
| Delhivery | 12-14 digit | Delhivery public tracking |
| BlueDart | 11-digit | BlueDart public tracking page |

## Pricing (proposed)

| Tier | Price | Calls / mo |
|---|---|---|
| Free | $0 | 100 |
| Solo | $9  | 2,000 |
| Team | $29 | 10,000 (incl. subscribe_tracking) |
| Pro  | $79 | 50,000 |

## Build steps

1. Fork `../sec-edgar-mcp/` to `multi-carrier-tracking-mcp/`.
2. Replace `src/edgar.ts` with `src/carriers/` containing one client per carrier.
3. Build `src/detect.ts` for tracking-number routing.
4. Tests: one fixture per carrier (real shipped packages, anonymize the addressee).
5. Deploy + list on registries.

## Open / closed split

- **Open**: tracking-number regex detection table, carrier list, basic per-carrier client stubs.
- **Closed**: optimized parallel-fallback logic, webhook subscription engine, address-anonymization for shareable links (privacy moat).

## Notes / gotchas

- Several carriers ban "tracking aggregators" in their ToS. Use only carrier-published APIs; do **not** scrape consumer-facing pages.
- USPS and India Post have explicit retail-volume free tiers; commercial use may require their paid tier — read each carrier's ToS line by line before launch.
- Cache aggressively (1h for "in transit", 5min for "out for delivery"). Tracking events are append-only so caching is safe.

## See also

- [`../sec-edgar-mcp/`](../sec-edgar-mcp/) — reference implementation.
- [`../README.md`](../README.md) — Category 1 pipeline.
