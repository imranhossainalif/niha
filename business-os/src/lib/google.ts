// Google service-account access token (JWT bearer flow) without extra dependencies.
import { createSign } from 'node:crypto';
import { cfg } from './config';

let cached: { token: string; exp: number } | null = null;

export async function googleToken(scope = 'https://www.googleapis.com/auth/drive.readonly'): Promise<string> {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const raw = await cfg('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const sa = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error('Google auth failed: ' + (j.error_description || j.error || r.status));
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

/** Download a Google Sheet as XLSX, or one tab as CSV (gid). The sheet must be shared with the service account's email. */
export async function downloadSheet(id: string, format: 'xlsx' | 'csv', gid?: string): Promise<Buffer> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=${format}` + (gid ? '&gid=' + encodeURIComponent(gid) : '');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + (await googleToken()) }, redirect: 'follow' });
  if (!r.ok) throw new Error('Sheet ' + id + ' download failed (' + r.status + ')');
  return Buffer.from(await r.arrayBuffer());
}
