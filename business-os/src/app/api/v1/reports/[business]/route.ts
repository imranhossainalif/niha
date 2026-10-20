import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { loadState, STATE_COLS } from '@/lib/ai/agent';
import { engNums, engUnit, growthProjection } from '@/lib/calc/engine';
import { plMonth, plMonthList } from '@/lib/calc/pl';
import { inTransit } from '@/lib/calc/nuport';
import { bdToday } from '@/lib/time';
import { BIZ_IDS } from '@/lib/business';
import { canReadDoc } from '@/lib/access';

/** Computed numbers for scheduled jobs and Claude: Growth Engine (L×C×M×F), unit economics, P&L by month, in-transit. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ business: string }> }) => {
  const { business } = await params;
  const p = await needPrincipal(req);
  if (!BIZ_IDS.includes(business) || !canReadDoc(p, 'sales_daily', business)) throw Object.assign(new Error('No access'), { status: 403, code: 'permission_denied' });
  const S = await loadState(p, [...STATE_COLS, 'calls_daily']);
  const today = bdToday();
  const n = engNums(S, business, today);
  const vals = (S.settings ?? []).find((s) => s.id === 'engine_' + business)?.vals ?? {};
  const out: Record<string, unknown> = {
    today,
    engine: { ...n, projection: growthProjection(n.c.rev, { L: vals.mL, C: vals.mC, M: vals.mM, F: vals.mF }, Number(vals.goal) || 0), unit: engUnit(S, business, today) },
    in_transit: inTransit((S.sales_daily ?? []).filter((r) => r.business === business)),
  };
  if (business === 'kidscare') out.pl = plMonthList(S, today).slice(-6).map((m) => { const x = plMonth(S, m); return { month: m, sales: x.sales, cost: x.cost, gross: x.gross, ads: x.ads.total, fixed: x.fx.total, daily: x.daily, net: x.net, estimate: x.est, source: x.src }; });
  return json(out);
});
