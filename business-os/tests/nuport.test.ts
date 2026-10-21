import { describe, expect, it } from 'vitest';
import { inTransit, orderChannel, pyRound, salesDaily, slim, type NuportOrder } from '@/lib/calc/nuport';

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
    const s = slim({ internalId: 9, createdAt: 'x', status: 'COMPLETED', deliveryStatus: 'DELIVERED', totalAmount: 10, isReturn: false, deliveredAt: 'y', customer: { name: 'A', phone: '01' },
      source: 'WEBSITE', authorId: 'u1', metadata: { origin: 'fb', utmMedium: 'paid', sourceType: 'utm', campaignId: '1202', ipAddress: '1.2.3.4', userAgent: 'x' } });
    expect(s).toEqual({ id: 9, created: 'x', status: 'COMPLETED', delivery_status: 'DELIVERED', total: 10, is_return: false, delivered_at: 'y',
      source: 'WEBSITE', custom_source: null, web_origin: 'fb', utm_medium: 'paid', source_type: 'utm', campaign_id: '1202', web_meta: true, author: 'u1' });
    expect(JSON.stringify(s)).not.toMatch(/01|1\.2\.3\.4|phone/);
  });
  it('pyRound matches Python round()', () => {
    expect([0.5, 1.5, 2.5, 2.4, 2.6, 1234.5].map(pyRound)).toEqual([0, 2, 2, 2, 3, 1234]);
  });
});

describe('order channels', () => {
  const o = (x: Partial<NuportOrder>): NuportOrder => ({ id: 1, created: '2026-10-20T04:00:00Z', status: 'COMPLETED', total: 100, ...x });
  it('classifies Nuport sources and website sessions', () => {
    expect(orderChannel(o({ source: 'UP_SELL' }))).toBe('call');
    expect(orderChannel(o({ source: 'WHATSAPP' }))).toBe('whatsapp');
    expect(orderChannel(o({ source: 'MESSENGER' }))).toBe('messenger');
    expect(orderChannel(o({ source: 'WEBSITE', web_origin: 'fb', utm_medium: 'paid', campaign_id: '12' }))).toBe('web_ads');
    expect(orderChannel(o({ source: 'WEBSITE', web_origin: 'google', utm_medium: 'organic', source_type: 'organic' }))).toBe('web_organic');
    expect(orderChannel(o({ source: 'WEBSITE', web_origin: '(direct)', source_type: 'typein' }))).toBe('web_direct');
    expect(orderChannel(o({ source: 'WEBSITE', web_origin: 'ads.tiktok.com', utm_medium: 'referral' }))).toBe('web_other');
    expect(orderChannel(o({ source: 'WEBSITE' }))).toBe('web_other');
    expect(orderChannel(o({ source: 'OFFLINE' }))).toBe('offline');
    expect(orderChannel(o({ source: 'OTHER' }))).toBe('other');
    expect(orderChannel(o({}))).toBe('unknown');
  });
  it('splits a day by channel only when every order has a source', () => {
    const day = salesDaily([
      o({ source: 'UP_SELL', status: 'COMPLETED', total: 1000 }),
      o({ source: 'UP_SELL', status: 'IN_TRANSIT', total: 500.5 }),
      o({ source: 'WEBSITE', utm_medium: 'paid', status: 'CANCELLED', total: 700 }),
    ], ['2026-10-20'])[0];
    expect(day.by_channel).toEqual({
      call: { orders: 2, cancelled: 0, sent: 2, sent_amount: 1500, in_transit: 1, in_transit_amount: 500, delivered: 1, delivered_amount: 1000, returned: 0 },
      web_ads: { orders: 1, cancelled: 1, sent: 0, sent_amount: 0, in_transit: 0, in_transit_amount: 0, delivered: 0, delivered_amount: 0, returned: 0 },
    });
    expect(salesDaily([o({ source: 'UP_SELL' }), o({})], ['2026-10-20'])[0].by_channel).toBeUndefined();
  });
});
