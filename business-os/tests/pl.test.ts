import { describe, expect, it } from 'vitest';
import { pcMonthCostKg, pcVer, plMonth, plMonthList, type State } from '@/lib/calc/pl';

const base = (): State => ({
  settings: [{ id: 'kidscare', usd_rate: 120 }],
  pl_kidscare: [
    { id: '2026-07', sales: 100000, cost: 40000 },
    { id: '2026-08', sales: 200000, cost: 90000 },
    { id: '2026-09', sales: 300000, cost: 150000, ads_daily: { '2026-09-01': 10, '2026-09-02': 15 }, other_costs: [{ name: 'Gas', amount: 500 }] },
  ],
  sales_daily: [
    { business: 'kidscare', date: '2026-10-01', delivered_amount: 50000 },
    { business: 'kidscare', date: '2026-10-02', delivered_amount: 30000 },
    { business: 'insafia', date: '2026-10-02', delivered_amount: 99999 },
  ],
  fixed_costs: [
    { name: 'Rent', amount: 10000, start_month: '2026-01' },
    { name: 'Salary A', amount: 15000, category: 'Salary', start_month: '2026-09', end_month: '2026-09' },
    { name: 'Old', amount: 999, active: 'no' },
    { name: 'Other biz', amount: 777, business: 'itevs' },
  ],
  transactions: [
    { business: 'kidscare', type: 'expense', date: '2026-09-10', category: 'Courier', amount: 2000 },
    { business: 'kidscare', type: 'expense', date: '2026-09-11', category: 'Ads', amount: 3000 },
    { business: 'kidscare', type: 'expense', date: '2026-09-12', category: 'Product kena', amount: 50000 },
  ],
  spend_import: [{ id: '2026-09', items: [{ date: '2026-09-03', amount: 400 }, { date: '2026-09-04', amount: 100, excl: true }] }],
  daily_spend: [{ date: '2026-09-05', amount: 250 }],
});

describe('P&L', () => {
  it('uses the sales export when a month has one', () => {
    const p = plMonth(base(), '2026-09');
    expect(p.sales).toBe(300000);
    expect(p.cost).toBe(150000);
    expect(p.gross).toBe(150000);
    expect(p.ads.usd).toBe(25);
    expect(p.ads.total).toBe(25 * 120 + 3000); // FB spend × rate + "Ads" transactions
    expect(p.fx.total).toBe(10000 + 15000 + 2000); // active fixed costs + other expense transactions
    expect(p.daily).toBe(400 + 250 + 500); // imported + own daily spend (excluded rows skipped) + workbook other costs
    expect(p.net).toBe(150000 - 6000 - 27000 - 1150);
    expect(p.est).toBe(false);
  });
  it('estimates product cost from the last 3 exported months when only Nuport data exists', () => {
    const p = plMonth(base(), '2026-10');
    const ratio = (40000 + 90000 + 150000) / (100000 + 200000 + 300000);
    expect(p.sales).toBe(80000);
    expect(p.cost).toBe(Math.round(80000 * ratio));
    expect(p.est).toBe(true);
    expect(p.src).toMatch(/^Nuport \(cost estimate 47%\)$/);
  });
  it('a manual USD ad figure overrides daily spend', () => {
    const S = base(); S.pl_kidscare![2].ads_usd_manual = 100; S.pl_kidscare![2].ads_rate = 125;
    const p = plMonth(S, '2026-09');
    expect(p.ads.total).toBe(100 * 125 + 3000);
  });
  it('lists months from exports, Nuport days and today', () => {
    expect(plMonthList(base(), '2026-11-02')).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  });
});

describe('product costing', () => {
  const item = { name: 'Cerelac', history: [
    { from: '2026-01-01', sizes: [{ size: '1kg', price: 1200, cost: 600 }] },
    { from: '2026-09-16', sizes: [{ size: '1kg', price: 1300, cost: 700 }] },
  ] };
  it('picks the version in force on a date', () => {
    expect(pcVer(item, '2026-09-15')!.from).toBe('2026-01-01');
    expect(pcVer(item, '2026-09-16')!.from).toBe('2026-09-16');
    expect(pcVer(item, '2025-01-01')!.from).toBe('2026-01-01');
  });
  it('prorates the per-kg cost by day inside a month', () => {
    const S: State = { pc_items: [item] };
    expect(pcMonthCostKg(S, 'cerelac', '2026-09')).toBeCloseTo((15 * 600 + 15 * 700) / 30);
    expect(pcMonthCostKg(S, 'Cerelac', '2026-08')).toBeNull(); // same as the first version → keep import cost
  });
});
