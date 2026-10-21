import { after } from 'next/server';
import { verifyChallenge, verifySignature } from '@/lib/meta/signature';
import { processWebhook } from '@/lib/inbox/process';
import { cfg } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Meta subscription check: echo hub.challenge when the verify token matches. */
export async function GET(req: Request) {
  const challenge = verifyChallenge(new URL(req.url).searchParams, await cfg('META_VERIFY_TOKEN'));
  if (challenge == null) return new Response('Forbidden', { status: 403 });
  return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
}

/** Incoming messages. Verify the signature, answer 200 at once, process after the response (Meta retries slow hooks). */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'), await cfg('META_APP_SECRET'))) {
    return new Response('Bad signature', { status: 401 });
  }
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }
  after(() => processWebhook(body).catch((e) => console.error('[inbox] webhook processing failed', e)));
  return new Response('EVENT_RECEIVED', { status: 200 });
}
