# How to publish tariffmonitor-mcp

Two steps. Takes ~5 minutes.

## Step 1: Publish to npm

```bash
cd /root/mcp-servers/tariffmonitor-mcp
npm publish --access public --otp=<YOUR_2FA_CODE>
```

Get the OTP from your authenticator app. The package is already configured correctly.

After publish, it will be live at: https://www.npmjs.com/package/tariffmonitor-mcp

## Step 2: Submit to MCP registry (modelcontextprotocol/servers)

The registry accepts PRs adding a metadata file. After npm publish:

1. Fork https://github.com/modelcontextprotocol/servers on GitHub
2. Add the file at `src/tariffmonitor/README.md` (see content below), OR
3. Edit `src/README.md` to add the entry in the community servers section

**The manifest entry** (add to the servers list in their README or registry YAML):

```
### Tariff Monitor

**tariffmonitor-mcp** — US import tariff calculator for Claude Desktop and Cursor.

- `lookup_hts_code` — Search 19,856 HTS codes by description
- `calculate_tariff` — Full stacked rate (MFN + Section 301 + IEEPA + reciprocal) + Nov 10, 2026 cliff projection

No API key required. Free.

Install: add to `claude_desktop_config.json`:
{"mcpServers": {"tariffmonitor": {"command": "npx", "args": ["-y", "tariffmonitor-mcp"]}}}

npm: https://www.npmjs.com/package/tariffmonitor-mcp
```

**Alternative: pulsemcp.com and glama.ai**

Both aggregate MCP servers and have submission forms. After npm publish, submit at:
- https://glama.ai/mcp/servers/submit
- https://pulsemcp.com/submit (if available)

These get indexed faster than waiting for a GitHub PR merge.
