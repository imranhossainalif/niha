import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { anthropic, MODEL } from '@/lib/anthropic';
import { recordUsage } from '@/lib/aiUsage';

const Body = z.object({ prompt: z.string().max(2000).default(''), text: z.string().max(5000).default(''), networks: z.array(z.string()).default([]), business: z.string().default('kidscare') });

/** AI Assist in the composer: write or improve a caption + hashtags. */
export const POST = handle(async (req: Request) => {
  await needPrincipal(req, 'write');
  const b = Body.parse(await req.json());
  const client = await anthropic(); const model = await MODEL();
  const res = await client.messages.create({
    model, max_tokens: 2000,
    system: 'You write social media captions for Kids Care BD (homemade baby food for babies 6 months+, Bangladesh). Audience: Bangladeshi mothers. '
      + 'Write natural Bangla (or Banglish if the user writes Banglish), warm and short, with a hook in the first line and a clear call to action (inbox/order). '
      + 'Never health, cure, immunity, weight-gain or medical claims; never invent prices, discounts or offers that the user did not give; no lottery/draw offers. '
      + 'Platform: ' + (b.networks.join(', ') || 'facebook') + ' (Instagram: hashtags at the end; Facebook: max 3 hashtags).',
    messages: [{ role: 'user', content: (b.text ? 'Current caption:\n' + b.text + '\n\n' : '') + 'Task: ' + (b.prompt || (b.text ? 'Improve this caption.' : 'Write a caption for a product post.')) }],
    output_config: { format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['caption', 'hashtags'], properties: { caption: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } } } } } },
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);
  void recordUsage(String(res.model), res.usage).catch(() => {});
  const text = res.content.filter((x): x is Anthropic.TextBlock => x.type === 'text').map((x) => x.text).join('');
  return json(JSON.parse(text));
});
