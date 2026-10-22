// Monthly Anthropic token counter (system_usage/anthropic_<YYYY-MM>), shown in Settings -> API o connection.
import { db } from './db';

/** Add one call's token usage. Every Anthropic call site calls this after the response. */
export async function recordUsage(model: string, u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null | undefined) {
  if (!u) return;
  const ref = db().collection('system_usage').doc('anthropic_' + new Date().toISOString().slice(0, 7));
  for (let i = 0; i < 4; i++) {
    const cur = await ref.get();
    const d = (cur?.data ?? { month: new Date().toISOString().slice(0, 7), models: {} }) as { month: string; models: Record<string, Record<string, number>> };
    const m = (d.models[model] ??= { calls: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 });
    m.calls += 1; m.input += u.input_tokens || 0; m.output += u.output_tokens || 0;
    m.cache_read += u.cache_read_input_tokens || 0; m.cache_write += u.cache_creation_input_tokens || 0;
    try { await ref.set({ ...d, updated: new Date().toISOString() }, { expectedVersion: cur?.version ?? 0 }); return; } catch { /* someone else wrote: retry */ }
  }
}
