// Everything the AI looks up for one customer message: shop products (variations + prices), passages from our website
// and uploaded files, and similar past team replies.
import { searchWeb, type WebHit } from './web';
import { pastExamples, type Pair } from './learn';
import { productLine, searchProducts, type WebProduct } from './products';
import type { Extras } from './ai';
import type { InboxMessage } from './store';

/** The customer's last few messages, joined: a short "ok" alone says nothing, with the question before it it does. */
export const queryFrom = (history: Pick<InboxMessage, 'dir' | 'text'>[]) => history.filter((m) => m.dir === 'in').slice(-3).map((m) => m.text).join(' ');

export async function contextFor(history: Pick<InboxMessage, 'dir' | 'text'>[]): Promise<{ extras: Extras; web: WebHit[]; past: Pair[]; products: WebProduct[] }> {
  const q = queryFrom(history);
  const [web, past, products] = await Promise.all([searchWeb(q, 4).catch(() => []), pastExamples(q, 4).catch(() => []), searchProducts(q, 5).catch(() => [])]);
  return { extras: { web, past, products: products.map(productLine) }, web, past, products };
}
