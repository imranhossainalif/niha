import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verify Meta's X-Hub-Signature-256 ("sha256=<hex hmac of the raw body>"). */
export function verifySignature(rawBody: string | Buffer, header: string | null, appSecret: string | undefined): boolean {
  if (!header || !appSecret) return false;
  const m = header.match(/^sha256=([a-f0-9]{64})$/i);
  if (!m) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const got = Buffer.from(m[1], 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** GET verification handshake. Returns the challenge to echo, or null to reject. */
export function verifyChallenge(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null;
  if (params.get('hub.mode') !== 'subscribe' || params.get('hub.verify_token') !== verifyToken) return null;
  return params.get('hub.challenge');
}
