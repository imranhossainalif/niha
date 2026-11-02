// Free replacement for the Supermetrics "FA" (Facebook Ads) and "FB" (Facebook Page) queries the dashboard makes:
// the same field names in, the same table out (data[0] = header row), read straight from the Meta Marketing / Graph API
// with a system-user token that has ads_read (META_ADS_TOKEN).
import { cfg } from './config';
import { addDays, bdToday } from './time';
import type { SmInput } from './supermetrics';

const GRAPH = 'https://graph.facebook.com/v21.0';
type Row = Record<string, unknown>;

// Supermetrics field → how to read it from an insights row
const ACTION: Record<string, string> = {
  action_link_click: 'link_click',
  new_messaging_conversations_7d: 'onsite_conversion.messaging_conversation_started_7d',
  offsite_conversions_fb_pixel_purchase: 'offsite_conversion.fb_pixel_purchase',
};
const PLAIN: Record<string, string> = {
  cost: 'spend', impressions: 'impressions', CPM: 'cpm', Frequency: 'frequency', link_CTR: 'inline_link_click_ctr',
  ad_name: 'ad_name', adcampaign_name: 'campaign_name', Date: 'date_start',
};
const PRESET: Record<string, string> = {
  today: 'today', yesterday: 'yesterday', last_7_days: 'last_7d', last_14_days: 'last_14d', last_28_days: 'last_28d',
  last_30_days: 'last_30d', last_90_days: 'last_90d', this_month: 'this_month', last_month: 'last_month',
};

export class MetaAdsError extends Error {
  constructor(message: string, public code = 'tool_error') { super(message); }
}

async function get(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new MetaAdsError(j.error?.message || 'Meta API ' + r.status, r.status === 401 || j.error?.code === 190 ? 'needs_reauth' : 'tool_error');
  return j;
}
async function all(url: string, cap = 5000): Promise<any[]> {
  const out: any[] = [];
  for (let next: string | null = url; next && out.length < cap;) { const j = await get(next); out.push(...(j.data ?? [])); next = j.paging?.next ?? null; }
  return out;
}

/** Time window as Meta parameters: a preset when one matches, else an explicit range (BD dates). */
export function timeParams(input: SmInput): string {
  if (input.start_date && input.end_date) return 'time_range=' + encodeURIComponent(JSON.stringify({ since: input.start_date, until: input.end_date }));
  const p = PRESET[input.date_range_type || 'last_30_days'];
  if (p) return 'date_preset=' + p;
  const m = /^last_(\d+)_days$/.exec(input.date_range_type || '');
  const n = m ? Number(m[1]) : 30;
  const today = bdToday();
  return 'time_range=' + encodeURIComponent(JSON.stringify({ since: addDays(today, -n), until: addDays(today, -1) }));
}

/** Value of one Supermetrics field from a Meta insights row. */
export function fieldValue(field: string, row: Row, extra: { profile?: string; status?: string } = {}): unknown {
  if (field === 'profile') return extra.profile ?? '';
  if (field === 'adstatus') return extra.status ?? '';
  if (ACTION[field]) {
    const a = (row.actions as { action_type: string; value: string }[] | undefined)?.find((x) => x.action_type === ACTION[field]);
    return a ? Number(a.value) : 0;
  }
  const k = PLAIN[field];
  if (!k) return null;
  const v = row[k];
  return k === 'ad_name' || k === 'campaign_name' || k === 'date_start' ? v ?? '' : v == null ? 0 : Number(v);
}

const fieldList = (f: SmInput['fields']) => (Array.isArray(f) ? f : String(f).split(',')).map((s) => s.trim()).filter(Boolean);
const accounts = (a: SmInput['ds_accounts']) => (Array.isArray(a) ? a : String(a || '').split(',')).map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith('act_') ? s : 'act_' + s));

const tokenList = (t: string | string[]) => (Array.isArray(t) ? t : [t]).map((s) => (s || '').trim()).filter(Boolean);

/** "FA": ad account insights, one row per account / day / ad depending on the fields asked for. */
export async function metaAdsQuery(input: SmInput, token: string | string[]) {
  const tokens = tokenList(token);
  const fields = fieldList(input.fields);
  const adLevel = fields.some((f) => f === 'ad_name' || f === 'adcampaign_name' || f === 'adstatus');
  const daily = fields.includes('Date');
  const metaFields = ['spend', 'impressions', 'cpm', 'frequency', 'inline_link_click_ctr', 'actions', ...(adLevel ? ['ad_id', 'ad_name', 'campaign_name'] : [])];
  const rows: unknown[][] = [];
  for (const act of accounts(input.ds_accounts)) {
    // Try each token in order: an account owned by another business portfolio answers
    // #200 on the first token and returns data on the second.
    let firstErr: unknown = null; let done = false;
    for (const tok of tokens) {
      try {
        const enc = encodeURIComponent(tok);
        const acc = await get(`${GRAPH}/${act}?fields=name&access_token=${enc}`);
        const status: Record<string, string> = {};
        if (fields.includes('adstatus')) for (const ad of await all(`${GRAPH}/${act}/ads?fields=id,effective_status&limit=500&access_token=${enc}`)) status[ad.id] = ad.effective_status;
        const url = `${GRAPH}/${act}/insights?level=${adLevel ? 'ad' : 'account'}&fields=${metaFields.join(',')}&${timeParams(input)}`
          + (daily ? '&time_increment=1' : '') + `&limit=500&access_token=${enc}`;
        const mine: unknown[][] = [];
        for (const r of await all(url, input.max_rows ?? 5000)) {
          if (input.settings?.exclude_zero_impressions && !Number(r.impressions)) continue;
          mine.push(fields.map((f) => fieldValue(f, r, { profile: acc.name, status: status[r.ad_id] })));
        }
        rows.push(...mine);
        done = true; break;
      } catch (e) { if (!firstErr) firstErr = e; }
    }
    if (!done) throw firstErr;
  }
  return { status: 'completed', requested_field_ids: fields, data: [fields, ...rows.slice(0, input.max_rows ?? 5000)] };
}

const PAGE_METRIC: Record<string, string> = {
  page_views_total: 'page_views_total', page_post_engagements: 'page_post_engagements',
  page_messages_new_conversations_unique: 'page_messages_new_conversations_unique',
};

/** "FB": page totals over the range (followers = current count). Metrics Meta no longer serves come back as 0. */
export async function metaPageQuery(input: SmInput, token: string | string[]) {
  const tokens = tokenList(token);
  const fields = fieldList(input.fields);
  const rows: unknown[][] = [];
  for (const id of (Array.isArray(input.ds_accounts) ? input.ds_accounts : String(input.ds_accounts || '').split(',')).map((s) => String(s).trim()).filter(Boolean)) {
    // Same per-token fallback as the ads query: try each token until one can read the page.
    let page: Record<string, any> | null = null; let usedTok = tokens[0]; let firstErr: unknown = null;
    for (const tok of tokens) {
      try { page = await get(`${GRAPH}/${id}?fields=name,followers_count,access_token&access_token=${encodeURIComponent(tok)}`); usedTok = tok; break; }
      catch (e) { if (!firstErr) firstErr = e; }
    }
    if (!page) throw firstErr;
    const ptok = page.access_token || usedTok; // page insights need a page token; a system user with page access gets one here
    const vals: Record<string, number> = {};
    const want = fields.filter((f) => PAGE_METRIC[f]);
    for (const f of want) {
      try {
        const j = await get(`${GRAPH}/${id}/insights?metric=${PAGE_METRIC[f]}&period=day&${timeParams(input)}&access_token=${encodeURIComponent(ptok)}`);
        vals[f] = (j.data?.[0]?.values ?? []).reduce((s: number, v: { value: number }) => s + (Number(v.value) || 0), 0);
      } catch { vals[f] = 0; }
    }
    rows.push(fields.map((f) => (f === 'profile' ? page.name : f === 'page_followers' ? Number(page.followers_count) || 0 : vals[f] ?? 0)));
  }
  return { status: 'completed', requested_field_ids: fields, data: [fields, ...rows] };
}

/** Meta answers FA/FB when META_ADS_TOKEN is set; null means "not handled here".
 *  META_ADS_TOKEN_2 (optional) covers accounts owned by a second business portfolio:
 *  each account/page is tried with the first token, then the second. */
export async function metaQuery(input: SmInput) {
  const tokens = tokenList([(await cfg('META_ADS_TOKEN')) || '', (await cfg('META_ADS_TOKEN_2')) || '']);
  if (!tokens.length || (input.ds_id !== 'FA' && input.ds_id !== 'FB')) return null;
  return input.ds_id === 'FA' ? metaAdsQuery(input, tokens) : metaPageQuery(input, tokens);
}
