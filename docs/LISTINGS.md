# Registry Submission Checklist — multi-carrier-tracking-mcp

Pre-filled values for every MCP registry. Each submission takes 1–3 minutes in a browser.

## ✅ Already automatic

### Glama — `glama.ai`
Auto-crawls GitHub by repo topic `mcp-server`. Already tagged. Indexes within 24 hours.
- https://glama.ai/mcp/servers?q=multi-carrier-tracking-mcp

### Official MCP Registry
- The `server.json` at this repo's root is the registry manifest.
- Submit via: `mcp-publisher publish server.json` (after `make publisher` and `mcp-publisher login github` in the registry repo).
- Downstream registries (PulseMCP, mcp.so) ingest from here weekly.

## 🌐 Manual browser submission

### PulseMCP — single URL field
- https://www.pulsemcp.com/submit
- **Paste:** `https://github.com/guptaprakhariitr/multi-carrier-tracking-mcp`

### mcp.so — multi-field form
- https://mcp.so/submit
- **Name:** `multi-carrier-tracking-mcp`
- **Display name:** `Package Tracking (8 carriers)`
- **Description:** `Auto-detects USPS, UPS, FedEx, DHL, India Post, Delhivery, BlueDart, Aramex from a tracking number.`
- **GitHub URL:** `https://github.com/guptaprakhariitr/multi-carrier-tracking-mcp`
- **Endpoint URL:** `https://multi-carrier-tracking-mcp.prakhar-cognizance.workers.dev/mcp`
- **Tags:** tracking, usps, ups, fedex, dhl, india-post, delhivery, shipping
- **License:** MIT
- **Transport:** HTTP (remote)

### mcp.directory
- https://mcp.directory/submit
- Same values as mcp.so. Include a demo GIF if you can.

### Smithery (paid — $30/mo)
- https://smithery.ai/new
- Worth it if you have ≥6 paid subscribers.

### Cursor Marketplace
- Submit from Cursor → Settings → Marketplace → Submit. Curated; 1–2 weeks for approval.

## Social

### Show HN
- Title: `Show HN: multi-carrier-tracking-mcp — Package Tracking (8 carriers) as an MCP for Claude / Cursor`
- URL: `https://github.com/guptaprakhariitr/multi-carrier-tracking-mcp`

### Twitter / X thread template
> Just shipped multi-carrier-tracking-mcp — Model Context Protocol server: auto-detects usps, ups, fedex, dhl, india post, delhivery, bluedart, aramex from a tracking number.
>
> Endpoint: https://multi-carrier-tracking-mcp.prakhar-cognizance.workers.dev/mcp
> GitHub: https://github.com/guptaprakhariitr/multi-carrier-tracking-mcp
>
> Free tier available. Paid from $9/mo.
