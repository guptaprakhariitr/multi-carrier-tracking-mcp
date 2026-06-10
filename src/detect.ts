// Tracking-number carrier detection.
// Open-source — the regex table itself is a public reference.

export type Carrier =
  | "usps"
  | "ups"
  | "fedex"
  | "dhl"
  | "india_post"
  | "delhivery"
  | "bluedart"
  | "aramex";

interface DetectionRule {
  carrier: Carrier;
  pattern: RegExp;
  priority: number; // higher = more specific; resolves ambiguity
}

// Patterns lifted from each carrier's public docs. Several formats overlap
// (e.g. USPS and FedEx both have 20-digit codes); we use priority + tie-breakers.
const RULES: DetectionRule[] = [
  // UPS: 1Z + 16 chars; very distinctive.
  { carrier: "ups", pattern: /^1Z[0-9A-Z]{16}$/i, priority: 100 },

  // India Post Speedpost / Registered: 13 chars, [A-Z]{2}\d{9}[A-Z]{2} (often EE...IN, EH...IN).
  { carrier: "india_post", pattern: /^[A-Z]{2}\d{9}[A-Z]{2}$/, priority: 95 },

  // DHL: 10 digit OR 11 digit, but distinguish from FedEx-12 below.
  { carrier: "dhl", pattern: /^\d{10}$/, priority: 90 },

  // BlueDart: 11-digit AWB.
  { carrier: "bluedart", pattern: /^\d{11}$/, priority: 85 },

  // FedEx: 12, 15, 20 digit (most common 12).
  { carrier: "fedex", pattern: /^\d{12}$/, priority: 80 },
  { carrier: "fedex", pattern: /^\d{15}$/, priority: 80 },
  { carrier: "fedex", pattern: /^\d{20}$/, priority: 70 },

  // Delhivery: 12-14 digit, alphanumeric with letters allowed.
  { carrier: "delhivery", pattern: /^\d{12,14}$/, priority: 65 },

  // Aramex: 10-12 digit numeric or starts with 1, alphanumeric variations.
  { carrier: "aramex", pattern: /^\d{9,12}$/, priority: 60 },

  // USPS: 20 digit, or 22 digit, or starts with "94"/"93"/"92".
  //   Bug fix 0.1.1: numbers starting with 91 are USPS, not legacy UPS InfoNotice.
  { carrier: "usps", pattern: /^9[1234]\d{18}$/, priority: 75 },
  { carrier: "usps", pattern: /^\d{22}$/, priority: 50 },
  { carrier: "usps", pattern: /^\d{20}$/, priority: 40 },

  // Generic catchall: 20-digit FedEx wins over USPS-20 due to priority 70 > 40.
];

export interface DetectionResult {
  primary: Carrier;
  candidates: Carrier[]; // all matching, sorted by priority
}

export function detect(trackingNumber: string): DetectionResult | null {
  const tn = trackingNumber.replace(/\s|-/g, "").toUpperCase();
  const matches: { carrier: Carrier; priority: number }[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(tn) && !matches.find((m) => m.carrier === rule.carrier)) {
      matches.push({ carrier: rule.carrier, priority: rule.priority });
    }
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.priority - a.priority);
  return {
    primary: matches[0].carrier,
    candidates: matches.map((m) => m.carrier),
  };
}

export const ALL_CARRIERS: Carrier[] = [
  "usps", "ups", "fedex", "dhl", "india_post", "delhivery", "bluedart", "aramex",
];

export const CARRIER_DISPLAY: Record<Carrier, { name: string; country: string }> = {
  usps:       { name: "USPS",          country: "US" },
  ups:        { name: "UPS",           country: "US" },
  fedex:      { name: "FedEx",         country: "US" },
  dhl:        { name: "DHL Express",   country: "DE" },
  india_post: { name: "India Post",    country: "IN" },
  delhivery:  { name: "Delhivery",     country: "IN" },
  bluedart:   { name: "BlueDart",      country: "IN" },
  aramex:     { name: "Aramex",        country: "AE" },
};
