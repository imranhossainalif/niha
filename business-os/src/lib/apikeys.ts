import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import type { Principal } from './access';

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export async function createApiKey(userId: string, name: string, scopes: ('read' | 'write')[]) {
  const key = 'bos_' + randomBytes(24).toString('base64url');
  const row = await prisma.apiKey.create({ data: { userId, name, scopes, prefix: key.slice(0, 10), hash: hashKey(key) } });
  return { key, id: row.id };
}

/** Resolve `Authorization: Bearer bos_...` to a principal acting as the key's owner, limited to the key's scopes. */
export async function principalFromApiKey(header: string | null): Promise<Principal | null> {
  const m = header?.match(/^Bearer\s+(bos_[A-Za-z0-9_\-]+)$/);
  if (!m) return null;
  const k = await prisma.apiKey.findUnique({ where: { hash: hashKey(m[1]) }, include: { user: true } });
  if (!k || k.revokedAt || !k.user.active) return null;
  prisma.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  const scopes = k.scopes.filter((s): s is 'read' | 'write' => s === 'read' || s === 'write');
  return { kind: 'user', userId: k.user.id, email: k.user.email, role: k.user.role, businesses: k.user.businesses, scopes };
}
