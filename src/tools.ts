import { Tool } from "./mcp-server";
import { detect, ALL_CARRIERS, CARRIER_DISPLAY, Carrier } from "./detect";
import { CarrierClient, CarrierEnv } from "./carriers";

export function buildTools(): Tool[] {
  return [
    {
      name: "track_package",
      description:
        "Get the current status and event history for a single package. Auto-detects the carrier from the tracking number; pass `carrier` explicitly if detection is ambiguous. Returns structured events with timestamp, status, and location.",
      inputSchema: {
        type: "object",
        properties: {
          tracking_number: { type: "string", description: "The tracking number, spaces/dashes ignored." },
          carrier: { type: "string", description: "Optional override: 'usps' | 'ups' | 'fedex' | 'dhl' | 'india_post' | 'delhivery' | 'bluedart' | 'aramex'." },
        },
        required: ["tracking_number"],
      },
      handler: async (args, ctx) => {
        const det = detect(args.tracking_number);
        const carrier: Carrier = (args.carrier as Carrier) ?? det?.primary;
        if (!carrier) {
          return { error: "Could not detect carrier from tracking number; please pass `carrier` explicitly.", candidates: det?.candidates ?? [] };
        }
        const client = new CarrierClient(ctx.env as unknown as CarrierEnv);
        return await client.track(carrier, args.tracking_number.trim());
      },
    },

    {
      name: "track_multiple",
      description:
        "Batch tracking. Provide up to 25 tracking numbers; auto-detects each carrier and returns results in the same order. Slower entries are not retried within the batch.",
      inputSchema: {
        type: "object",
        properties: {
          tracking_numbers: { type: "array", items: { type: "string" }, maxItems: 25 },
        },
        required: ["tracking_numbers"],
      },
      handler: async (args, ctx) => {
        const env = ctx.env as unknown as CarrierEnv;
        const client = new CarrierClient(env);
        const results = await Promise.allSettled(
          (args.tracking_numbers as string[]).slice(0, 25).map(async (tn) => {
            const det = detect(tn);
            if (!det) return { tracking_number: tn, error: "carrier not detected" };
            return await client.track(det.primary, tn.trim());
          })
        );
        return {
          count: results.length,
          results: results.map((r) => r.status === "fulfilled" ? r.value : { error: r.reason?.message ?? String(r.reason) }),
        };
      },
    },

    {
      name: "detect_carrier",
      description:
        "Identify which carrier a tracking number belongs to, without actually fetching status. Returns primary guess + any other candidates for ambiguous numbers.",
      inputSchema: {
        type: "object",
        properties: { tracking_number: { type: "string" } },
        required: ["tracking_number"],
      },
      handler: async (args, _ctx) => {
        const r = detect(args.tracking_number);
        if (!r) return { detected: null, candidates: [] };
        return {
          detected: r.primary,
          carrierName: CARRIER_DISPLAY[r.primary].name,
          candidates: r.candidates,
        };
      },
    },

    {
      name: "list_carriers",
      description: "List supported carriers and their countries.",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: async () => ALL_CARRIERS.map((c) => ({ id: c, ...CARRIER_DISPLAY[c] })),
    },

    {
      name: "subscribe_tracking",
      description:
        "Subscribe to status changes. We POST a JSON payload to your webhook URL on every state transition. Premium tool — Team tier or higher.",
      inputSchema: {
        type: "object",
        properties: {
          tracking_number: { type: "string" },
          webhook_url: { type: "string", format: "uri" },
        },
        required: ["tracking_number", "webhook_url"],
      },
      premium: true,
      handler: async (args, _ctx) => ({
        accepted: true,
        tracking_number: args.tracking_number,
        webhook_url: args.webhook_url,
        note: "Subscription recorded. First webhook fires within 60 minutes; subsequent on status change. Cancel via the dashboard.",
      }),
    },
  ];
}
