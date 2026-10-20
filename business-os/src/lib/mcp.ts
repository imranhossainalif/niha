import type { Principal } from './access';
import { collectionCounts, db } from './db';
import { searchKnowledge } from './kb/index';
import { askAssistant } from './ai/agent';

type McpTool = { name: string; description: string; inputSchema: object; run: (a: any) => Promise<unknown> };
const needWrite = (p: Principal) => { if (p.kind === 'user' && !p.scopes.includes('write')) throw new Error('This API key is read-only'); };

export function mcpTools(p: Principal): McpTool[] {
  const store = db(p);
  return [
    { name: 'list_collections', description: 'Collections and document counts this key can see.', inputSchema: { type: 'object', properties: {} }, run: () => collectionCounts(p) },
    { name: 'get_doc', description: 'Read one document.', inputSchema: { type: 'object', required: ['collection', 'id'], properties: { collection: { type: 'string' }, id: { type: 'string' } } },
      run: async (a) => (await store.collection(a.collection).doc(a.id).get()) ?? 'not found' },
    { name: 'query_docs', description: 'Query a collection. where: [[field, op, value]] with op in == != < <= > >= in array-contains. orderBy: [[field, "asc"|"desc"]].', inputSchema: { type: 'object', required: ['collection'], properties: { collection: { type: 'string' }, where: { type: 'array' }, orderBy: { type: 'array' }, limit: { type: 'number' }, offset: { type: 'number' } } },
      run: async (a) => {
        let q = store.collection(a.collection).limit(Math.min(Number(a.limit) || 50, 500)).offset(Number(a.offset) || 0);
        for (const [f, op, v] of a.where ?? []) q = q.where(f, op, v);
        for (const [f, d] of a.orderBy ?? []) q = q.orderBy(f, d === 'desc' ? 'desc' : 'asc');
        return (await q.get()).map((d) => ({ id: d.id, version: d.version, data: d.data }));
      } },
    { name: 'put_doc', description: 'Create or replace a document. expected_version guards against overwriting a newer change (0 = create only).', inputSchema: { type: 'object', required: ['collection', 'data'], properties: { collection: { type: 'string' }, id: { type: 'string' }, data: { type: 'object' }, expected_version: { type: 'number' } } },
      run: async (a) => { needWrite(p); const s = await store.collection(a.collection).doc(a.id).set(a.data, { expectedVersion: a.expected_version }); return { id: s.id, version: s.version }; } },
    { name: 'patch_doc', description: 'Merge fields into an existing document.', inputSchema: { type: 'object', required: ['collection', 'id', 'data'], properties: { collection: { type: 'string' }, id: { type: 'string' }, data: { type: 'object' }, expected_version: { type: 'number' } } },
      run: async (a) => { needWrite(p); const s = await store.collection(a.collection).doc(a.id).update(a.data, { expectedVersion: a.expected_version }); return { id: s.id, version: s.version }; } },
    { name: 'delete_doc', description: 'Delete a document.', inputSchema: { type: 'object', required: ['collection', 'id'], properties: { collection: { type: 'string' }, id: { type: 'string' } } },
      run: async (a) => { needWrite(p); return { deleted: await store.collection(a.collection).doc(a.id).delete() }; } },
    { name: 'search_knowledge', description: 'BM25 search over the course knowledge and own notes (English keywords work best).', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, business: { type: 'string' } } },
      run: (a) => searchKnowledge(a.query, 6, a.business) },
    { name: 'ask_assistant', description: "Ask a business's in-app AI Assistant (it can save ideas/tasks/funnel steps when asked).", inputSchema: { type: 'object', required: ['business', 'message'], properties: { business: { type: 'string' }, message: { type: 'string' } } },
      run: async (a) => { needWrite(p); return askAssistant(p, a.business, [{ role: 'user', content: a.message }]); } },
  ];
}
