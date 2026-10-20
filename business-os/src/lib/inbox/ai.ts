// The inbox agent: one Claude call per incoming message, JSON-only answer.
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL } from '../anthropic';
import type { InboxMessage, Order } from './store';

export const INTENTS = ['price', 'order', 'delivery', 'complaint', 'product_info', 'other'] as const;
export const MOODS = ['happy', 'normal', 'angry'] as const;
export type AiDecision = {
  reply: string;
  intent: (typeof INTENTS)[number];
  mood: (typeof MOODS)[number];
  needs_human: boolean;
  lead_score: number;
  order: Order;
};

const ORDER_KEYS = ['name', 'phone', 'address', 'product', 'qty', 'baby_age'] as const;
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'intent', 'mood', 'needs_human', 'lead_score', 'order'],
  properties: {
    reply: { type: 'string', description: 'Message to send the customer. Empty if needs_human is true and nothing safe can be said.' },
    intent: { type: 'string', enum: [...INTENTS] },
    mood: { type: 'string', enum: [...MOODS] },
    needs_human: { type: 'boolean' },
    lead_score: { type: 'integer', description: '0-100: how likely this customer orders soon' },
    order: {
      type: 'object',
      additionalProperties: false,
      required: [...ORDER_KEYS],
      properties: Object.fromEntries(ORDER_KEYS.map((k) => [k, { type: 'string', description: 'Empty string if unknown' }])),
    },
  },
} as const;

export function systemPrompt(agentName: string, kb: string, rules: string): string {
  return `You are "${agentName}", the Messenger sales assistant of Kids Care BD (homemade baby food, Bangladesh).
Answer the customer's latest message using ONLY the knowledge below. Reply in the customer's language (Bangla, Banglish or English), short and polite.

NON-NEGOTIABLE:
- Never invent a price, discount, offer, stock count or delivery charge. If it is not in the knowledge, say you will confirm and set needs_human = true.
- Never make health, cure, disease-prevention, weight-gain or doctor claims.
- Never mention lotteries, lucky draws or raffles.
- needs_human = true when the customer is angry, complains, asks for a refund/return, asks for a person, or you are unsure.
- Fill "order" only with details the customer actually gave in this conversation (name, phone, address, product, qty, baby_age); empty strings otherwise.

RULES:
${rules}

KNOWLEDGE:
${kb}`;
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
    lead_score: Math.max(0, Math.min(100, Math.round(Number(raw.lead_score) || 0))),
    order,
  };
}

export async function decide(agentName: string, kb: string, rules: string, history: InboxMessage[]): Promise<AiDecision> {
  const res = await anthropic().messages.create({
    model: MODEL(),
    max_tokens: 4000,
    system: [{ type: 'text', text: systemPrompt(agentName, kb, rules), cache_control: { type: 'ephemeral' } }],
    messages: toTurns(history),
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming);
  if (res.stop_reason === 'refusal') return { reply: '', intent: 'other', mood: 'normal', needs_human: true, lead_score: 0, order: {} };
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
  return parseDecision(text);
}

export const hasOrder = (o: Order | null | undefined) => !!o && Object.values(o).some((v) => v && String(v).trim());
