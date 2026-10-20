import { BIZ_IDS } from './business';

export type Role = 'owner' | 'admin' | 'staff';
/** Who is acting. `system` is the worker / webhook (full access). */
export type Principal =
  | { kind: 'system' }
  | { kind: 'user'; userId: string; email: string; role: Role; businesses: string[]; scopes: ('read' | 'write')[] };

export const SYSTEM: Principal = { kind: 'system' };

// Docs with no business that staff may still read (course knowledge, shared notes).
export const SHARED_COLLECTIONS = ['kb_docs', 'kb_chunks', 'kb_notes'];
// Inbox/order records hold customer data: only owner/admin and staff assigned to that business.
export const CUSTOMER_DATA_COLLECTIONS = ['inbox_messages'];

export const isFull = (p: Principal) => p.kind === 'system' || p.role === 'owner' || p.role === 'admin';

/** null = no restriction; otherwise the business ids the principal may touch. */
export function allowedBusinesses(p: Principal): string[] | null {
  if (isFull(p)) return null;
  return p.kind === 'user' ? p.businesses.filter((b) => BIZ_IDS.includes(b)) : [];
}

export function canReadDoc(p: Principal, collection: string, business: string | null): boolean {
  const allowed = allowedBusinesses(p);
  if (!allowed) return true;
  if (business) return allowed.includes(business);
  return SHARED_COLLECTIONS.includes(collection);
}

export function canWriteDoc(p: Principal, collection: string, business: string | null): boolean {
  if (p.kind === 'user' && !p.scopes.includes('write')) return false;
  const allowed = allowedBusinesses(p);
  if (!allowed) return true;
  // staff may write only inside their businesses (shared docs like kb_notes stay owner/admin)
  return !!business && allowed.includes(business);
}

export class AccessError extends Error {
  code = 'permission_denied';
  status = 403;
}
