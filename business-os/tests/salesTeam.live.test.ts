import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SALES_LIVE_JS } from '@/lib/legacy/salesLive';

type Table = { cols: unknown[]; rows: Record<string, unknown>[] };

const REPS = ['Lamia', 'Nusrat', 'Shayla', 'Jhumur', 'Maruf'];
const zeros = { reps: Object.fromEntries(REPS.map((r) => [r, 0])), calls: 0, received: 0, orders: 0, order_tk: 0 };
const day30 = { ...zeros, date: '2026-10-30', reps: { ...zeros.reps, Jhumur: 61 }, calls: 61, received: 24 };

/** Run the legacy blob (SALES_LIVE_JS) in a VM with stub page helpers and return the tables it draws. */
function render(callsDaily: Record<string, unknown>[], live: Record<string, unknown> | null, today = '2026-10-31'): Table[] {
  const tables: Table[] = [];
  const sandbox: Record<string, unknown> = {
    S: { calls_daily: callsDaily, sales_team: live ? [live] : [] },
    REPS,
    L: live,
    todayStr: () => today,
    ago: () => 'ekhoni',
    dfmt: (s: string) => s,
    nf: { format: (n: number) => String(n) },
    tk: (n: number) => '৳' + n,
    el: (_tag: string, _attrs: unknown, ...kids: unknown[]) => ({ kids }),
    card: (title: string, _note: string, ...kids: unknown[]) => ({ title, kids }),
    tile: (...args: unknown[]) => ({ tile: args }),
    table: (cols: unknown[], rows: Record<string, unknown>[]) => { const t = { cols, rows }; tables.push(t); return t; },
    emptyBox: (...args: unknown[]) => ({ empty: args }),
    rangeDays: () => ['2026-10-22', '2026-10-31'],
    sumBy: (arr: unknown[], f: (x: unknown) => number) => arr.reduce<number>((s, x) => s + f(x), 0),
    render: () => {},
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(SALES_LIVE_JS + '\nstLiveCards(REPS, L);', sandbox);
  return tables;
}

const repRow = (t: Table, name: string) => t.rows.find((r) => r.n === name)!;

describe('Sales Team date-wise table (stLiveCards)', () => {
  it("shows the sheet's per-rep receive for the selected day even when the calls_daily doc has no breakdown", () => {
    const live = {
      asof: '2026-10-30T15:00:00Z', selected_date: '2026-10-30',
      selected_day: [
        { name: 'Lamia', calls: 0, received: 0, orders: 0, order_tk: 0 },
        { name: 'Jhumur', calls: 61, received: 24, orders: 0, order_tk: 0 },
        { name: 'Total', calls: 61, received: 24, orders: 0, order_tk: 0 },
      ],
    };
    const tables = render([day30], live);
    const detail = tables[1]; // tables[0] is the "Aaj live" card
    expect(detail).toBeTruthy();
    expect(repRow(detail, 'Jhumur')).toMatchObject({ c: 61, r: 24, o: 0 });
    expect(repRow(detail, 'Lamia')).toMatchObject({ r: 0 });
    expect(repRow(detail, 'Mot')).toMatchObject({ c: 61, r: 24 });
  });

  it("shows today's per-rep receive from the sheet's Aaj table", () => {
    const live = {
      asof: '2026-10-31T05:00:00Z', today_date: '2026-10-31',
      today: [
        { name: 'Jhumur', calls: 30, received: 12, orders: 1, order_tk: 900 },
        { name: 'Total', calls: 30, received: 12, orders: 1, order_tk: 900 },
      ],
    };
    const tables = render([{ ...zeros, date: '2026-10-31' }], live);
    expect(repRow(tables[0], 'Jhumur')).toMatchObject({ c: 30, r: 12, o: 1 });
  });

  it('keeps "—" (missing, not 0) when the sheet has no per-rep breakdown for that day', () => {
    const tables = render([day30], { asof: '2026-10-31T05:00:00Z' });
    expect(repRow(tables[1], 'Jhumur').r).toBeUndefined();
    expect(repRow(tables[1], 'Mot')).toMatchObject({ r: 24 });
  });
});
