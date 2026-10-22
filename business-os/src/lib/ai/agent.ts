// Server-side AI Assistant (per business): context + tools + manual tool-use loop.
// Same rules and tools as the legacy page's aiTools / AI_RULES / bizContext, so the API, the worker's
// scheduled jobs and the browser chat all behave alike.
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL, MODEL_COMPLEX } from '../anthropic';
import { db, type Data } from '../db';
import { SYSTEM, type Principal } from '../access';
import { bizName, BIZ_IDS } from '../business';
import { bdToday, daysTo } from '../time';
import { plMonth, plMonthList, pcVer, type State } from '../calc/pl';
import { searchKnowledge } from '../kb/index';
import { recordUsage } from '../aiUsage';

type R = Record<string, any>;
const cut = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
const sumBy = (a: R[], f: (x: R) => unknown) => a.reduce((s, r) => s + (Number(f(r)) || 0), 0);
const nf = (n: number) => Math.round(n).toLocaleString('en-IN');

// Collections the get_records tool may read, with a row cap each (same as the legacy COLS_OK).
export const COLS_OK: Record<string, number> = { sales_daily: 60, pc_items: 40, funnel_steps: 40, goals: 40, ideas: 60, tasks: 60, comp_weekly: 3, pl_kidscare: 18, calls_daily: 30, kc_packing: 24, clients: 40, leads: 60, packages: 20, transactions: 60, issues: 30, comp_watch: 30, product_costing: 5, sales_team: 5 };
const KIDSCARE_WIDE = new Set(['pl_kidscare', 'calls_daily', 'kc_packing', 'sales_team']);
const ITYPE = ['content', 'product', 'trick', 'change', 'offer', 'other'];
const FSTAGE = ['entry', 'core', 'upsell', 'repeat', 'high', 'referral'];

export async function loadState(p: Principal, cols: string[]): Promise<State> {
  const store = db(p);
  const entries = await Promise.all(cols.map(async (c) => [c, (await store.collection(c).limit(5000).get()).map((s) => ({ id: s.id, ...s.data }))] as const));
  return Object.fromEntries(entries);
}

export function bizContext(S: State, id: string, today = bdToday()): string {
  const L: string[] = [];
  const col = (c: string) => S[c] ?? [];
  L.push('Business: ' + bizName(id) + ' (id ' + id + '). Today: ' + today + ' (Asia/Dhaka).');
  const sd = col('sales_daily').filter((r) => r.business === id && daysTo(r.date, today) > -31 && daysTo(r.date, today) <= 0);
  if (sd.length) L.push('Last 30 days (Nuport/courier): orders ' + sumBy(sd, (r) => r.orders) + ', delivered ' + sumBy(sd, (r) => r.delivered) + ', delivered sales ৳' + nf(sumBy(sd, (r) => r.delivered_amount)) + ', cancelled ' + sumBy(sd, (r) => r.cancelled) + ', days with data ' + sd.length + '.');
  if (id === 'kidscare') {
    try { const ms = plMonthList(S, today).slice(-4); L.push('P&L by month: ' + ms.map((m) => { const p = plMonth(S, m); return m + ' sales ৳' + nf(p.sales) + ', product cost ৳' + nf(p.cost) + ', ads ৳' + nf(p.ads.total) + ', net ৳' + nf(p.net) + (p.est ? ' (est)' : ''); }).join(' | ')); } catch { /* partial data */ }
    const pcs = col('pc_items').filter((p) => !p.archived).slice(0, 30);
    if (pcs.length) L.push('Products (current price/cost per size): ' + pcs.map((p) => { const v = pcVer(p, today) || {}; return p.name + ' [' + (v.sizes || []).map((s: R) => s.size + ' ৳' + s.price + '/cost ৳' + Math.round(s.cost || 0)).join(', ') + ']'; }).join('; '));
    const sp = col('settings').find((s) => s.id === 'sprint_kidscare'); if (sp) L.push('Current sprint: ' + cut(JSON.stringify(sp), 500));
    const st = col('sales_team').find((s) => s.id === 'live_calls'); if (st && st.reps) L.push('Sales team reps: ' + cut(JSON.stringify(st.reps).replace(/"phone":"[^"]*",?/g, ''), 700));
  }
  const fs = col('funnel_steps').filter((s) => s.business === id).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (fs.length) L.push('Current funnel: ' + fs.map((s) => (s.order || '') + '. [' + s.stage + '/' + s.status + '] ' + s.offer + (s.price ? ' ' + s.price : '')).join(' | '));
  const gs = col('goals').filter((g) => g.business === id); if (gs.length) L.push('Goals: ' + gs.map((g) => '[' + g.horizon + '/' + g.status + '] ' + g.title).join(' | '));
  const ids = col('ideas').filter((i) => i.business === id && i.stage !== 'dropped').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 20);
  if (ids.length) L.push('Open ideas (newest): ' + ids.map((i) => '[' + (i.type || 'other') + '] ' + cut(i.title, 90)).join(' | '));
  const tk = col('tasks').filter((t) => t.business === id && !t.done && t.status !== 'complete').slice(0, 15);
  if (tk.length) L.push('Open tasks: ' + tk.map((t) => cut(t.title, 70) + (t.date ? ' (' + t.date + ')' : '')).join(' | '));
  const cw = [...col('comp_weekly')].sort((a, b) => (b.id || '').localeCompare(a.id || ''))[0];
  if (cw && id === 'kidscare') L.push('Latest competitor report ' + cw.id + ': ' + cut(cw.summary, 1200) + (cw.adlib ? ' ADS: ' + cut(cw.adlib, 900) : ''));
  const iss = col('issues').filter((i) => i.business === id && i.status !== 'solved').slice(0, 8);
  if (iss.length) L.push('Open issues: ' + iss.map((i) => cut(i.title, 80)).join(' | '));
  return L.join('\n');
}

export const AI_RULES = (id: string) => `You are the business assistant inside Imran's "EasyFounder" dashboard, working for the business "${bizName(id)}" (Bangladesh). Imran runs it; reply in Banglish (Bangla written in English letters) unless he writes in English or Bangla script — then match him.
How to work:
- Build answers on the KNOWLEDGE frameworks below (Imran's iMBA / GrowthX course material: Godfather Offer, Value Equation, Hourglass Funnel (lead magnet -> tripwire -> core -> profit maximizers -> retention), Growth formula L x C x M x F, Campaign Launch Formula, Blue Ocean ERRC, Category Design, Niche Fortune, Smart Brand Pyramid, Growth Hacking, Recurring Revenue, Customer Acquisition) PLUS the Ecom Media Buying course (Meta campaign structure, media mix, MER/POAS, CRO, content psychology, product research, Google Ads). Name the framework you used. For details call search_knowledge with English keywords.
- Use the BUSINESS DATA below (and get_records for more) so suggestions fit real numbers, products, prices and costs. Never invent numbers; if data is missing, say what is missing.
- Label analysis lines FACT (from data/knowledge) or HYPOTHESIS (your inference). No guarantees of results, CPM, CTR or sales.
- Kids food/health: never claim cures, disease prevention, guaranteed weight gain or doctor-backed claims that are not real. Lottery/raffle/lucky-draw prizes in Bangladesh need prior Ministry of Commerce permission (Digital Commerce Guidelines 2021, 3.1.8) — prefer gifts everyone gets.
- Be direct: one recommended path, concrete steps, prices in ৳, who does what, by when. Use short headings, bullets and small tables. Keep it scannable.
- Only call add_ideas / add_tasks / add_funnel_steps when Imran asks to save, add, create tasks, or build a funnel "in the dashboard"; otherwise end by offering to save. Saved items are drafts he can edit.`;

export function kbFrameworks(S: State): string {
  const docs = [...(S.kb_docs ?? [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const notes = S.kb_notes ?? [];
  return docs.map((d) => '## ' + d.title + ' (' + d.course + ')\n' + d.frameworks).join('\n\n')
    + (notes.length ? '\n\n## Imran er nijer knowledge note\n' + notes.map((n) => '- ' + n.title + (n.business ? ' [' + bizName(n.business) + ']' : '') + ': ' + String(n.text).slice(0, 600)).join('\n') : '');
}

export type Tool = { def: Anthropic.Tool; run: (input: any) => Promise<unknown> };

export function assistantTools(p: Principal, id: string, S: State, log: (s: string) => void = () => {}): Tool[] {
  const store = db(p);
  const W = async (col: string, items: unknown, map: (x: R) => Data | null) => {
    const arr = Array.isArray(items) ? items.slice(0, 15) : [];
    if (!arr.length) throw new Error('items empty');
    const now = new Date().toISOString(); let n = 0;
    for (const it of arr) { const body = map(it || {}); if (!body) continue; await store.collection(col).add({ ...body, business: id, source: 'AI Assistant', created_at: now, updated_at: now }); n++; }
    log('saved ' + n + ' ' + col);
    return { saved: n, collection: col };
  };
  const today = bdToday();
  return [
    {
      def: { name: 'search_knowledge', description: "Full-text search over Imran's course material (iMBA/GrowthX slides & worksheets) and his own notes. Returns up to 6 passages with source and page. Use English keywords (e.g. \"tripwire splinter offer\", \"value equation time delay\").", input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      run: async (inp) => (await searchKnowledge(String(inp.query || ''), 6, id)).map((h) => ({ ...h, text: h.text.slice(0, 1800) })),
    },
    {
      def: { name: 'get_records', description: 'Read raw dashboard records for this business from one collection (newest first, long fields trimmed). Collections: ' + Object.keys(COLS_OK).join(', ') + '.', input_schema: { type: 'object', properties: { collection: { type: 'string' }, limit: { type: 'number' } }, required: ['collection'] } },
      run: async (inp) => {
        const c = String(inp.collection || '');
        if (!COLS_OK[c]) throw new Error('Not allowed: ' + c);
        const lim = Math.min(Number(inp.limit) || COLS_OK[c], COLS_OK[c]);
        const rows = (S[c] ?? (await loadState(p, [c]))[c] ?? []).filter((r) => !r.business || r.business === id || KIDSCARE_WIDE.has(c))
          .sort((a, b) => String(b.date || b.id || '').localeCompare(String(a.date || a.id || ''))).slice(0, lim);
        const s = JSON.stringify(rows, (k, v) => (/phone|mobile|customer_name|address/i.test(k) ? undefined : typeof v === 'string' && v.length > 400 ? v.slice(0, 400) + '…' : v));
        return s.length > 30000 ? s.slice(0, 30000) : s;
      },
    },
    {
      def: { name: 'add_ideas', description: 'Save ideas to the Idea Book. items: [{title, type: content|product|trick|change|offer|other, note}]', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, type: { type: 'string' }, note: { type: 'string' } }, required: ['title'] } } }, required: ['items'] } },
      run: (inp) => W('ideas', inp.items, (x) => (x.title ? { title: String(x.title).slice(0, 200), type: ITYPE.includes(x.type) ? x.type : 'other', note: String(x.note || '').slice(0, 3000), stage: 'new' } : null)),
    },
    {
      def: { name: 'add_tasks', description: 'Create tasks on the Task board. items: [{title, date (YYYY-MM-DD deadline), priority: high|normal|low, owner (person name, default Imran), note}]', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, date: { type: 'string' }, priority: { type: 'string' }, owner: { type: 'string' }, note: { type: 'string' } }, required: ['title'] } } }, required: ['items'] } },
      run: (inp) => W('tasks', inp.items, (x) => (x.title ? { title: String(x.title).slice(0, 200), date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : today, priority: ['high', 'normal', 'low'].includes(x.priority) ? x.priority : 'normal', owner: String(x.owner || 'Imran').slice(0, 40), status: 'todo', done: false, note: String(x.note || '').slice(0, 2000), tags: [] } : null)),
    },
    {
      def: { name: 'add_funnel_steps', description: "Add steps to this business's funnel (Funnel tab). items: [{offer, stage: entry|core|upsell|repeat|high|referral, order (number), price (text like \"৳990\"), audience, how}]. Saved with status \"plan\".", input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { offer: { type: 'string' }, stage: { type: 'string' }, order: { type: 'number' }, price: { type: 'string' }, audience: { type: 'string' }, how: { type: 'string' } }, required: ['offer', 'stage'] } } }, required: ['items'] } },
      run: (inp) => W('funnel_steps', inp.items, (x) => (x.offer ? { offer: String(x.offer).slice(0, 200), stage: FSTAGE.includes(x.stage) ? x.stage : 'core', order: Number(x.order) || 99, price: String(x.price || '').slice(0, 60), audience: String(x.audience || '').slice(0, 300), how: String(x.how || '').slice(0, 1500), status: 'plan' } : null)),
    },
  ];
}

export const STATE_COLS = ['sales_daily', 'pl_kidscare', 'pc_items', 'settings', 'sales_team', 'funnel_steps', 'goals', 'ideas', 'tasks', 'comp_weekly', 'issues', 'kb_docs', 'kb_notes', 'fixed_costs', 'transactions', 'spend_import', 'daily_spend'];

/**
 * Manual tool-use loop. `extraTools` are server tools (e.g. web search) or job-specific save tools.
 * Returns the final text and the full message list.
 */
export async function runAgent(opts: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Tool[];
  serverTools?: Anthropic.ToolUnion[];
  complex?: boolean;
  maxRounds?: number;
  onText?: (delta: string) => void;
}): Promise<{ text: string; messages: Anthropic.MessageParam[]; stop: string | null }> {
  const client = await anthropic();
  const model = opts.complex ? await MODEL_COMPLEX() : await MODEL();
  const messages = [...opts.messages];
  const byName = new Map(opts.tools.map((t) => [t.def.name, t]));
  let text = '', stop: string | null = null;
  for (let round = 0; round < (opts.maxRounds ?? 12); round++) {
    const stream = client.messages.stream({
      model,
      max_tokens: 32000,
      system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
      messages,
      tools: [...opts.tools.map((t) => t.def), ...(opts.serverTools ?? [])],
    });
    if (opts.onText) stream.on('text', opts.onText);
    const msg = await stream.finalMessage();
    void recordUsage(model, msg.usage).catch(() => {});
    stop = msg.stop_reason;
    const said = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    if (said) text = text ? text + '\n\n' + said : said;
    messages.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'pause_turn') continue; // server tool (web search) needs another round
    if (msg.stop_reason !== 'tool_use') break;
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')) {
      const t = byName.get(u.name);
      try {
        if (!t) throw new Error('Unknown tool ' + u.name);
        const out = await t.run(u.input);
        results.push({ type: 'tool_result', tool_use_id: u.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: (e as Error).message });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return { text, messages, stop };
}

/** One assistant turn for a business, as used by POST /api/v1/ai/assistant and the scheduled jobs. */
export async function askAssistant(p: Principal, business: string, history: { role: 'user' | 'assistant'; content: string }[], opts: { complex?: boolean; onText?: (d: string) => void } = {}) {
  if (!BIZ_IDS.includes(business)) throw Object.assign(new Error('Unknown business'), { status: 400, code: 'bad_request' });
  const S = await loadState(p, STATE_COLS);
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const hits = await searchKnowledge(lastUser, 4, business).catch(() => []);
  const system = AI_RULES(business) + '\n\n=== KNOWLEDGE FRAMEWORKS ===\n' + kbFrameworks(S) + '\n\n=== BUSINESS DATA (' + bizName(business) + ') ===\n' + bizContext(S, business)
    + (hits.length ? '\n\n=== KNOWLEDGE PASSAGES matching the latest message ===\n' + hits.map((h) => '[' + h.source + ' p.' + h.pages + '] ' + h.text.slice(0, 1500)).join('\n---\n') : '');
  const msgs = history.slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 5000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const log: string[] = [];
  const r = await runAgent({ system, messages: msgs, tools: assistantTools(p, business, S, (s) => log.push(s)), complex: opts.complex, onText: opts.onText });
  return { text: r.text, tools: log, truncated: r.stop === 'max_tokens' };
}

export { SYSTEM };
