// Minimal MCP server (streamable HTTP, JSON responses) so Claude can be connected to the live app as a connector.
// Auth: Authorization: Bearer <API key>. Same permissions as the REST API.
import { principalFromApiKey } from '@/lib/apikeys';
import { mcpTools } from '@/lib/mcp';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PROTOCOL = '2025-06-18';
type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: any };
const reply = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

export async function POST(req: Request) {
  const p = await principalFromApiKey(req.headers.get('authorization'));
  if (!p) return new Response(JSON.stringify({ error: 'API key required' }), { status: 401, headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' } });
  let body: Rpc | Rpc[];
  try { body = await req.json(); } catch { return Response.json(fail(null, -32700, 'Parse error'), { status: 400 }); }
  const tools = mcpTools(p);
  const one = async (m: Rpc) => {
    if (m.id === undefined) return null; // notification
    switch (m.method) {
      case 'initialize': return reply(m.id, { protocolVersion: m.params?.protocolVersion || PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'business-os', version: '1.0.0' }, instructions: 'Imran\'s Business OS. Collections are listed in docs/DATA_MODEL.md; use list_collections first. Label analysis FACT vs HYPOTHESIS.' });
      case 'ping': return reply(m.id, {});
      case 'tools/list': return reply(m.id, { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
      case 'tools/call': {
        const t = tools.find((x) => x.name === m.params?.name);
        if (!t) return fail(m.id, -32602, 'Unknown tool');
        try {
          const out = await t.run(m.params?.arguments ?? {});
          return reply(m.id, { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }] });
        } catch (e) {
          return reply(m.id, { isError: true, content: [{ type: 'text', text: (e as Error).message }] });
        }
      }
      default: return fail(m.id, -32601, 'Method not found');
    }
  };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(one))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const out = await one(body);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}

export function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
}
