import { describe, expect, it } from 'vitest';
import { inTransit, pyRound, salesDaily, slim, type NuportOrder } from '@/lib/calc/nuport';

const o = (id: number, created: string, status: string, total: number, extra: Partial<NuportOrder> = {}): NuportOrder => ({ id, created, status, total, is_return: false, delivered_at: null, ...extra });

describe('nuport → sales_daily', () => {
  // 2026-10-18 BD = 2026-10-17T18:00Z .. 2026-10-18T17:59Z
  const orders: NuportOrder[] = [
    o(1, '2026-10-17T18:30:00Z', 'COMPLETED', 1200, { delivered_at: '2026-10-19T05:00:00Z' }), // BD 18th, delivered BD 19th
    o(2, '2026-10-18T10:00:00Z', 'IN_TRANSIT', 650.5),
    o(3, '2026-10-18T11:00:00Z', 'CANCELLED', 990),
    o(4, '2026-10-18T12:00:00Z', 'PROCESSING', 300),
    o(5, '2026-10-18T13:00:00Z', 'COMPLETED', 500, { is_return: true, delivered_at: '2026-10-18T16:00:00Z' }),
    o(6, '2026-10-18T19:00:00Z', 'IN_TRANSIT', 800), // 01:00 on BD 19th
    o(7, '2026-10-10T08:00:00Z', 'COMPLETED', 2000, { delivered_at: '2026-10-18T09:00:00Z' }), // older order delivered on the 18th
  ];
  const [d18, d19] = salesDaily(orders, ['2026-10-18', '2026-10-19'], 'T');

  it('counts orders by BD creation date', () => {
    expect(d18).toMatchObject({ id: 'kidscare_2026-10-18', business: 'kidscare', source: 'nuport', asof: 'T', orders: 5, cancelled: 1, real_orders: 4 });
    expect(d19.orders).toBe(1);
  });
  it('splits what was sent to the courier', () => {
    expect(d18).toMatchObject({
      sent: 3, sent_amount: pyRound(1200 + 650.5 + 500),
      sent_delivered: 1, sent_delivered_amount: 1200,
      sent_in_transit: 1, sent_in_transit_amount: 650, // banker's rounding of 650.5, like Python
      sent_returned: 1, sent_other: 0, in_progress: 1, cash_due: 0,
    });
  });
  it('counts deliveries by BD delivery date, whatever the order date', () => {
    expect(d18).toMatchObject({ delivered: 2, delivered_amount: 2500 }); // order 5 (return, delivered_at set) + order 7
    expect(d19).toMatchObject({ delivered: 1, delivered_amount: 1200 });
  });
  it('sums in-transit across all dates', () => {
    expect(inTransit([d18, d19])).toEqual({ orders: 2, amount: 650 + 800 });
  });
  it('slims a Nuport API order without customer data', () => {
    const s = slim({ internalId: 9, createdAt: 'x', status: 'COMPLETED', deliveryStatus: 'DELIVERED', totalAmount: 10, isReturn: false, deliveredAt: 'y', customer: { name: 'A', phone: '01' } });
    expect(s).toEqual({ id: 9, created: 'x', status: 'COMPLETED', delivery_status: 'DELIVERED', total: 10, is_return: false, delivered_at: 'y' });
  });
  it('pyRound matches Python round()', () => {
    expect([0.5, 1.5, 2.5, 2.4, 2.6, 1234.5].map(pyRound)).toEqual([0, 2, 2, 2, 3, 1234]);
  });
});
