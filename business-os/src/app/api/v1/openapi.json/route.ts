import { openapi } from '@/lib/openapi';

export function GET(req: Request) {
  const proto = req.headers.get('x-forwarded-proto'), host = req.headers.get('host');
  const origin = process.env.PUBLIC_URL || (proto && host ? proto + '://' + host : new URL(req.url).origin);
  return Response.json(openapi(origin));
}
