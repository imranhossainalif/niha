// Everything the AI looks up for one customer message: shop products (variations + prices), passages from our website
// and uploaded files, and similar past team replies.
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL } from '../anthropic';
import { recordUsage } from '../aiUsage';
import { envVal } from '../config';
import { searchWeb, type WebHit } from './web';
import { pastExamples, type Pair } from './learn';
import { productBlock, searchProducts, type WebProduct } from './products';
import type { Extras } from './ai';
import type { InboxMessage } from './store';

/** The customer's last few messages, joined: a short "ok" alone says nothing, with the question before it it does. */
export const queryFrom = (history: Pick<InboxMessage, 'dir' | 'text'>[]) => history.filter((m) => m.dir === 'in').slice(-3).map((m) => m.text).join(' ');

/**
 * Customers write Bangla in English letters ("khichuri") while the shop and files are in Bangla script ("খিচুড়ি"), and the
 * word search can't match across scripts. A tiny AI call turns the message into search keywords in both scripts + English.
 * Failure or a slow answer just means no extra keywords.
 */
const kwCache = new Map<string, string>();
export async function searchKeywords(text: string): Promise<string> {
  const q = text.trim().slice(0, 400);
  if (!q || envVal('INBOX_QUERY_EXPAND') === 'off') return '';
  const hit = kwCache.get(q); if (hit != null) return hit;
  try {
    const client = await anthropic();
    const res = await client.messages.create({
      model: await MODEL(), max_tokens: 80,
      system: 'A customer writes to a Bangladeshi homemade baby-food shop (Kids Care BD), in Bangla, Banglish (Bangla in English letters) or English. Output ONLY 3 to 8 search keywords for the products/topic they mention, space separated, each in Bangla script AND in English/Latin spelling (e.g. for "khichuri hbe": খিচুড়ি khichuri khichdi). No sentences, no punctuation.',
      messages: [{ role: 'user', content: q }],
    } as Anthropic.MessageCreateParamsNonStreaming, { timeout: 8000 });
    void recordUsage(String(res.model), res.usage).catch(() => {});
    const kw = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join(' ').replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (kwCache.size > 300) kwCache.clear();
    kwCache.set(q, kw);
    return kw;
  } catch { return ''; }
}

export async function contextFor(history: Pick<InboxMessage, 'dir' | 'text'>[]): Promise<{ extras: Extras; web: WebHit[]; past: Pair[]; products: WebProduct[]; keywords: string }> {
  const asked = queryFrom(history);
  const keywords = await searchKeywords(history.filter((m) => m.dir === 'in').slice(-2).map((m) => m.text).join(' '));
  const q = keywords ? asked + ' ' + keywords : asked;
  const [web, past, products] = await Promise.all([searchWeb(q, 4).catch(() => []), pastExamples(q, 4).catch(() => []), searchProducts(q, 5).catch(() => [])]);
  return { // the best three get the shop's description too (ingredients, how to use); the rest only name, sizes and prices
  extras: { web, past, products: products.map((p, i) => productBlock(p, i < 3 ? 700 : 0)) }, web, past, products, keywords };
}
