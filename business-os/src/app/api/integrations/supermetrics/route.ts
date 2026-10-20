import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { smQuery } from '@/lib/supermetrics';

export const maxDuration = 150;

/** Legacy connector shape: {tool:"data_query", input} → {payload:{success, data}} */
export const POST = handle(async (req: Request) => {
  await needPrincipal(req);
  const { tool, input } = await req.json();
  if (tool !== 'data_query') return json({ payload: { success: false, error: 'Unsupported tool ' + tool } });
  try {
    return json({ payload: { success: true, data: await smQuery(input) } });
  } catch (e) {
    const x = e as { code?: string; message?: string };
    return json({ error: { code: x.code || 'tool_error', message: x.message } }, x.code === 'server_not_connected' ? 503 : 502);
  }
});
