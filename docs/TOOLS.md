# Tools Reference

## `track_package(tracking_number, carrier?)`

Auto-detects the carrier from the tracking number; returns structured events.

**Input**

| Field | Type | Description |
|---|---|---|
| `tracking_number` | string | The tracking number. Spaces / dashes ignored. |
| `carrier` | string? | Override: `usps` `ups` `fedex` `dhl` `india_post` `delhivery` `bluedart` `aramex`. |

**Output**

```json
{
  "carrier": "ups",
  "trackingNumber": "1Z999AA10123456784",
  "currentStatus": "Out For Delivery",
  "isDelivered": false,
  "estimatedDelivery": "2026-06-09",
  "events": [
    { "ts": "2026-06-09T08:32:00", "status": "Out For Delivery", "location": "San Francisco, US" },
    { "ts": "2026-06-08T22:15:00", "status": "Arrived at Facility", "location": "Oakland, US" }
  ],
  "sourceUrl": "https://www.ups.com/track?tracknum=1Z999AA10123456784"
}
```

## `track_multiple(tracking_numbers[])`

Batch up to 25. Returns one result per input, in order.

## `detect_carrier(tracking_number)`

Detection only — no upstream fetch.

```json
{ "detected": "ups", "carrierName": "UPS", "candidates": ["ups"] }
```

## `list_carriers()`

Returns the 8 supported carriers with country codes.

## `subscribe_tracking(tracking_number, webhook_url)` *(premium)*

Webhook on status change. Team tier or higher.

## Supported carriers + tracking-number patterns

| Carrier | Country | Pattern (rough) | Source API |
|---|---|---|---|
| USPS | US | 20–22 digit, leading 9 | shippingapis.com (free key) |
| UPS | US | `1Z` + 16 chars | onlinetools.ups.com OAuth |
| FedEx | US | 12 / 15 / 20 digit | apis.fedex.com OAuth |
| DHL Express | DE | 10 digit | api-eu.dhl.com (key) |
| India Post | IN | `[A-Z]{2}\d{9}[A-Z]{2}` | indiapost.gov.in (HTML scrape) |
| Delhivery | IN | 12–14 digit | dlv-api.delhivery.com (public) |
| BlueDart | IN | 11 digit | bluedart.com (B2B API required) |
| Aramex | AE | 10–12 digit | aramex.com tracking API |
