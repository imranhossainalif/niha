// Supermetrics Query API (replaces the claude.ai Supermetrics connector the legacy page used).
// Returns rows in the shape the legacy smRows() expects: data[0] = header row, then values.
import { cfg } from './config';

const URL_BASE = 'https://api.supermetrics.com/enterprise/v2/query/data/json';

export type SmInput = {
  ds_id: string;
  ds_accounts?: string | string[];
  fields: string | string[];
  date_range_type?: string;
  start_date?: string;
  end_date?: string;
  max_rows?: number;
  settings?: Record<string, unknown>;
};

export async function smQuery(input: SmInput) {
  const key = await cfg('SUPERMETRICS_API_KEY');
  if (!key) throw Object.assign(new Error('SUPERMETRICS_API_KEY is not set'), { code: 'server_not_connected', status: 503 });
  const fields = Array.isArray(input.fields) ? input.fields : String(input.fields).split(',').map((s) => s.trim()).filter(Boolean);
  const q: Record<string, unknown> = {
    api_key: key, ds_id: input.ds_id, ds_accounts: input.ds_accounts, fields: fields.join(','),
    max_rows: input.max_rows ?? 1000, settings: input.settings ?? {},
  };
  if (input.start_date && input.end_date) { q.start_date = input.start_date; q.end_date = input.end_date; }
  else q.date_range_type = input.date_range_type || 'last_30_days';
  const r = await fetch(URL_BASE + '?json=' + encodeURIComponent(JSON.stringify(q)), { signal: AbortSignal.timeout(120000) });
  const body: any = await r.json().catch(() => ({}));
  if (!r.ok || body.error) throw Object.assign(new Error(body.error?.message || body.error?.description || 'Supermetrics ' + r.status), { code: r.status === 401 ? 'needs_reauth' : 'tool_error', status: 502 });
  return { status: 'completed', requested_field_ids: fields, data: body.data ?? [] };
}
