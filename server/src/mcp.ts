/**
 * MCP transport for the Alexandria server.
 *
 * Exists because claude.ai's remote-trigger runtime egress proxy blocks
 * mcp.mowinckel.ai for plain HTTPS but allows traffic to URLs configured
 * as `mcp_connections` on the trigger. Routes that need to be callable
 * from a remote trigger get an MCP tool wrapper here; the wrapper forwards
 * to the existing HTTP route so the route stays the source of truth.
 *
 * Tools exposed: brief, nudge. (signal/feedback are POSTed from the local
 * shim which has its own allowlist mechanism — no MCP wrapper needed.)
 */

import type { Hono } from 'hono';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

const TOOLS = [
  {
    name: 'brief',
    description:
      'Send the autoloop heartbeat → morning brief email to the Author. Tool equivalent of POST /brief. ' +
      'Pass `api_key` as a tool argument if the MCP transport does not forward Authorization headers.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: {
          type: 'string',
          description: 'One-line action surface, or "no material change overnight." for a heartbeat-only run.',
        },
        notepad: { type: 'string', description: 'Optional surfaceable notepad signal.' },
        quote: { type: 'string', description: 'Daily rotating short quote.' },
        api_key: {
          type: 'string',
          description: 'Bearer key (alex_…). Optional if Authorization header is forwarded by the MCP client.',
        },
      },
      required: ['brief'],
    },
  },
  {
    name: 'nudge',
    description:
      'Send the daily forward-action nudge email. Tool equivalent of POST /nudge. ' +
      'Pass `api_key` as a tool argument if the MCP transport does not forward Authorization headers.',
    inputSchema: {
      type: 'object',
      properties: {
        nudge: { type: 'string', description: '1–3 concrete actions for today.' },
        quote: { type: 'string' },
        api_key: { type: 'string' },
      },
      required: ['nudge'],
    },
  },
];

const TOOL_ROUTE: Record<string, string> = {
  brief: '/brief',
  nudge: '/nudge',
};

function rpcError(id: any, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

function rpcResult(id: any, result: any) {
  return Response.json({ jsonrpc: '2.0', id: id ?? null, result });
}

export function registerMcp(app: Hono) {
  app.post('/mcp', async (c) => {
    let req: JsonRpcRequest;
    try {
      req = await c.req.json();
    } catch {
      return rpcError(null, -32700, 'Parse error');
    }

    const { id, method, params } = req;

    if (method === 'initialize') {
      return rpcResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'alexandria', version: '1.0' },
      });
    }

    if (method === 'notifications/initialized') {
      // Notifications carry no id and expect no response body.
      return c.body(null, 204);
    }

    if (method === 'tools/list') {
      return rpcResult(id, { tools: TOOLS });
    }

    if (method === 'tools/call') {
      const name = params?.name;
      const args = (params?.arguments ?? {}) as Record<string, any>;
      const route = TOOL_ROUTE[name];
      if (!route) {
        return rpcError(id, -32602, `Unknown tool: ${name}`);
      }

      // Auth: prefer forwarded Authorization header; fall back to api_key in args.
      const headerAuth = c.req.header('Authorization');
      const argKey = typeof args.api_key === 'string' ? args.api_key : undefined;
      const auth = headerAuth || (argKey ? `Bearer ${argKey}` : undefined);
      if (!auth) {
        return rpcResult(id, {
          content: [{ type: 'text', text: 'Unauthorized: pass api_key in arguments or Authorization header' }],
          isError: true,
        });
      }

      // Strip api_key before forwarding to the route handler — it expects the
      // bearer in the header, not in the body.
      const { api_key: _drop, ...forwardBody } = args;

      const url = new URL(c.req.url);
      url.pathname = route;
      url.search = '';

      const innerReq = new Request(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
          'X-Alexandria-Client': 'mcp',
        },
        body: JSON.stringify(forwardBody),
      });

      const innerResp = await app.fetch(innerReq, c.env, c.executionCtx);
      const text = await innerResp.text();

      return rpcResult(id, {
        content: [{ type: 'text', text }],
        isError: !innerResp.ok,
      });
    }

    return rpcError(id, -32601, `Method not found: ${method}`);
  });

  // Health probe for the MCP endpoint — lets ops verify the route is mounted
  // without sending a JSON-RPC request.
  app.get('/mcp', (c) => c.json({ ok: true, transport: 'http+jsonrpc', tools: TOOLS.map((t) => t.name) }));
}
