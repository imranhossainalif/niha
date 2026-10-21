import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { isFull } from '@/lib/access';
import { cfg } from '@/lib/config';

const PII = /name|phone|mobile|address|email|customer|recipient|receiver|area|city|zone|thana|district|note|comment|instruction/i;

/** Field list of one Nuport order with customer details masked (owner/admin only) — to see which fields hold the order source. */
function shape(v: unknown, path: string, out: Record<string, unknown>, depth = 0) {
  if (depth > 5) return;
  if (Array.isArray(v)) { out[path + '[]'] = 'array(' + v.length + ')'; if (v.length) shape(v[0], path + '[0]', out, depth + 1); return; }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) shape(x, path ? path + '.' + k : k, out, depth + 1); return; }
  const key = path.split('.').pop() || '';
  out[path] = PII.test(key) && typeof v === 'string' ? '«hidden»' : typeof v === 'string' ? v.slice(0, 60) : v;
}

export const GET = handle(async (req: Request) => {
  const p = await needPrincipal(req);
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin only'), { status: 403, code: 'permission_denied' });
  const so = Number(new URL(req.url).searchParams.get('so'));
  const key = await cfg('NUPORT_API_KEY');
  if (!key || !so) throw Object.assign(new Error('need ?so= and NUPORT_API_KEY'), { status: 400, code: 'bad_request' });
  const r = await fetch('https://api.nuport.io/integration/orders/SO-' + so, { headers: { Authorization: key }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) return json({ status: r.status });
  const out: Record<string, unknown> = {};
  shape(await r.json(), '', out);
  return json(out);
});
