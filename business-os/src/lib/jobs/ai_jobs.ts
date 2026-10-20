// Scheduled AI jobs (previously Claude scheduled tasks). Enabled in the worker with AI_JOBS=on.
// Each one gathers data, runs the server-side agent, and saves into the collections the dashboard already shows.
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import { SYSTEM } from '../access';
import { addDays, bdToday } from '../time';
import { AI_RULES, assistantTools, bizContext, kbFrameworks, loadState, runAgent, STATE_COLS, type Tool } from '../ai/agent';
import { engNums, engUnit, growthProjection } from '../calc/engine';

const isoWeek = (d: string) => {
  const t = new Date(d + 'T00:00:00Z'); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(); const w = Math.ceil(((+t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + '-W' + String(w).padStart(2, '0');
};

/** Weekly Growth Engine (Sat 11:47): rewrites playbooks/<business> from live numbers + course frameworks. */
export async function growthWeekly(business = 'kidscare') {
  const S = await loadState(SYSTEM, [...STATE_COLS, 'calls_daily', 'playbooks']);
  const today = bdToday();
  const n = engNums(S, business, today);
  const vals = (S.settings ?? []).find((s) => s.id === 'engine_' + business)?.vals ?? {};
  const numbers = { engine: n, unit: engUnit(S, business, today), projection: growthProjection(n.c.rev, { L: vals.mL, C: vals.mC, M: vals.mM, F: vals.mF }, Number(vals.goal) || 0), levers: vals };
  const prev = (S.playbooks ?? []).find((p) => p.id === business);
  let saved = 0;
  const save: Tool = {
    def: {
      name: 'save_playbook',
      description: 'Save the applied playbook shown on the Growth Engine tab (replaces the previous one). 4-8 sections.',
      input_schema: { type: 'object', required: ['sections'], properties: { sections: { type: 'array', items: { type: 'object', required: ['title', 'framework', 'fact', 'hyp', 'actions'], properties: { title: { type: 'string' }, framework: { type: 'string' }, fact: { type: 'string', description: 'FACT: numbers from the data only' }, hyp: { type: 'string', description: 'HYPOTHESIS: your inference' }, actions: { type: 'array', items: { type: 'string' } } } } } } },
    },
    run: async (inp) => {
      const sections = (Array.isArray(inp.sections) ? inp.sections : []).slice(0, 10);
      if (!sections.length) throw new Error('sections empty');
      await db().collection('playbooks').doc(business).set({ business, title: 'Growth Engine plan', sections, updated: new Date().toISOString() });
      saved = sections.length;
      return { saved };
    },
  };
  await runAgent({
    complex: true,
    system: AI_RULES(business) + '\n\n=== KNOWLEDGE FRAMEWORKS ===\n' + kbFrameworks(S) + '\n\n=== BUSINESS DATA ===\n' + bizContext(S, business, today),
    messages: [{ role: 'user', content: 'Weekly Growth Engine review (' + today + '). Computed numbers:\n' + JSON.stringify(numbers) + '\n\nPrevious playbook:\n' + JSON.stringify(prev?.sections ?? []).slice(0, 8000)
      + '\n\nUpdate the plan: diagnose L × C × M × F with this week\'s numbers, keep what still holds, change what the data contradicts, give this week\'s top actions with owner and date. Use search_knowledge for framework details. Then call save_playbook once. You may also call add_tasks for the 3-5 most important actions.' }],
    tools: [save, ...assistantTools(SYSTEM, business, S).filter((t) => ['search_knowledge', 'get_records', 'add_tasks'].includes(t.def.name))],
  });
  if (!saved) throw new Error('The model did not save a playbook');
  return { business, sections: saved };
}

/** Weekly competitor research (Sat 09:41): web search over comp_watch pages + Meta Ad Library → comp_weekly/<ISO week>. */
export async function competitorWeekly() {
  const S = await loadState(SYSTEM, ['comp_watch', 'comp_weekly', 'pc_items', 'settings']);
  const today = bdToday();
  const week = isoWeek(today);
  const watch = (S.comp_watch ?? []).filter((w) => w.active !== 'no');
  const last = [...(S.comp_weekly ?? [])].sort((a, b) => (b.id || '').localeCompare(a.id || ''))[0];
  let saved = false;
  const save: Tool = {
    def: {
      name: 'save_report',
      description: 'Save this week\'s competitor report (shown in Idea Book → Competitor research).',
      input_schema: { type: 'object', required: ['summary', 'pages'], properties: {
        summary: { type: 'string', description: 'FACT / HYPOTHESIS bullets in Banglish' },
        adlib: { type: 'string', description: 'What was checked in the Meta Ad Library and what it showed' },
        pages: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, business: { type: 'string' }, posts: { type: 'number' }, eng: { type: 'number' }, change: { type: 'string' }, top_link: { type: 'string' }, top_text: { type: 'string' } } } },
        ads: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, link: { type: 'string' }, active: { type: 'string' }, oldest: { type: 'string' }, hook: { type: 'string' }, offer: { type: 'string' }, note: { type: 'string' } } } },
      } },
    },
    run: async (inp) => {
      await db().collection('comp_weekly').doc(week).set({ week, label: week, from: addDays(today, -7), to: today, summary: String(inp.summary || ''), adlib: String(inp.adlib || ''), pages: inp.pages || [], ads: inp.ads || [], ads_checked: today, created_at: new Date().toISOString() });
      saved = true;
      return { saved: week };
    },
  };
  await runAgent({
    complex: true,
    system: 'You research competitors for Kids Care BD (homemade baby food, Bangladesh) and Imran\'s other businesses. Write in Banglish. Mark each point FACT (seen in a source, with link) or HYPOTHESIS. Never guess numbers you did not see. Do not click or submit anything on ad pages.',
    messages: [{ role: 'user', content: 'Week ' + week + '. Pages we watch:\n' + JSON.stringify(watch.map((w) => ({ name: w.name, page: w.page, business: w.business, category: w.category })))
      + '\n\nLast report summary:\n' + String(last?.summary ?? '(none)').slice(0, 3000)
      + '\n\nUse web search to see what these pages posted in the last 7 days and what is active in the Meta Ad Library (country BD) for baby food. Compare with last week. Then call save_report once.' }],
    tools: [save],
    serverTools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 15 } as unknown as Anthropic.ToolUnion],
  });
  if (!saved) throw new Error('The model did not save a report');
  return { week };
}

/** Loan plan (1st & 20th): checks the month's installments and puts what is due on the Task board. */
export async function loanPlan() {
  const S = await loadState(SYSTEM, ['loans', 'loan_payments', 'transactions', 'accounts']);
  const today = bdToday();
  const loans = (S.loans ?? []).filter((l) => l.status !== 'closed' && (Number(l.outstanding) || 0) > 0);
  const tools = assistantTools(SYSTEM, 'personal', S).filter((t) => t.def.name === 'add_tasks');
  const r = await runAgent({
    system: AI_RULES('personal'),
    messages: [{ role: 'user', content: 'Loan plan check (' + today + '). Open loans:\n' + JSON.stringify(loans.map((l) => ({ id: l.id, lender: l.lender, outstanding: l.outstanding, principal: l.principal, next_due: l.next_due, last_date: l.last_date, note: l.note })))
      + '\nPayments this month:\n' + JSON.stringify((S.loan_payments ?? []).filter((p) => String(p.date || '').slice(0, 7) === today.slice(0, 7)))
      + '\n\nList what must be paid before month end (lender, amount, date), which loans are late, and one recommended order of payment given cash. Create at most 6 tasks with add_tasks (owner Imran, priority high for late ones). FACT vs HYPOTHESIS.' }],
    tools,
  });
  return { summary: r.text.slice(0, 2000) };
}

/** Weekly learning nudge (Fri): one task with this week's learning step from learning/books. */
export async function learningNudge() {
  const S = await loadState(SYSTEM, ['learning', 'books']);
  const items = [...(S.learning ?? []), ...(S.books ?? [])].filter((x) => x.status !== 'done');
  if (!items.length) return { skipped: 'nothing open' };
  const tools = assistantTools(SYSTEM, 'personal', S).filter((t) => t.def.name === 'add_tasks');
  await runAgent({
    system: AI_RULES('personal'),
    messages: [{ role: 'user', content: 'Weekly learning nudge (' + bdToday() + '). Open learning items and books:\n' + JSON.stringify(items.map((x) => ({ title: x.title, kind: x.kind || x.format, status: x.status, target_date: x.target_date, business: x.business, priority: x.priority })))
      + '\n\nPick the 1-2 most useful next steps for this week (small, concrete, tied to a business goal) and create them with add_tasks (date: this Sunday or Monday).' }],
    tools,
  });
  return { items: items.length };
}
