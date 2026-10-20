import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('ANTHROPIC_API_KEY is not set'), { code: 'sampling_disabled', status: 503 });
  return (client ??= new Anthropic());
}
// Default model for chat/inbox (set in .env); the "Gobhir chinta" toggle and scheduled jobs use the complex one.
export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
export const MODEL_COMPLEX = () => process.env.ANTHROPIC_MODEL_COMPLEX || 'claude-opus-5-5';
