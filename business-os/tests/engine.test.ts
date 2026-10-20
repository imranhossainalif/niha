import { describe, expect, it } from 'vitest';
import { engNums, engUnit, growthProjection } from '@/lib/calc/engine';
import type { State } from '@/lib/calc/pl';

describe('Growth Engine L × C × M × F', () => {
  it('projects revenue as base × L × C × M × F', () => {
    const g = growthProjection(400000, { L: 1.8, C: 1.3, M: 1.1, F: 1.15 }, 1000000);
    expect(g.proj).toBe(Math.round(400000 * 1.8 * 1.3 * 1.1 * 1.15));
    expect(g.need).toBeCloseTo(2.5);
    expect(g.each).toBeCloseTo(Math.pow(2.5, 0.25));
  });
  it('treats missing or zero levers as 1x and no goal as no need', () => {
    const g = growthProjection(1000, { L: 0 });
    expect(g.mul).toEqual({ L: 1, C: 1, M: 1, F: 1 });
    expect(g.proj).toBe(1000);
    expect(g.need).toBe(0);
    expect(g.each).toBe(0);
  });
  it('compares the last 30 days with the 30 before', () => {
    const S: State = {
      sales_daily: [
        { business: 'kidscare', date: '2026-10-20', orders: 10, cancelled: 1, delivered: 8, delivered_amount: 8000 },
        { business: 'kidscare', date: '2026-09-21', orders: 5, delivered: 2, delivered_amount: 3000 }, // day 29 back → current
        { business: 'kidscare', date: '2026-09-20', orders: 7, delivered: 4, delivered_amount: 2000 }, // day 30 back → current
        { business: 'kidscare', date: '2026-09-19', orders: 3, delivered: 1, delivered_amount: 900 }, // day 31 → previous
        { business: 'lrf', date: '2026-10-20', orders: 99 },
      ],
      calls_daily: [{ date: '2026-10-19', calls: 100, received: 60, orders: 6 }],
    };
    const n = engNums(S, 'kidscare', '2026-10-20');
    expect(n.c).toMatchObject({ orders: 22, cancel: 1, deliv: 14, rev: 13000, days: 3 });
    expect(n.p).toMatchObject({ orders: 3, deliv: 1, rev: 900, days: 1 });
    expect(n.aov).toBeCloseTo(13000 / 14);
    expect(n.cl).toEqual({ calls: 100, rcv: 60, ord: 6 });
  });
  it('unit economics: break-even ROAS = 1 / gross margin, POAS after other costs', () => {
    const S: State = { settings: [{ id: 'kidscare', usd_rate: 100 }], pl_kidscare: [{ id: '2026-09', sales: 100000, cost: 60000, ads_usd_manual: 100 }], fixed_costs: [{ amount: 10000 }] };
    const u = engUnit(S, 'kidscare', '2026-10-05')!;
    expect(u.m).toBe('2026-09');
    expect(u.gm).toBeCloseTo(0.4);
    expect(u.be).toBeCloseTo(2.5);
    expect(u.mer).toBeCloseTo(10);
    expect(u.poas).toBeCloseTo((100000 - 60000 - 10000) / 10000);
    expect(engUnit(S, 'lrf', '2026-10-05')).toBeNull();
  });
});
