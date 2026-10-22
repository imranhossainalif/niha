// OpenAPI 3.1 description of /api/v1 (served at /api/v1/openapi.json). Keep in sync when adding endpoints.
const doc = { type: 'object', properties: { id: { type: 'string' }, data: { type: 'object', additionalProperties: true }, version: { type: 'integer' }, updated_at: { type: 'string', format: 'date-time' } } };
const err = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const colP = { name: 'collection', in: 'path', required: true, schema: { type: 'string' }, description: 'e.g. tasks, sales_daily, loans, ideas (see docs/DATA_MODEL.md)' };
const idP = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const ifMatch = { name: 'If-Match', in: 'header', required: false, schema: { type: 'string' }, description: 'Expected current version (optimistic lock). "0" = create only. 409 if it differs.' };
const body = { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } };
const ok = (schema: object, d = 'OK') => ({ description: d, content: { 'application/json': { schema } } });

export function openapi(origin: string) {
  return {
    openapi: '3.1.0',
    info: { title: 'Business OS API', version: '1.4.1', description: 'Read and write every Business OS collection. Auth: `Authorization: Bearer <key>` (owner creates keys in Admin). Keys act as their owner, limited to read or read+write. Staff keys only see their assigned businesses.' },
    servers: [{ url: origin }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: { Doc: doc, Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, current_version: { type: ['integer', 'null'] } } } } } },
    },
    paths: {
      '/api/v1/me': { get: { summary: 'Who this key/session is', responses: { 200: ok({ type: 'object' }), 401: err } } },
      '/api/health': { get: { summary: 'Last connection/limit check of every outside API (owner/admin)', responses: { 200: ok({ type: 'object' }), 401: err, 403: err } }, post: { summary: 'Run the connection/limit check now (owner/admin, write)', responses: { 200: ok({ type: 'object' }), 401: err, 403: err } } },
      '/api/v1/docs/{collection}': {
        get: {
          summary: 'List/query documents', parameters: [colP,
            { name: 'where', in: 'query', schema: { type: 'string' }, description: 'JSON [[field, op, value], …] with op in == != < <= > >= in array-contains, or the short form field==value (repeatable). Dotted fields allowed.' },
            { name: 'orderBy', in: 'query', schema: { type: 'string' }, description: 'field:asc|desc (repeatable)' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 200, maximum: 2000 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'next_cursor from the previous page' }],
          responses: { 200: ok({ type: 'object', properties: { docs: { type: 'array', items: { $ref: '#/components/schemas/Doc' } }, next_cursor: { type: ['string', 'null'] } } }), 400: err, 401: err },
        },
        post: { summary: 'Create a document with a generated id', parameters: [colP], requestBody: body, responses: { 201: ok(doc), 403: err } },
      },
      '/api/v1/docs/{collection}/{id}': {
        get: { summary: 'Get one document', parameters: [colP, idP], responses: { 200: ok(doc), 404: err } },
        put: { summary: 'Replace (or create) a document', parameters: [colP, idP, ifMatch], requestBody: body, responses: { 200: ok(doc), 403: err, 409: err } },
        patch: { summary: 'Merge fields into a document (dotted keys set nested fields)', parameters: [colP, idP, ifMatch], requestBody: body, responses: { 200: ok(doc), 404: err, 409: err } },
        delete: { summary: 'Delete a document', parameters: [colP, idP, ifMatch], responses: { 200: ok({ type: 'object', properties: { deleted: { type: 'boolean' } } }), 409: err } },
      },
      '/api/v1/batch': {
        post: {
          summary: 'Up to 500 writes in order (each succeeds or fails on its own)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['ops'], properties: { ops: { type: 'array', items: { type: 'object', required: ['op', 'collection'], properties: { op: { enum: ['set', 'update', 'delete'] }, collection: { type: 'string' }, id: { type: 'string' }, data: { type: 'object' }, expected_version: { type: 'integer' } } } } } } } } },
          responses: { 200: ok({ type: 'object', properties: { results: { type: 'array', items: { type: 'object' } } } }) },
        },
      },
      '/api/v1/sync': { get: { summary: 'Change feed (docs written/deleted after a sequence number)', parameters: [{ name: 'since', in: 'query', schema: { type: 'integer' } }, { name: 'cols', in: 'query', schema: { type: 'string' }, description: 'comma-separated collections' }], responses: { 200: ok({ type: 'object', properties: { seq: { type: 'integer' }, more: { type: 'boolean' }, upserts: { type: 'array' }, deletes: { type: 'array' } } }) } } },
      '/api/v1/kb/search': { get: { summary: 'BM25 search over course knowledge + own notes', parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }, { name: 'n', in: 'query', schema: { type: 'integer' } }, { name: 'business', in: 'query', schema: { type: 'string' } }], responses: { 200: ok({ type: 'object' }) } } },
      '/api/v1/reports/{business}': { get: { summary: 'Growth Engine (L×C×M×F), unit economics, P&L by month (kidscare), in-transit', parameters: [{ name: 'business', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: ok({ type: 'object' }), 403: err } } },
      '/api/v1/ai/assistant': {
        post: {
          summary: "Ask a business's AI Assistant (same tools/rules as the dashboard chat; may save ideas/tasks/funnel steps when asked)",
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['business'], properties: { business: { type: 'string' }, message: { type: 'string' }, messages: { type: 'array' }, complex: { type: 'boolean' }, save_chat: { type: 'boolean' } } } } } },
          responses: { 200: ok({ type: 'object', properties: { text: { type: 'string' }, tools: { type: 'array', items: { type: 'string' } }, truncated: { type: 'boolean' } } }) },
        },
      },
      '/api/jobs': { get: { summary: 'Recent background jobs, or one by ?id=', responses: { 200: ok({ type: 'object' }) } } },
      '/api/inbox/import': { post: { summary: 'Queue a Messenger history import', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { days: { type: 'integer', default: 30 } } } } } }, responses: { 202: ok({ type: 'object' }) } } },
    },
  };
}
