# Staged: official MCP registry publish of tariffmonitor-mcp 1.3.1 (with the free remote)

Status 2026-10-25: NOT published to the registry. npm 1.3.1 IS published (same day, from CT150 with the
existing npm token). server.json is bumped to 1.3.1 with a `remotes` entry and passes `mcp-publisher validate`
against registry.modelcontextprotocol.io.

Blocker: `mcp-publisher login github` needs a GitHub device code entered in a browser (the saved JWT expired,
see EXP-005). Nothing else is needed.

Exact commands (CT150):

    cd /root/mcp-servers/tariffmonitor-mcp
    npm view tariffmonitor-mcp@1.3.1 mcpName        # must print io.github.daleweaver1981/tariffmonitor-mcp
    /usr/local/bin/mcp-publisher validate
    /usr/local/bin/mcp-publisher login github       # device code -> github.com/login/device (fleet browser is signed in as daleweaver1981)
    /usr/local/bin/mcp-publisher publish

Verify after:

    curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.daleweaver1981/tariffmonitor-mcp" | grep -o '"version":"1.3.1"\|mcp-free'

What it adds: `remotes: [{type: streamable-http, url: https://adcreator-ai.com/mcp-free}]` next to the npm
stdio package. When it lands, move EXP-tariffmonitor-006's judge date to publish date + 14 days if that is
later than 2026-11-08.
