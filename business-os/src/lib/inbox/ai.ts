// The inbox agent: one Claude call per incoming message, JSON-only answer.
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL } from '../anthropic';
import type { InboxMessage, Order } from './store';
import { recordUsage } from '../aiUsage';

export const INTENTS = ['price', 'order', 'delivery', 'complaint', 'product_info', 'other'] as const;
export const MOODS = ['happy', 'normal', 'angry'] as const;
export type AiDecision = {
  reply: string;
  intent: (typeof INTENTS)[number];
  mood: (typeof MOODS)[number];
  needs_human: boolean;
  note: string; // one short sentence: why the team is needed (empty when not)
  lead_score: number;
  order: Order;
};

const ORDER_KEYS = ['name', 'phone', 'address', 'product', 'qty', 'baby_age'] as const;
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'intent', 'mood', 'needs_human', 'note', 'lead_score', 'order'],
  properties: {
    reply: { type: 'string', description: 'Message to send the customer. Empty if needs_human is true and nothing safe can be said.' },
    intent: { type: 'string', enum: [...INTENTS] },
    mood: { type: 'string', enum: [...MOODS] },
    needs_human: { type: 'boolean' },
    note: { type: 'string', description: 'If needs_human: one short sentence in English on why (e.g. "price of Rajma Khichuri not in knowledge"). Otherwise empty.' },
    lead_score: { type: 'integer', description: '0-100: how likely this customer orders soon' },
    order: {
      type: 'object',
      additionalProperties: false,
      required: [...ORDER_KEYS],
      properties: Object.fromEntries(ORDER_KEYS.map((k) => [k, { type: 'string', description: 'Empty string if unknown' }])),
    },
  },
} as const;

export type Extras = { web?: { title: string; url: string; text: string }[]; past?: { q: string; a: string }[]; products?: string[] };

export function systemPrompt(agentName: string, kb: string, rules: string, extras: Extras = {}): string {
  const web = (extras.web ?? []).map((h) => '# ' + h.title + ' (' + h.url + ')\n' + h.text).join('\n\n');
  const shop = (extras.products ?? []).join('\n');
  const past = (extras.past ?? []).map((p, i) => (i + 1) + '. Customer: ' + p.q + '\n   Amader uttor: ' + p.a).join('\n');
  return `You are "${agentName}", the Messenger sales assistant of Kids Care BD (homemade baby food, Bangladesh).
Answer the customer's latest message using ONLY the knowledge below (KNOWLEDGE, SHOP PRODUCTS, WEBSITE and PAST REPLIES).

LANGUAGE AND LAYOUT (this overrides anything in RULES about language or style):
- Write the reply in proper Bangla script (বাংলা অক্ষরে), natural spoken Bangladeshi Bangla, even when the customer writes Banglish (Bangla in English letters). Only if the customer writes in English, answer in English. Never reply in Banglish.
- Always address the customer as "আপু", whether it is a mother, a father or anyone else (our customers are almost all mothers; never use "ভাইয়া" or "স্যার"). Warm, polite, not stiff, no long formal sentences.
- Easy to read on a phone: SHORT paragraphs of one or two sentences, with an EMPTY LINE between every paragraph and between a paragraph and a list. Never write one block of text. First one short line that answers the question directly; then the details; products as a list, one per line starting with "•", each variation on its own line ("• ২৫০ গ্রাম — ৳৩৫০"); finish with one short next step or question (when the customer is buying: which product/size, or name, phone and address to take the order; when they only asked for information: just offer more help). At most 2 emojis.
- Numbers and prices in Bangla digits with ৳ (for example ৳৬৫০), product names may stay as they are written in SHOP PRODUCTS. No markdown (no **, no # headings), plain text only.
- Do not repeat the question back, do not apologise needlessly, and keep it under about 90 words unless the customer asked for a lot of detail.
- ANSWER ONLY WHAT WAS ASKED. For an information question (ingredients/উপাদান, how to feed, age, how it is made, delivery, what a product is…) give just that information, taken from the product description in SHOP PRODUCTS / WEBSITE / FILES. Do NOT mention any price, size list or "order now" in that answer. Give prices and sizes only when the customer asks about price (দাম, koto, price, cost, কত), asks which sizes exist, asks for a price list, or wants to order. You may end an information answer with one short, soft question such as "আর কিছু জানতে চান আপু?" without any price.

NON-NEGOTIABLE:
- Never invent a price, discount, offer, stock count or delivery charge. Product prices and variations (size, flavour, pack) come from SHOP PRODUCTS (our shop website, synced live; it wins if it differs from KNOWLEDGE); offers and delivery charges from KNOWLEDGE; FILES AND WEBSITE passages can back them up. If the answer is in none of these, say you will confirm and set needs_human = true.
- When the customer asks the price of a product that has several variations, list every variation with its price so they can choose; never give one price when prices differ by variation. "[ekhon stock nai]" / "(stock nai)" means out of stock: say it is currently unavailable, never promise it.
- PAST REPLIES show how our team answered similar questions before: copy the tone and the way of explaining. Do NOT copy a price, offer, date or stock from them (they can be out of date); if one conflicts with KNOWLEDGE or WEBSITE, KNOWLEDGE wins.
- Never make health, cure, disease-prevention, weight-gain or doctor claims, even if the website or a past reply does.
- Never mention lotteries, lucky draws or raffles.
- needs_human = true when the customer is angry, complains, asks for a refund/return, asks for a person, or you are unsure. When the customer asked something normal and you only lack one detail (a price, a size, stock), STILL write a short helpful reply that answers what you do know and says the team will confirm the rest, and set needs_human = true so the team follows up; the customer must never be left without any reply. Leave reply empty only for an angry customer, a complaint, a refund or when you truly cannot say anything safe (the system then sends our standard \"please wait, a team member will reply\" message).
- Fill "order" only with details the customer actually gave in this conversation (name, phone, address, product, qty, baby_age); empty strings otherwise.

RULES:
${rules}

KNOWLEDGE:
${kb}${shop ? '\n\nSHOP PRODUCTS (live from our shop website: every variation and its price):\n' + shop : ''}${web ? '\n\nWEBSITE AND FILES (our site and the files the team uploaded, passages closest to the question):\n' + web : ''}${past ? '\n\nPAST REPLIES (our team, similar questions):\n' + past : ''}`;
}

/** Last messages → alternating user/assistant turns that start with the customer. */
export function toTurns(history: InboxMessage[]): Anthropic.MessageParam[] {
  const turns: Anthropic.MessageParam[] = [];
  for (const m of history) {
    const role = m.dir === 'in' ? 'user' : 'assistant';
    const text = (m.text || '(attachment)').slice(0, 2000);
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content = String(last.content) + '\n' + text;
    else turns.push({ role, content: text });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (turns.length && turns[turns.length - 1].role !== 'user') turns.push({ role: 'user', content: '(customer is waiting for a reply)' });
  return turns;
}

/** Parse and clamp the model's JSON (structured output should already match; be defensive anyway). */
export function parseDecision(text: string): AiDecision {
  const raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const order = Object.fromEntries(ORDER_KEYS.map((k) => [k, String(raw?.order?.[k] ?? '').slice(0, 300)])) as Order;
  return {
    reply: String(raw.reply ?? '').slice(0, 4000),
    intent: INTENTS.includes(raw.intent) ? raw.intent : 'other',
    mood: MOODS.includes(raw.mood) ? raw.mood : 'normal',
    needs_human: raw.needs_human === true || !String(raw.reply ?? '').trim(),
    note: String(raw.note ?? '').slice(0, 200),
    lead_score: Math.max(0, Math.min(100, Math.round(Number(raw.lead_score) || 0))),
    order,
  };
}

export async function decide(agentName: string, kb: string, rules: string, history: InboxMessage[], extras: Extras = {}): Promise<AiDecision> {
  const res = await (await anthropic()).messages.create({
    model: await MODEL(),
    max_tokens: 4000,
    system: [{ type: 'text', text: systemPrompt(agentName, kb, rules, extras), cache_control: { type: 'ephemeral' } }],
    messages: toTurns(history),
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming);
  void recordUsage(String(res.model), res.usage).catch(() => {});
  if (res.stop_reason === 'refusal') return { reply: '', intent: 'other', mood: 'normal', needs_human: true, note: 'model refused', lead_score: 0, order: {} };
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
  return parseDecision(text);
}

export const hasOrder = (o: Order | null | undefined) => !!o && Object.values(o).some((v) => v && String(v).trim());
