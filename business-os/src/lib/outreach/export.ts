// Outreach CRM → plain tables for the Google Sheet backup (deploy/outreach-backup.gs pulls them every hour).
// Pure: the same rows could feed a CSV download. Cells are strings/numbers only.
import { actionLabel, dayOf, type Activity, type Prospect, type Settings } from './core';

type Cell = string | number;
const bd = (iso?: string | null) => (iso ? new Date(Date.parse(iso) + 6 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : '');
const lab = (list: { id: string; label: string }[], id?: string) => list.find((x) => x.id === id)?.label || id || '';

export function exportTables(prospects: Prospect[], acts: Activity[], s: Settings) {
  // only platforms somebody actually has a profile on, in the Settings order, so the sheet is not 40 empty columns wide
  const used = new Set(prospects.flatMap((p) => (p.profiles || []).map((x) => x.platform)));
  const plats = [...s.platforms.filter((x) => used.has(x.id)), ...[...used].filter((id) => !s.platforms.some((x) => x.id === id)).map((id) => ({ id, label: id }))];
  const pHead: string[] = ['Name', 'Business', 'Role', 'Industry', 'Business size', 'Country', 'City', 'Website', 'Email', 'Phone', 'Our brand', 'First source', 'Stage', 'Reply status', 'Sales stage', 'Deal value', 'Lost reason', 'Rep',
    'Next action', 'Next action date', 'Reply waiting', 'Touches', 'First touch (BD)', 'Last touch (BD)', 'Last reply (BD)', 'Tags', 'Pain', 'Notes',
    ...plats.flatMap((x) => [x.label + ' link', x.label + ' request sent', x.label + ' accepted', x.label + ' messages', x.label + ' last message', x.label + ' replied']),
    ...s.fields.map((f) => f.label), 'Added (BD)', 'Added by', 'ID'];
  const pRows: Cell[][] = [...prospects].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((p) => [
    p.name, p.company || '', p.role || '', p.industry || '', p.size || '', p.country || '', p.city || '', p.website || '', p.email || '', p.phone || '', p.brand || '', lab(s.platforms, p.source), lab(s.stages, p.stage), lab(s.reply_statuses, p.reply_status), lab(s.sales_stages, p.sales_stage), p.deal_value || '', p.lost_reason || '', p.owner || '',
    p.next_action || '', p.next_due || '', p.awaiting ? 'yes' : '', p.touches || 0, bd(p.first_touch), bd(p.last_touch), bd(p.last_in), (p.tags || []).join(', '), p.pain || '', p.notes || '',
    ...plats.flatMap((x) => { const pr = (p.profiles || []).find((y) => y.platform === x.id); return pr ? [pr.url || '', bd(pr.out), bd(pr.back), pr.msgs || 0, bd(pr.last_msg), bd(pr.replied)] : ['', '', '', '', '', '']; }),
    ...s.fields.map((f) => { const v = p.custom?.[f.id]; return f.type === 'check' ? (v ? 'yes' : '') : v == null ? '' : typeof v === 'number' ? v : String(v); }), bd(p.created_at), p.created_by || '', p.id || '']);
  const byId = new Map(prospects.map((p) => [p.id, p]));
  const aHead = ['Time (BD)', 'Day', 'Prospect', 'Business', 'Action', 'Platform', 'Message no.', 'Reply type', 'Template', 'Sent from', 'Rep', 'Note', 'Prospect ID', 'ID'];
  const aRows: Cell[][] = [...acts].sort((a, b) => a.at.localeCompare(b.at)).map((a) => { const p = byId.get(a.prospect); return [
    bd(a.at), a.day, p?.name || '(deleted prospect)', p?.company || '', actionLabel(a.type, s), lab(s.platforms, a.platform), a.step || (a.type === 'reply' && a.after_step ? 'after ' + a.after_step : ''), lab(s.reply_statuses, a.sentiment),
    s.templates.find((t) => t.id === a.template)?.label || a.template || '', s.senders.find((x) => x.id === a.sender)?.name || a.sender || '', a.by || '', a.note || '', a.prospect, a.id || '']; });
  // one row per day: the numbers the Dashboard shows, so the sheet can chart them without formulas
  const days: Record<string, number[]> = {};
  for (const a of acts) { const d = (days[a.day] ||= [0, 0, 0, 0, 0, 0, 0]); if (a.type === 'connect') d[0]++; if (a.type === 'accepted') d[1]++; if (a.type === 'msg' || s.actions.find((x) => x.id === a.type)?.kind === 'msg') d[2]++; if (a.type === 'reply') { d[3]++; if (a.sentiment === 'positive') d[4]++; } if (a.type === 'meeting') d[5]++; if (a.type === 'won') d[6]++; }
  const added: Record<string, number> = {}; for (const p of prospects) { const d = dayOf(p.created_at); added[d] = (added[d] || 0) + 1; }
  const dHead = ['Day', 'New prospects', 'Requests sent', 'Accepted', 'Messages sent', 'Replies', 'Positive replies', 'Meetings', 'Clients won'];
  const dRows: Cell[][] = [...new Set([...Object.keys(days), ...Object.keys(added)])].sort().map((d) => [d, added[d] || 0, ...(days[d] || [0, 0, 0, 0, 0, 0, 0])]);
  return { prospects: { head: pHead, rows: pRows }, activities: { head: aHead, rows: aRows }, daily: { head: dHead, rows: dRows } };
}
