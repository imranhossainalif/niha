// Webhook processing, AI auto-reply, team replies and history import for InboxPilot.
import { getPath, getUrl, profileName, sendText } from '../meta/graph';
import { cfg } from '../config';
import { decide, hasOrder } from './ai';
import { contextFor } from './context';
import { FALLBACK_DEFAULT, formatReply } from './format';
import { BUSINESS, convMessages, getConfig, knowledgeFor, lastInbound, saveMessage, updateMessage, type Channel, type InboxMessage } from './store';

const DAY = 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log('[inbox]', ...a);

type MessagingEvent = {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: { mid: string; text?: string; is_echo?: boolean; attachments?: { type: string }[] };
};

/** Turn one webhook payload into stored messages. Returns the new inbound messages (duplicates and echoes skipped). */
export async function ingestWebhook(body: any): Promise<InboxMessage[]> {
  const channel: Channel = body?.object === 'instagram' ? 'instagram' : 'messenger';
  if (body?.object !== 'page' && body?.object !== 'instagram') return [];
  const fresh: InboxMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const ev of (entry.messaging ?? []) as MessagingEvent[]) {
      const m = ev.message;
      if (!m || m.is_echo || !m.mid || !ev.sender?.id) continue;
      const text = m.text ?? (m.attachments?.length ? '(attachment: ' + m.attachments.map((a) => a.type).join(', ') + ')' : '');
      const msg: InboxMessage = {
        conv: ev.sender.id, channel, dir: 'in', by: 'customer', text, mid: m.mid,
        ts: new Date(ev.timestamp ?? Date.now()).toISOString(), status: 'open', business: BUSINESS, source: 'webhook',
      };
      const prev = await lastInbound(msg.conv);
      if (prev?.name) msg.name = prev.name;
      else if (channel === 'messenger') msg.name = (await profileName(msg.conv)) ?? undefined;
      if (await saveMessage(msg)) fresh.push(msg);
    }
  }
  return fresh;
}

/**
 * Answer a conversation. Waits a few seconds first so a burst of customer messages gets one reply
 * (only the call for the newest message continues).
 */
/**
 * The standard "please wait, a team member will reply" message, for every case where the AI does not answer
 * (it cannot, it failed, or the customer is angry/complaining). Not repeated if it was already sent in the last 15 minutes.
 */
async function sendFallback(msg: InboxMessage, cfg: Awaited<ReturnType<typeof getConfig>>, why: string): Promise<'waiting'> {
  await updateMessage(msg.mid, { status: 'waiting', human: true, ai_why: why.slice(0, 200) }).catch(() => null);
  try {
    const recent = await convMessages(msg.conv, 6);
    if (recent.some((m) => m.fallback && Date.now() - Date.parse(m.ts) < 15 * 60e3)) return 'waiting';
    const text = (cfg.fallback_text || '').trim() || FALLBACK_DEFAULT;
    const ids = await sendText(msg.conv, text);
    await saveMessage({ conv: msg.conv, channel: msg.channel, dir: 'out', by: 'ai', text, mid: ids[0] || 'fb_' + msg.mid, ts: new Date().toISOString(), status: 'open', business: msg.business, fallback: true, source: 'webhook' });
  } catch (e) { log('fallback send failed', msg.conv, (e as Error).message); }
  return 'waiting';
}

export async function autoReply(msg: InboxMessage, debounceMs = 4000): Promise<'sent' | 'waiting' | 'skipped'> {
  const cfg = await getConfig();
  if (!cfg.ai_on) {
    await updateMessage(msg.mid, { status: 'waiting' });
    return 'waiting';
  }
  if (debounceMs) await sleep(debounceMs);
  const latest = await lastInbound(msg.conv);
  if (latest && latest.mid !== msg.mid) return 'skipped';

  const history = await convMessages(msg.conv, 10);
  const { kb, rules } = await knowledgeFor(cfg);
  let d;
  try {
    const { extras } = await contextFor(history);
    d = await decide(cfg.agent_name || 'Kids Care Assistant', kb, rules, history, extras);
  } catch (e) {
    log('AI failed for', msg.conv, (e as Error).message);
    return sendFallback(msg, cfg, 'AI error: ' + (e as Error).message);
  }
  const order = hasOrder(d.order) ? d.order : null;
  await updateMessage(msg.mid, { intent: d.intent, mood: d.mood, lead: d.lead_score, human: d.needs_human, order, status: d.needs_human ? 'waiting' : 'open', ...(d.note ? { ai_why: d.note } : {}) });
  // an answer with "the team must follow up" (we have it, the team will confirm the price) still goes out and the chat stays flagged;
  // when the AI has no answer, or the customer is angry / complaining, the standard "please wait" message goes instead
  const personal = d.mood === 'angry' || d.intent === 'complaint';
  const reply = formatReply(d.reply);
  if (!reply || (d.needs_human && personal)) return sendFallback(msg, cfg, d.note || (personal ? 'angry / complaint' : 'no answer'));

  try {
    const ids = await sendText(msg.conv, reply);
    await saveMessage({
      conv: msg.conv, channel: msg.channel, dir: 'out', by: 'ai', text: reply, mid: ids[0] || 'ai_' + msg.mid,
      ts: new Date().toISOString(), status: 'open', business: msg.business, intent: d.intent, order, lead: d.lead_score, source: 'webhook',
    });
    return d.needs_human ? 'waiting' : 'sent'; // the chat stays in the team's "waiting" list when they must follow up
  } catch (e) {
    log('send failed', msg.conv, (e as Error).message);
    await updateMessage(msg.mid, { status: 'waiting', human: true });
    return 'waiting';
  }
}

export async function processWebhook(body: any) {
  const fresh = await ingestWebhook(body);
  await Promise.all(fresh.map((m) => autoReply(m).catch((e) => log('autoReply error', e))));
}

export class WindowClosedError extends Error {
  code = 'outside_24h';
  status = 422;
}

/** Hours left in Meta's 24-hour reply window (<= 0 = closed). */
export const windowLeftHours = (lastInTs: string | undefined, now = Date.now()) => (lastInTs ? (Date.parse(lastInTs) + DAY - now) / 3600000 : -1);

/** A team member replies from the dashboard. Only inside 24 h of the customer's last message. */
export async function teamSend(conv: string, text: string, status: 'open' | 'done' = 'open') {
  const last = await lastInbound(conv);
  if (!last) throw Object.assign(new Error('Conversation not found'), { status: 404, code: 'not_found' });
  if (windowLeftHours(last.ts) <= 0) throw new WindowClosedError('Customer er shesh message 24 ghontar beshi purono — Meta policy te ekhon reply deya jabe na.');
  const ids = await sendText(conv, text);
  await saveMessage({ conv, channel: last.channel, dir: 'out', by: 'team', text, mid: ids[0], ts: new Date().toISOString(), status, business: last.business, source: 'dashboard' });
  if (last.human || last.status === 'waiting') await updateMessage(last.mid, { status: status === 'done' ? 'done' : 'open', human: false });
  return { mid: ids[0] };
}

/**
 * Import old Messenger messages (default: last 30 days). Messages from the page are team replies;
 * the conversation id is the participant who isn't the page. Dedupe by mid.
 */
export async function importHistory(days = 30, pageIdArg?: string) {
  const pageId = pageIdArg || (await cfg('META_PAGE_ID')) || '';
  if (!pageId) throw new Error('META_PAGE_ID is not set');
  const since = Date.now() - days * DAY;
  let url: string | null = '/' + pageId + '/conversations?platform=messenger&limit=25&fields=updated_time,participants,messages.limit(25){id,message,from,created_time}';
  let convs = 0, added = 0, seen = 0;
  while (url) {
    const page: any = url.startsWith('http') ? await getUrl(url) : await getPath(url);
    let older = false;
    for (const c of page.data ?? []) {
      if (c.updated_time && Date.parse(c.updated_time) < since) { older = true; continue; }
      const other = (c.participants?.data ?? []).find((p: any) => p.id !== pageId);
      if (!other) continue;
      convs++;
      let msgs = c.messages;
      while (msgs) {
        let stop = false;
        for (const m of msgs.data ?? []) {
          if (Date.parse(m.created_time) < since) { stop = true; continue; }
          seen++;
          const fromPage = m.from?.id === pageId;
          const ok = await saveMessage({
            conv: other.id, channel: 'messenger', dir: fromPage ? 'out' : 'in', by: fromPage ? 'team' : 'customer',
            text: m.message || '(attachment)', mid: m.id, ts: new Date(m.created_time).toISOString(),
            status: 'done', name: other.name, business: BUSINESS, source: 'import',
          });
          if (ok) added++;
        }
        msgs = !stop && msgs.paging?.next ? await getUrl(msgs.paging.next) : null;
      }
    }
    // conversations come newest first: once a page holds older ones we're done
    url = !older && page.paging?.next ? page.paging.next : null;
  }
  return { conversations: convs, messages_seen: seen, added };
}
