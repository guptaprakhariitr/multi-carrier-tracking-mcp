// Per-carrier tracking clients.
// Open-source thin wrappers. Production retries / rate-limit handling lives in
// the private repo; this file is enough to demonstrate the surface.

import { Carrier } from "./detect";
import { KvCache } from "./cache";

export interface TrackingEvent {
  ts: string;                    // ISO datetime
  status: string;                // e.g. "In Transit", "Out for Delivery", "Delivered"
  location?: string;             // city / facility
  raw?: string;                  // upstream's verbatim description
}

export interface TrackingResult {
  carrier: Carrier;
  trackingNumber: string;
  currentStatus: string;
  isDelivered: boolean;
  estimatedDelivery?: string;    // ISO date if known
  events: TrackingEvent[];
  sourceUrl?: string;
}

export interface CarrierEnv {
  CACHE: KVNamespace;
  USPS_USER_ID?: string;
  UPS_CLIENT_ID?: string;
  UPS_CLIENT_SECRET?: string;
  FEDEX_CLIENT_ID?: string;
  FEDEX_CLIENT_SECRET?: string;
  DHL_API_KEY?: string;
}

const cacheTTL = (status: string): number => {
  if (/out for delivery|delivered/i.test(status)) return 300;      // 5 min
  if (/in transit|accepted/i.test(status))        return 60 * 60;  // 1 hr
  return 60 * 30;                                                  // 30 min default
};

export class CarrierClient {
  private cache: KvCache;
  constructor(private env: CarrierEnv) { this.cache = new KvCache(env.CACHE, "track"); }

  async track(carrier: Carrier, trackingNumber: string): Promise<TrackingResult> {
    const key = `${carrier}:${trackingNumber}`;
    const cached = await this.cache.get<TrackingResult>(key);
    if (cached) return cached;
    const fresh = await this.fetchFresh(carrier, trackingNumber);
    await this.cache.set(key, fresh, cacheTTL(fresh.currentStatus));
    return fresh;
  }

  private async fetchFresh(carrier: Carrier, tn: string): Promise<TrackingResult> {
    switch (carrier) {
      case "usps":       return this.trackUsps(tn);
      case "ups":        return this.trackUps(tn);
      case "fedex":      return this.trackFedex(tn);
      case "dhl":        return this.trackDhl(tn);
      case "india_post": return this.trackIndiaPost(tn);
      case "delhivery":  return this.trackDelhivery(tn);
      case "bluedart":   return this.trackBluedart(tn);
      case "aramex":     return this.trackAramex(tn);
    }
  }

  // ── Per-carrier implementations ──────────────────────────────────────────
  // These are simplified — each upstream has its own auth flow and pagination.
  // Production logic (token refresh, retries) lives in the private repo.

  private async trackUsps(tn: string): Promise<TrackingResult> {
    if (!this.env.USPS_USER_ID) throw new Error("USPS_USER_ID not configured");
    const xml = `<TrackFieldRequest USERID="${this.env.USPS_USER_ID}"><TrackID ID="${tn}"></TrackID></TrackFieldRequest>`;
    const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=TrackV2&XML=${encodeURIComponent(xml)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`USPS upstream ${r.status}`);
    const body = await r.text();
    return parseUspsXml(body, tn);
  }

  private async trackUps(tn: string): Promise<TrackingResult> {
    const token = await this.upsToken();
    const r = await fetch(`https://onlinetools.ups.com/api/track/v1/details/${tn}`, {
      headers: { Authorization: `Bearer ${token}`, transId: crypto.randomUUID(), transactionSrc: "mcp" },
    });
    if (!r.ok) throw new Error(`UPS upstream ${r.status}`);
    const json = await r.json() as any;
    const shipment = json?.trackResponse?.shipment?.[0]?.package?.[0];
    const activity = shipment?.activity ?? [];
    return {
      carrier: "ups", trackingNumber: tn,
      currentStatus: shipment?.currentStatus?.description ?? "Unknown",
      isDelivered: /delivered/i.test(shipment?.currentStatus?.description ?? ""),
      events: activity.map((a: any) => ({
        ts: `${a.date}T${a.time}`,
        status: a.status?.description ?? "",
        location: [a.location?.address?.city, a.location?.address?.country].filter(Boolean).join(", "),
        raw: a.status?.description,
      })),
      sourceUrl: `https://www.ups.com/track?tracknum=${tn}`,
    };
  }

  private async upsToken(): Promise<string> {
    return this.cache.memoize("ups-token", 60 * 50, async () => {
      const r = await fetch("https://onlinetools.ups.com/security/v1/oauth/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${this.env.UPS_CLIENT_ID}:${this.env.UPS_CLIENT_SECRET}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (!r.ok) throw new Error(`UPS token ${r.status}`);
      const j = await r.json() as any;
      return j.access_token as string;
    });
  }

  private async trackFedex(tn: string): Promise<TrackingResult> {
    const token = await this.fedexToken();
    const r = await fetch("https://apis.fedex.com/track/v1/trackingnumbers", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ includeDetailedScans: true, trackingInfo: [{ trackingNumberInfo: { trackingNumber: tn } }] }),
    });
    if (!r.ok) throw new Error(`FedEx upstream ${r.status}`);
    const json = await r.json() as any;
    const td = json?.output?.completeTrackResults?.[0]?.trackResults?.[0];
    return {
      carrier: "fedex", trackingNumber: tn,
      currentStatus: td?.latestStatusDetail?.description ?? "Unknown",
      isDelivered: td?.latestStatusDetail?.code === "DL",
      estimatedDelivery: td?.estimatedDeliveryTimeWindow?.window?.ends,
      events: (td?.scanEvents ?? []).map((e: any) => ({
        ts: e.date, status: e.eventDescription,
        location: [e.scanLocation?.city, e.scanLocation?.countryCode].filter(Boolean).join(", "),
      })),
      sourceUrl: `https://www.fedex.com/fedextrack/?trknbr=${tn}`,
    };
  }

  private async fedexToken(): Promise<string> {
    return this.cache.memoize("fedex-token", 60 * 50, async () => {
      const r = await fetch("https://apis.fedex.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=client_credentials&client_id=${this.env.FEDEX_CLIENT_ID}&client_secret=${this.env.FEDEX_CLIENT_SECRET}`,
      });
      if (!r.ok) throw new Error(`FedEx token ${r.status}`);
      const j = await r.json() as any;
      return j.access_token as string;
    });
  }

  private async trackDhl(tn: string): Promise<TrackingResult> {
    if (!this.env.DHL_API_KEY) throw new Error("DHL_API_KEY not configured");
    const r = await fetch(`https://api-eu.dhl.com/track/shipments?trackingNumber=${tn}`, {
      headers: { "DHL-API-Key": this.env.DHL_API_KEY },
    });
    if (!r.ok) throw new Error(`DHL upstream ${r.status}`);
    const json = await r.json() as any;
    const shipment = json?.shipments?.[0];
    return {
      carrier: "dhl", trackingNumber: tn,
      currentStatus: shipment?.status?.description ?? "Unknown",
      isDelivered: shipment?.status?.statusCode === "delivered",
      events: (shipment?.events ?? []).map((e: any) => ({
        ts: e.timestamp, status: e.description ?? e.statusCode, location: e.location?.address?.addressLocality,
      })),
      sourceUrl: `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`,
    };
  }

  private async trackIndiaPost(tn: string): Promise<TrackingResult> {
    // India Post has no clean public API; their consumer page uses a backing
    // JSON endpoint. Production uses a queue + retry; this is the surface.
    const r = await fetch(`https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?artconsign=${tn}`);
    const body = await r.text();
    return parseIndiaPostHtml(body, tn);
  }

  private async trackDelhivery(tn: string): Promise<TrackingResult> {
    const r = await fetch(`https://dlv-api.delhivery.com/v3/unified-tracking?wbn=${tn}`);
    if (!r.ok) throw new Error(`Delhivery upstream ${r.status}`);
    const json = await r.json() as any;
    const s = json?.data?.[0];
    return {
      carrier: "delhivery", trackingNumber: tn,
      currentStatus: s?.status?.status ?? "Unknown",
      isDelivered: s?.status?.status === "Delivered",
      estimatedDelivery: s?.eddPromise,
      events: (s?.scans ?? []).map((scan: any) => ({
        ts: scan.scan_datetime, status: scan.scan, location: scan.scanned_location,
      })),
      sourceUrl: `https://www.delhivery.com/track/package/${tn}`,
    };
  }

  private async trackBluedart(tn: string): Promise<TrackingResult> {
    // BlueDart's API requires a B2B license; consumer page is the fallback.
    return {
      carrier: "bluedart", trackingNumber: tn,
      currentStatus: "BlueDart B2B API not configured. See https://www.bluedart.com/tracking",
      isDelivered: false, events: [],
      sourceUrl: `https://www.bluedart.com/tracking?trackFor=0&trackNo=${tn}`,
    };
  }

  private async trackAramex(tn: string): Promise<TrackingResult> {
    const r = await fetch("https://www.aramex.com/api/track-shipments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumbers: [tn] }),
    });
    if (!r.ok) throw new Error(`Aramex upstream ${r.status}`);
    const json = await r.json() as any;
    const updates = json?.TrackingResults?.[0]?.value ?? [];
    return {
      carrier: "aramex", trackingNumber: tn,
      currentStatus: updates[0]?.UpdateDescription ?? "Unknown",
      isDelivered: /delivered/i.test(updates[0]?.UpdateDescription ?? ""),
      events: updates.map((u: any) => ({ ts: u.UpdateDateTime, status: u.UpdateDescription, location: u.UpdateLocation })),
      sourceUrl: `https://www.aramex.com/track/results?ShipmentNumber=${tn}`,
    };
  }
}

// ── Parsers (broken out for unit testing without network) ───────────────────

export function parseUspsXml(xml: string, tn: string): TrackingResult {
  // USPS returns a TrackResponse with TrackInfo/TrackSummary/TrackDetail tags.
  // A real parser uses XML; for the public shim we use regex to keep deps zero.
  const summaryMatch = xml.match(/<TrackSummary>(.*?)<\/TrackSummary>/s);
  const detailMatches = [...xml.matchAll(/<TrackDetail>(.*?)<\/TrackDetail>/gs)];
  const events: TrackingEvent[] = [];
  for (const m of detailMatches) {
    const txt = m[1];
    const t = (txt.match(/<EventTime>(.*?)<\/EventTime>/)?.[1] ?? "") + " " +
              (txt.match(/<EventDate>(.*?)<\/EventDate>/)?.[1] ?? "");
    events.push({
      ts: t.trim(),
      status: txt.match(/<Event>(.*?)<\/Event>/)?.[1] ?? "",
      location: [txt.match(/<EventCity>(.*?)<\/EventCity>/)?.[1], txt.match(/<EventState>(.*?)<\/EventState>/)?.[1]].filter(Boolean).join(", "),
    });
  }
  const summary = summaryMatch?.[1] ?? "";
  const currentStatus = summary.match(/<Event>(.*?)<\/Event>/)?.[1] ?? events[0]?.status ?? "Unknown";
  return {
    carrier: "usps", trackingNumber: tn,
    currentStatus, isDelivered: /delivered/i.test(currentStatus),
    events,
    sourceUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`,
  };
}

export function parseIndiaPostHtml(html: string, tn: string): TrackingResult {
  // India Post's tracking returns an HTML table; we extract by row pattern.
  const rowMatches = [...html.matchAll(/<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>/g)];
  const events: TrackingEvent[] = rowMatches.map((m) => ({
    ts: m[1].trim(),
    status: m[3].trim(),
    location: m[2].trim(),
  }));
  return {
    carrier: "india_post", trackingNumber: tn,
    currentStatus: events[0]?.status ?? "Unknown",
    isDelivered: /delivered/i.test(events[0]?.status ?? ""),
    events,
    sourceUrl: `https://www.indiapost.gov.in/vas/Pages/trackconsignment.aspx`,
  };
}
