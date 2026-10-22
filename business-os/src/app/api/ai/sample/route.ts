import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { anthropic, MODEL, MODEL_COMPLEX } from '@/lib/anthropic';
import { handle } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { recordUsage } from '@/lib/aiUsage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.union([z.string(), z.array(z.record(z.unknown()))]) })).min(1).max(200),
  system: z.string().max(200_000).optional(),
  tools: z.array(z.object({ name: z.string(), description: z.string().optional(), input_schema: z.record(z.unknown()) })).max(30).optional(),
  tier: z.enum(['default', 'complex']).optional(),
  max_tokens: z.number().int().min(256).max(64000).optional(),
});

const errCode = (e: unknown): string => {
  if (e instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (e instanceof Anthropic.BadRequestError) return /too long|too many tokens|context/i.test(e.message) ? 'prompt_too_large' : 'bad_request';
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'sampling_disabled';
  if (e instanceof Anthropic.APIUserAbortError) return 'cancelled';
  return (e as { code?: string })?.code || 'error';
};

/**
 * One streamed Claude turn for the browser (the legacy page's `sample` capability).
 * The browser runs its own tools and calls again with the tool results, so the loop and
 * the page's tool code stay exactly as before. Server-Sent Events:
 *   {type:"text", text}  …  then {type:"done", message:{content, stop_reason}}  or  {type:"error", code, message}
 */
export const POST = handle(async (req: Request) => {
  await needPrincipal(req, 'write');
  const b = Body.parse(await req.json());
  const client = await anthropic();
  const model = b.tier === 'complex' ? await MODEL_COMPLEX() : await MODEL();
  const enc = new TextEncoder();

  const body = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode('data: ' + JSON.stringify(o) + '\n\n'));
      const stream = client.messages.stream({
        model,
        max_tokens: b.max_tokens ?? 16000,
        ...(b.system ? { system: b.system } : {}),
        messages: b.messages as Anthropic.MessageParam[],
        ...(b.tools?.length ? { tools: b.tools as Anthropic.Tool[] } : {}),
        cache_control: { type: 'ephemeral' },
      } as Anthropic.MessageStreamParams);
      req.signal.addEventListener('abort', () => stream.abort());
      try {
        for await (const ev of stream) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send({ type: 'text', text: ev.delta.text });
        }
        const msg = await stream.finalMessage();
        void recordUsage(model, msg.usage).catch(() => {});
        send({ type: 'done', message: { content: msg.content, stop_reason: msg.stop_reason, usage: msg.usage } });
      } catch (e) {
        send({ type: 'error', code: errCode(e), message: (e as Error).message?.slice(0, 300) });
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' } });
});
