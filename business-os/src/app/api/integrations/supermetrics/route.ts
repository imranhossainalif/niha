import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { smQuery } from '@/lib/supermetrics';
import { metaQuery } from '@/lib/metaAds';
import { cfg } from '@/lib/config';

export const maxDuration = 150;

/** Legacy connector shape (the page calls this for FB ads / page / Search Console data): {tool:"data_query", input} → {payload:{success, data}} */
export const POST = handle(async (req: Request) => {
  await needPrincipal(req);
  const { tool, input } = await req.json();
  if (tool !== 'data_query') return json({ payload: { success: false, error: 'Unsupported tool ' + tool } });
  try {
    // Meta's own API (free) for Facebook ads/page data when META_ADS_TOKEN is set; Supermetrics otherwise
    const meta = await metaQuery(input);
    if (meta) return json({ payload: { success: true, data: meta } });
    if (!(await cfg('SUPERMETRICS_API_KEY'))) throw Object.assign(new Error('Set META_ADS_TOKEN (free, Facebook ads/page) or SUPERMETRICS_API_KEY in Admin → Integrations'), { code: 'server_not_connected' });
    return json({ payload: { success: true, data: await smQuery(input) } });
  } catch (e) {
    const x = e as { code?: string; message?: string };
    return json({ error: { code: x.code || 'tool_error', message: x.message } }, x.code === 'server_not_connected' ? 503 : 502);
  }
});
