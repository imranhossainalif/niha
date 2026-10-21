// Minimal Meta Graph API client (Messenger send, profile, conversation history).
import { cfg } from '../config';

const GRAPH = 'https://graph.facebook.com/v21.0';

export class GraphError extends Error {
  constructor(message: string, public status: number, public code?: number) { super(message); }
}

async function token() {
  const t = await cfg('META_PAGE_TOKEN');
  if (!t) throw new GraphError('META_PAGE_TOKEN is not set (Admin → Integrations)', 500);
  return t;
}

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const url = path.startsWith('http') ? path : GRAPH + path + (path.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(await token());
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.error) throw new GraphError(body.error?.message || 'Graph API ' + r.status, r.status, body.error?.code);
  return body;
}

/** Send a text reply. Messenger caps a message at 2000 chars, so longer text goes in parts. Returns message ids. */
export async function sendText(recipientId: string, text: string, messagingType: 'RESPONSE' | 'UPDATE' = 'RESPONSE'): Promise<string[]> {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > 2000) {
    const cut = Math.max(rest.lastIndexOf('\n', 2000), rest.lastIndexOf(' ', 2000), 1500);
    parts.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  const ids: string[] = [];
  for (const p of parts) {
    const r = await call('/me/messages', { method: 'POST', body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: messagingType, message: { text: p } }) });
    ids.push(r.message_id);
  }
  return ids;
}

/** Customer's display name (needs the page's profile permission; null if not allowed). */
export async function profileName(psid: string): Promise<string | null> {
  try {
    const r = await call('/' + encodeURIComponent(psid) + '?fields=name,first_name,last_name');
    return r.name || [r.first_name, r.last_name].filter(Boolean).join(' ') || null;
  } catch { return null; }
}

export const getUrl = (url: string) => call(url);
export const getPath = (path: string) => call(path);
