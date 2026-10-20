import { canReadDoc, canWriteDoc } from '../access';
import { needPrincipal } from '../apiutil';
import { BUSINESS } from './store';

/** Inbox holds customer data: only owner/admin or staff assigned to the business. */
export async function inboxPrincipal(req: Request, write = false) {
  const p = await needPrincipal(req, write ? 'write' : 'read');
  const ok = write ? canWriteDoc(p, 'inbox_messages', BUSINESS) : canReadDoc(p, 'inbox_messages', BUSINESS);
  if (!ok) throw Object.assign(new Error('No access to the inbox'), { status: 403, code: 'permission_denied' });
  return p;
}
