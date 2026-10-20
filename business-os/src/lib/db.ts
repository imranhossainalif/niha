// Server-side document store with the same shape the legacy page used:
//   db(principal).collection(c).doc(id).get/set/update/delete, .add(), .where().orderBy().limit().get()
// Every write bumps the doc's `version` (optimistic concurrency) and its global `seq` (change feed).
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import { docBusiness } from './business';
import { AccessError, allowedBusinesses, canReadDoc, canWriteDoc, SHARED_COLLECTIONS, SYSTEM, type Principal } from './access';

export type Data = Record<string, unknown>;
export type DocSnap = { collection: string; id: string; data: Data; version: number; seq: number; updatedAt: string };
export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
export type Where = { field: string; op: WhereOp; value: unknown };

export class ConflictError extends Error {
  code = 'version_conflict';
  status = 409;
  constructor(public current: number | null) { super('Version conflict' + (current != null ? ' (current ' + current + ')' : '')); }
}
export class NotFoundError extends Error {
  code = 'not_found';
  status = 404;
}
export class BadRequestError extends Error {
  code = 'bad_request';
  status = 400;
}

const NAME_RE = /^[A-Za-z0-9_\-]{1,80}$/;
const ID_RE = /^[^/\s][^/]{0,299}$/;
const FIELD_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/;
const checkCol = (c: string) => { if (!NAME_RE.test(c)) throw new BadRequestError('Bad collection name: ' + c); };
const checkId = (id: string) => { if (!ID_RE.test(id)) throw new BadRequestError('Bad doc id'); };
export const newId = () => randomBytes(15).toString('base64url').slice(0, 20);

type Row = { collection: string; id: string; data: Data; version: number; seq: bigint; updated_at: Date; business: string | null };
const toSnap = (r: Row): DocSnap => ({ collection: r.collection, id: r.id, data: r.data, version: r.version, seq: Number(r.seq), updatedAt: r.updated_at.toISOString() });

/** SQL fragment limiting rows to what the principal may read. */
function accessSql(p: Principal): Prisma.Sql {
  const allowed = allowedBusinesses(p);
  if (!allowed) return Prisma.sql`TRUE`;
  return Prisma.sql`(business = ANY(${allowed}::text[]) OR (business IS NULL AND collection = ANY(${SHARED_COLLECTIONS}::text[])))`;
}

async function readRow(collection: string, id: string, tx: Prisma.TransactionClient = prisma): Promise<Row | null> {
  const rows = await tx.$queryRaw<Row[]>`SELECT collection, id, data, version, seq, updated_at, business FROM docs WHERE collection = ${collection} AND id = ${id}`;
  return rows[0] ?? null;
}

// Clean values the way JSON would (drops undefined, Dates -> ISO strings).
const clean = (d: unknown): Data => JSON.parse(JSON.stringify(d ?? {}));

export class DocRef {
  constructor(private p: Principal, readonly collection: string, readonly id: string) { checkCol(collection); checkId(id); }

  async get(): Promise<DocSnap | null> {
    const r = await readRow(this.collection, this.id);
    if (!r || !canReadDoc(this.p, r.collection, r.business)) return null;
    return toSnap(r);
  }

  /** Replace the doc. `expectedVersion`: 0 = must not exist, n = must be at version n. */
  async set(data: Data, opts: { expectedVersion?: number } = {}): Promise<DocSnap> {
    const body = clean(data);
    const business = docBusiness(this.collection, this.id, body);
    if (!canWriteDoc(this.p, this.collection, business)) throw new AccessError('No write access to ' + this.collection + '/' + this.id);
    return prisma.$transaction(async (tx) => {
      const cur = await readRow(this.collection, this.id, tx);
      if (cur && !canWriteDoc(this.p, cur.collection, cur.business)) throw new AccessError('No write access to ' + this.collection + '/' + this.id);
      const exp = opts.expectedVersion;
      if (exp != null && (cur?.version ?? 0) !== exp) throw new ConflictError(cur?.version ?? null);
      const rows = cur
        ? await tx.$queryRaw<Row[]>`UPDATE docs SET data = ${JSON.stringify(body)}::jsonb, business = ${business}, version = version + 1,
            seq = nextval('doc_seq'), updated_at = now() WHERE collection = ${this.collection} AND id = ${this.id} AND version = ${cur.version}
            RETURNING collection, id, data, version, seq, updated_at, business`
        : await tx.$queryRaw<Row[]>`INSERT INTO docs (collection, id, data, business) VALUES (${this.collection}, ${this.id}, ${JSON.stringify(body)}::jsonb, ${business})
            ON CONFLICT (collection, id) DO NOTHING RETURNING collection, id, data, version, seq, updated_at, business`;
      if (!rows[0]) throw new ConflictError(null);
      return toSnap(rows[0]);
    });
  }

  /** Shallow-merge fields into an existing doc (like Firestore update). Dotted keys set nested fields. */
  async update(patch: Data, opts: { expectedVersion?: number } = {}): Promise<DocSnap> {
    for (let attempt = 0; ; attempt++) {
      const cur = await readRow(this.collection, this.id);
      if (!cur || !canReadDoc(this.p, cur.collection, cur.business)) throw new NotFoundError(this.collection + '/' + this.id + ' not found');
      const next = applyPatch(cur.data, clean(patch));
      try {
        return await this.set(next, { expectedVersion: opts.expectedVersion ?? cur.version });
      } catch (e) {
        // someone else wrote in between: retry with fresh data unless the caller pinned a version
        if (e instanceof ConflictError && opts.expectedVersion == null && attempt < 3) continue;
        throw e;
      }
    }
  }

  async delete(opts: { expectedVersion?: number } = {}): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const cur = await readRow(this.collection, this.id, tx);
      if (!cur) return false;
      if (!canWriteDoc(this.p, cur.collection, cur.business)) throw new AccessError('No write access to ' + this.collection + '/' + this.id);
      if (opts.expectedVersion != null && cur.version !== opts.expectedVersion) throw new ConflictError(cur.version);
      await tx.$executeRaw`DELETE FROM docs WHERE collection = ${this.collection} AND id = ${this.id}`;
      await tx.$executeRaw`INSERT INTO doc_tombstones (collection, id, business) VALUES (${this.collection}, ${this.id}, ${cur.business})`;
      return true;
    });
  }
}

function applyPatch(base: Data, patch: Data): Data {
  const out: Data = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (!k.includes('.')) { out[k] = v; continue; }
    const parts = k.split('.');
    let o: Data = out;
    parts.slice(0, -1).forEach((p) => { o[p] = o[p] && typeof o[p] === 'object' && !Array.isArray(o[p]) ? { ...(o[p] as Data) } : {}; o = o[p] as Data; });
    o[parts[parts.length - 1]] = v;
  }
  return out;
}

const jpath = (field: string) => { if (!FIELD_RE.test(field)) throw new BadRequestError('Bad field: ' + field); return field.split('.'); };

export class Query {
  private wheres: Where[] = [];
  private order: { field: string; dir: 'asc' | 'desc' }[] = [];
  private lim = 1000;
  private off = 0;
  constructor(protected p: Principal, readonly collection: string) { checkCol(collection); }
  where(field: string, op: WhereOp, value: unknown) { const q = this.clone(); q.wheres.push({ field, op, value }); return q; }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') { const q = this.clone(); q.order.push({ field, dir }); return q; }
  limit(n: number) { const q = this.clone(); q.lim = Math.max(1, Math.min(5000, Math.floor(n))); return q; }
  offset(n: number) { const q = this.clone(); q.off = Math.max(0, Math.floor(n)); return q; }
  private clone() { const q = Object.create(Object.getPrototypeOf(this)) as Query; Object.assign(q, this, { wheres: [...this.wheres], order: [...this.order] }); return q; }

  async get(): Promise<DocSnap[]> {
    const conds = [Prisma.sql`collection = ${this.collection}`, accessSql(this.p), ...this.wheres.map(whereSql)];
    const ord = this.order.length
      ? Prisma.join(this.order.map((o) => Prisma.sql`data #> ${jpath(o.field)}::text[] ${o.dir === 'desc' ? Prisma.sql`DESC NULLS LAST` : Prisma.sql`ASC NULLS LAST`}`), ', ')
      : Prisma.sql`id ASC`;
    const rows = await prisma.$queryRaw<Row[]>`SELECT collection, id, data, version, seq, updated_at, business FROM docs
      WHERE ${Prisma.join(conds, ' AND ')} ORDER BY ${ord}, id ASC LIMIT ${this.lim} OFFSET ${this.off}`;
    return rows.map(toSnap);
  }
}

function whereSql(w: Where): Prisma.Sql {
  const path = Prisma.sql`data #> ${jpath(w.field)}::text[]`;
  const j = (v: unknown) => Prisma.sql`${JSON.stringify(v ?? null)}::jsonb`;
  switch (w.op) {
    case '==': return Prisma.sql`${path} = ${j(w.value)}`;
    case '!=': return Prisma.sql`(${path} IS NULL OR ${path} <> ${j(w.value)})`;
    case '<': return Prisma.sql`${path} < ${j(w.value)}`;
    case '<=': return Prisma.sql`${path} <= ${j(w.value)}`;
    case '>': return Prisma.sql`${path} > ${j(w.value)}`;
    case '>=': return Prisma.sql`${path} >= ${j(w.value)}`;
    case 'in': {
      if (!Array.isArray(w.value) || !w.value.length) return Prisma.sql`FALSE`;
      return Prisma.sql`${path} = ANY(${w.value.map((v) => JSON.stringify(v))}::jsonb[])`;
    }
    case 'array-contains': return Prisma.sql`${path} @> ${j([w.value])}`;
    default: throw new BadRequestError('Bad operator');
  }
}

export class CollectionRef extends Query {
  doc(id?: string) { return new DocRef(this.p, this.collection, id ?? newId()); }
  async add(data: Data) { return this.doc().set(data, { expectedVersion: 0 }); }
}

export function db(p: Principal = SYSTEM) {
  return { collection: (c: string) => new CollectionRef(p, c) };
}

/** Change feed: docs written and deleted after `since`, limited to what the principal can read. */
export async function changes(p: Principal, since: number, collections?: string[], limit = 5000) {
  const colSql = collections?.length ? Prisma.sql`AND collection = ANY(${collections}::text[])` : Prisma.empty;
  const rows = await prisma.$queryRaw<Row[]>`SELECT collection, id, data, version, seq, updated_at, business FROM docs
    WHERE seq > ${BigInt(since)} ${colSql} AND ${accessSql(p)} ORDER BY seq ASC LIMIT ${limit}`;
  // tombstones newer than the last returned doc only, so a partial page never skips a delete
  const upTo = rows.length === limit ? rows[rows.length - 1].seq : null;
  const dels = await prisma.$queryRaw<{ collection: string; id: string; seq: bigint; business: string | null }[]>`SELECT collection, id, seq, business FROM doc_tombstones
    WHERE seq > ${BigInt(since)} ${upTo != null ? Prisma.sql`AND seq <= ${upTo}` : Prisma.empty} ${colSql} AND ${accessSql(p)} ORDER BY seq ASC`;
  const head = await prisma.$queryRaw<{ s: bigint | null }[]>`SELECT GREATEST((SELECT max(seq) FROM docs), (SELECT max(seq) FROM doc_tombstones)) AS s`;
  const seq = upTo != null ? Number(upTo) : Number(head[0]?.s ?? since);
  return { seq: Math.max(seq, since), more: upTo != null, upserts: rows.map(toSnap), deletes: dels.map((d) => ({ collection: d.collection, id: d.id })) };
}

/** Per-collection doc counts the principal can see. */
export async function collectionCounts(p: Principal) {
  const rows = await prisma.$queryRaw<{ collection: string; n: bigint }[]>`SELECT collection, count(*) AS n FROM docs WHERE ${accessSql(p)} GROUP BY collection ORDER BY collection`;
  return rows.map((r) => ({ collection: r.collection, count: Number(r.n) }));
}
