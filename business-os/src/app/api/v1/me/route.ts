import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';

export const GET = handle(async (req: Request) => {
  const p = await needPrincipal(req);
  return json(p.kind === 'user' ? { id: p.userId, email: p.email, role: p.role, businesses: p.businesses, scopes: p.scopes } : { kind: 'system' });
});
