import { BadRequestError, type Where, type WhereOp } from './db';
import { requestPrincipal } from './session';
import type { Principal } from './access';

export class UnauthorizedError extends Error { code = 'unauthorized'; status = 401; }

export async function needPrincipal(req: Request, scope: 'read' | 'write' = 'read'): Promise<Principal> {
  const p = await requestPrincipal(req);
  if (!p) throw new UnauthorizedError('Login or API key required');
  if (p.kind === 'user' && !p.scopes.includes(scope)) throw Object.assign(new Error('API key lacks ' + scope + ' scope'), { status: 403, code: 'permission_denied' });
  return p;
}

const OPS: WhereOp[] = ['==', '!=', '<=', '>=', '<', '>'];
const val = (s: string): unknown => { try { return JSON.parse(s); } catch { return s; } };

/** where=[["business","==","kidscare"]]  or  where=business==kidscare (repeatable) */
export function parseWhere(params: URLSearchParams): Where[] {
  const out: Where[] = [];
  for (const raw of params.getAll('where')) {
    if (raw.trim().startsWith('[')) {
      const arr = JSON.parse(raw);
      const list = Array.isArray(arr[0]) ? arr : [arr];
      for (const [field, op, value] of list) out.push({ field: String(field), op, value });
      continue;
    }
    const op = OPS.find((o) => raw.includes(o));
    if (!op) throw new BadRequestError('Bad where: ' + raw);
    const i = raw.indexOf(op);
    out.push({ field: raw.slice(0, i), op, value: val(raw.slice(i + op.length)) });
  }
  return out;
}

export const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString('base64url');
export const decodeCursor = (c: string | null) => (c ? Number(Buffer.from(c, 'base64url').toString()) || 0 : 0);

/** If-Match: "3" (or ?version=3) for optimistic writes. */
export function expectedVersion(req: Request): number | undefined {
  const h = req.headers.get('if-match') ?? new URL(req.url).searchParams.get('version');
  if (h == null || h === '' || h === '*') return undefined;
  const n = Number(h.replace(/"/g, ''));
  if (!Number.isInteger(n) || n < 0) throw new BadRequestError('Bad If-Match version');
  return n;
}
