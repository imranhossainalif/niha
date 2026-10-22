// Integration settings: environment variable first, then the value saved in Admin → Integrations
// (app_settings, AES-256-GCM encrypted with a key derived from AUTH_SECRET). Cached for 30 s.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { prisma } from './prisma';

export type ConfigKey = (typeof CONFIG_FIELDS)[number]['key'];
export const CONFIG_FIELDS = [
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', group: 'AI', secret: true, help: 'console.anthropic.com → API keys' },
  { key: 'ANTHROPIC_MODEL', label: 'Model (chat + inbox)', group: 'AI', secret: false, help: 'default claude-haiku-5-5' },
  { key: 'ANTHROPIC_MODEL_COMPLEX', label: 'Model (gobhir chinta + weekly jobs)', group: 'AI', secret: false, help: 'default claude-opus-5-5' },
  { key: 'AI_JOBS', label: 'Weekly AI jobs (on/off)', group: 'AI', secret: false, help: 'on = growth plan, competitor research, loan plan, learning nudge' },
  { key: 'META_PAGE_ID', label: 'Facebook Page ID', group: 'Meta (InboxPilot)', secret: false, help: 'Kids Care BD page' },
  { key: 'META_PAGE_TOKEN', label: 'Page access token', group: 'Meta (InboxPilot)', secret: true, help: 'Meta app → Messenger → Access tokens' },
  { key: 'META_APP_SECRET', label: 'App secret', group: 'Meta (InboxPilot)', secret: true, help: 'Meta app → Settings → Basic' },
  { key: 'META_VERIFY_TOKEN', label: 'Webhook verify token', group: 'Meta (InboxPilot)', secret: false, help: 'same text in Meta app → Webhooks' },
  { key: 'META_ADS_TOKEN', label: 'Ads token (ads_read, free Supermetrics bikolpo)', group: 'Meta (InboxPilot)', secret: true, help: 'Business Settings → System users → Generate token' },
  { key: 'NUPORT_API_KEY', label: 'Nuport API key', group: 'Nuport', secret: true, help: 'Kids Care orders' },
  { key: 'NUPORT_START_SO', label: 'First run: last SO number already counted', group: 'Nuport', secret: false, help: 'e.g. 12345 (only used once)' },
  { key: 'SHEETS_PUSH_ENABLED', label: 'Accept pushes from the Google Apps Script', group: 'Google Sheets', secret: false, help: 'on/off (default on)' },
  { key: 'GOOGLE_SERVICE_ACCOUNT_JSON', label: 'Service account JSON (optional)', group: 'Google Sheets', secret: true, help: 'only if not using the Apps Script push' },
  { key: 'KC_SHEET_CALL_LIVE', label: 'Call System sheet id', group: 'Google Sheets', secret: false, help: '' },
  { key: 'KC_SHEET_CALL_LIVE_GID', label: 'Live_Dashboard tab gid', group: 'Google Sheets', secret: false, help: '' },
  { key: 'KC_SHEET_UPSALES', label: 'Up-sales tracker sheet id', group: 'Google Sheets', secret: false, help: '' },
  { key: 'KC_SHEET_DAILY', label: 'Daily report sheet id', group: 'Google Sheets', secret: false, help: '' },
  { key: 'KC_SHEET_V6', label: 'Old Call System v6 sheet id', group: 'Google Sheets', secret: false, help: '' },
  { key: 'KC_SHEET_UPS_OLD', label: 'Old Up-sales tracker sheet id', group: 'Google Sheets', secret: false, help: '' },
  { key: 'MAKE_API_TOKEN', label: 'Make.com API token (operation limit dekhte)', group: 'Make.com', secret: true, help: 'Make -> Profile -> API access -> Add token' },
  { key: 'MAKE_ZONE', label: 'Make zone', group: 'Make.com', secret: false, help: 'default us2.make.com' },
  { key: 'SUPERMETRICS_API_KEY', label: 'Supermetrics API key', group: 'Other', secret: true, help: 'FB ads / page data' },
] as const;
const KEYS = new Set<string>(CONFIG_FIELDS.map((f) => f.key));

const encKey = () => createHash('sha256').update('bos-settings:' + (process.env.AUTH_SECRET || process.env.SESSION_SECRET || '')).digest();
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}
export function decrypt(stored: string): string | null {
  try {
    const raw = Buffer.from(stored.slice(3), 'base64');
    const d = createDecipheriv('aes-256-gcm', encKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

/**
 * Env value with any trailing "# comment" removed. Docker's env_file keeps inline comments as part of the value
 * (`KEY=   # note` arrives as "# note"), which must count as unset.
 */
export function envVal(key: string): string | undefined {
  const raw = process.env[key];
  if (raw == null) return undefined;
  const v = raw.replace(/(^|\s+)#.*$/, '').trim();
  return v === '' ? undefined : v;
}

let cache: { at: number; vals: Record<string, string> } | null = null;
async function saved(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 30000) return cache.vals;
  const rows = await prisma.setting.findMany().catch(() => []);
  const vals: Record<string, string> = {};
  for (const r of rows) { const v = decrypt(r.value); if (v != null) vals[r.key] = v; }
  cache = { at: Date.now(), vals };
  return vals;
}
export const clearConfigCache = () => { cache = null; };

/** Value for a key: env var, else Admin setting, else undefined. */
export async function cfg(key: ConfigKey): Promise<string | undefined> {
  const env = envVal(key);
  if (env) return env;
  const v = (await saved())[key];
  return v != null && v !== '' ? v : undefined;
}
export const isOn = (v?: string) => /^(1|on|true|yes)$/i.test(v || '');

/** Where each key's value comes from (never the value of a secret). */
export async function configStatus() {
  const s = await saved();
  return CONFIG_FIELDS.map((f) => {
    const fromEnv = !!envVal(f.key);
    const val = fromEnv ? envVal(f.key)! : s[f.key];
    return { ...f, source: fromEnv ? 'env' : s[f.key] ? 'admin' : null, display: !val ? '' : f.secret ? '••••' + val.slice(-4) : val };
  });
}

export async function saveConfig(values: Record<string, string>, by: string) {
  for (const [k, v] of Object.entries(values)) {
    if (!KEYS.has(k)) continue;
    if (v === '') await prisma.setting.deleteMany({ where: { key: k } });
    else await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: encrypt(v), updatedBy: by }, update: { value: encrypt(v), updatedBy: by } });
  }
  clearConfigCache();
}
