// Everything the AI looks up for one customer message: passages from our website and similar past team replies.
import { searchWeb, type WebHit } from './web';
import { pastExamples, type Pair } from './learn';
import type { Extras } from './ai';
import type { InboxMessage } from './store';

/** The customer's last few messages, joined: a short "ok" alone says nothing, with the question before it it does. */
export const queryFrom = (history: Pick<InboxMessage, 'dir' | 'text'>[]) => history.filter((m) => m.dir === 'in').slice(-3).map((m) => m.text).join(' ');

export async function contextFor(history: Pick<InboxMessage, 'dir' | 'text'>[]): Promise<{ extras: Extras; web: WebHit[]; past: Pair[] }> {
  const q = queryFrom(history);
  const [web, past] = await Promise.all([searchWeb(q, 4).catch(() => []), pastExamples(q, 4).catch(() => [])]);
  return { extras: { web, past }, web, past };
}
