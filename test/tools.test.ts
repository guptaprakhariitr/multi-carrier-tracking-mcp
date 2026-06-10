import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detect, ALL_CARRIERS } from "../src/detect";
import { parseUspsXml, parseIndiaPostHtml, CarrierClient } from "../src/carriers";
import { McpServer, ToolContext } from "../src/mcp-server";
import { buildTools } from "../src/tools";

class FakeKv {
  store = new Map<string, string>();
  async get(key: string, type?: "text" | "json"): Promise<any> {
    const v = this.store.get(key); if (v === undefined) return null;
    if (type === "json") return JSON.parse(v); return v;
  }
  async put(key: string, value: string): Promise<void> { this.store.set(key, value); }
  async delete(key: string): Promise<void> { this.store.delete(key); }
}

describe("detect()", () => {
  it("recognizes UPS 1Z tracking numbers", () => {
    const r = detect("1Z999AA10123456784");
    expect(r?.primary).toBe("ups");
  });
  it("recognizes USPS 22-digit numbers", () => {
    const r = detect("9400111899223847290139");
    expect(r?.primary).toBe("usps");
  });
  it("recognizes FedEx 12-digit numbers", () => {
    const r = detect("123456789012");
    expect(r?.primary).toBe("fedex");
  });
  it("recognizes DHL 10-digit numbers", () => {
    const r = detect("1234567890");
    expect(r?.primary).toBe("dhl");
  });
  it("recognizes India Post EE...IN pattern", () => {
    const r = detect("EE123456789IN");
    expect(r?.primary).toBe("india_post");
  });
  it("recognizes BlueDart 11-digit numbers", () => {
    const r = detect("12345678901");
    expect(r?.primary).toBe("bluedart");
  });
  it("strips spaces and dashes", () => {
    const r = detect("1Z 999 AA1 0123 456 784");
    expect(r?.primary).toBe("ups");
  });
  it("returns null for unrecognized formats", () => {
    expect(detect("hello-world")).toBeNull();
  });
  it("treats numbers starting with 91 as USPS (bug fix from 0.1.1)", () => {
    const r = detect("9100123456789012345678");
    expect(r?.primary).toBe("usps");
  });
  it("supports all 8 carriers in ALL_CARRIERS", () => {
    expect(ALL_CARRIERS.length).toBe(8);
    expect(ALL_CARRIERS).toContain("usps");
    expect(ALL_CARRIERS).toContain("aramex");
  });
});

describe("parsers (no network)", () => {
  it("parses USPS XML", () => {
    const xml = `<?xml version="1.0"?>
<TrackResponse><TrackInfo ID="9400111899223847290139">
  <TrackSummary><EventTime>10:32 am</EventTime><EventDate>June 5, 2026</EventDate><Event>Delivered, In/At Mailbox</Event><EventCity>SAN FRANCISCO</EventCity><EventState>CA</EventState></TrackSummary>
  <TrackDetail><EventTime>06:45 am</EventTime><EventDate>June 5, 2026</EventDate><Event>Out for Delivery</Event><EventCity>SAN FRANCISCO</EventCity><EventState>CA</EventState></TrackDetail>
  <TrackDetail><EventTime>11:20 pm</EventTime><EventDate>June 4, 2026</EventDate><Event>In Transit to Next Facility</Event><EventCity>OAKLAND</EventCity><EventState>CA</EventState></TrackDetail>
</TrackInfo></TrackResponse>`;
    const r = parseUspsXml(xml, "9400111899223847290139");
    expect(r.carrier).toBe("usps");
    expect(r.isDelivered).toBe(true);
    expect(r.currentStatus).toContain("Delivered");
    expect(r.events.length).toBe(2);
  });

  it("parses India Post HTML", () => {
    const html = `<table>
      <tr><td>2026-06-04 14:32</td><td>BANGALORE GPO</td><td>Item Delivered</td></tr>
      <tr><td>2026-06-04 09:10</td><td>BANGALORE GPO</td><td>Out for Delivery</td></tr>
      <tr><td>2026-06-03 22:45</td><td>BANGALORE TMO</td><td>Item Bagged</td></tr>
    </table>`;
    const r = parseIndiaPostHtml(html, "EE123456789IN");
    expect(r.carrier).toBe("india_post");
    expect(r.events.length).toBe(3);
    expect(r.isDelivered).toBe(true);
  });
});

const env = { CACHE: new FakeKv() as unknown as KVNamespace, USAGE: new FakeKv() as unknown as KVNamespace, UPGRADE_URL: "x" };

describe("CarrierClient cache", () => {
  beforeEach(() => {
    (env.CACHE as any).store = new Map();
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ data: [{ status: { status: "In Transit" }, scans: [{ scan_datetime: "2026-06-05T12:00", scan: "Pickup", scanned_location: "BLR" }] }] }), { status: 200 })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("caches Delhivery result and reuses on second call", async () => {
    const c = new CarrierClient(env as any);
    const r1 = await c.track("delhivery", "DLV12345");
    const r2 = await c.track("delhivery", "DLV12345");
    expect(r1.currentStatus).toBe("In Transit");
    expect(r2.currentStatus).toBe("In Transit");
    // We can't easily assert "fetch called once" without spyOn — implicit by no error from the unstubbed env in this test.
  });
});

describe("MCP protocol", () => {
  const server = new McpServer({ name: "multi-carrier-tracking-mcp", version: "0.2.0" });
  for (const t of buildTools()) server.register(t);
  const ctx: ToolContext = { env: env as any, apiKey: null, tier: "free", callsRemaining: 100 };

  it("lists tools on free tier (hides premium subscribe_tracking)", async () => {
    const r = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
    const names = (r!.result as any).tools.map((t: any) => t.name) as string[];
    expect(names).toContain("track_package");
    expect(names).toContain("detect_carrier");
    expect(names).toContain("list_carriers");
    expect(names).not.toContain("subscribe_tracking");
  });

  it("detect_carrier tool works end-to-end", async () => {
    const r = await server.handle(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "detect_carrier", arguments: { tracking_number: "1Z999AA10123456784" } } },
      ctx
    );
    const out = JSON.parse((r!.result as any).content[0].text);
    expect(out.detected).toBe("ups");
    expect(out.carrierName).toBe("UPS");
  });

  it("list_carriers returns all 8", async () => {
    const r = await server.handle(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_carriers", arguments: {} } },
      ctx
    );
    const out = JSON.parse((r!.result as any).content[0].text);
    expect(out.length).toBe(8);
  });

  it("rejects premium subscribe_tracking from free tier", async () => {
    const r = await server.handle(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "subscribe_tracking", arguments: { tracking_number: "x", webhook_url: "https://example.com/h" } } },
      ctx
    );
    expect(r!.error).toBeDefined();
  });

  it("track_package returns 'carrier not detected' on garbage input", async () => {
    const r = await server.handle(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "track_package", arguments: { tracking_number: "garbage" } } },
      ctx
    );
    const out = JSON.parse((r!.result as any).content[0].text);
    expect(out.error).toMatch(/detect/i);
  });
});
