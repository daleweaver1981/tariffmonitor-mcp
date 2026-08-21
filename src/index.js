#!/usr/bin/env node
// Tariff Exposure Monitor MCP server — stdio transport (Claude Desktop, Cursor).
//
// The tools themselves live in src/tools.js so that src/http.js can serve exactly the same
// behaviour over HTTPS. This file is now only the stdio wiring.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, callTool, SERVER_INFO } from './tools.js';

const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) =>
  callTool(req.params.name, req.params.arguments || {}));

const transport = new StdioServerTransport();
await server.connect(transport);
