import { auth } from '@/auth';
import { prisma } from './prisma';
import type { Principal } from './access';
import { principalFromApiKey } from './apikeys';

/** Principal for the logged-in browser session. Re-reads the user so role/business changes apply at once. */
export async function sessionPrincipal(): Promise<Principal | null> {
  const s = await auth();
  if (!s?.user?.id) return null;
  const u = await prisma.user.findUnique({ where: { id: s.user.id } });
  if (!u || !u.active) return null;
  return { kind: 'user', userId: u.id, email: u.email, role: u.role, businesses: u.businesses, scopes: ['read', 'write'] };
}

/** Session cookie or API key. */
export async function requestPrincipal(req: Request): Promise<Principal | null> {
  return (await principalFromApiKey(req.headers.get('authorization'))) ?? (await sessionPrincipal());
}
