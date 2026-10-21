import Anthropic from '@anthropic-ai/sdk';
import { cfg } from './config';

let client: { key: string; c: Anthropic } | null = null;
/** Client for the key in .env or Admin → Integrations (re-created when the key changes). */
export async function anthropic(): Promise<Anthropic> {
  const key = await cfg('ANTHROPIC_API_KEY');
  if (!key) throw Object.assign(new Error('ANTHROPIC_API_KEY is not set (Admin → Integrations)'), { code: 'sampling_disabled', status: 503 });
  if (!client || client.key !== key) client = { key, c: new Anthropic({ apiKey: key }) };
  return client.c;
}
// Default model for chat/inbox; the "Gobhir chinta" toggle and scheduled jobs use the complex one.
export const MODEL = async () => (await cfg('ANTHROPIC_MODEL')) || 'claude-haiku-5-5';
export const MODEL_COMPLEX = async () => (await cfg('ANTHROPIC_MODEL_COMPLEX')) || 'claude-opus-5-5';
