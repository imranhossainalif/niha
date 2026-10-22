import { describe, expect, it } from 'vitest';
import { trafficDocs } from '@/lib/web/traffic';

describe('GA4 rows → web_traffic docs', () => {
  it('groups by day and source/medium', () => {
    const d = trafficDocs([
      { date: '20261020', source: 'fb', medium: 'paid', sessions: 40, users: 35, newUsers: 30, purchases: 2, revenue: 2400 },
      { date: '20261020', source: 'google', medium: 'organic', sessions: 10, users: 9 },
      { date: '20261021', source: '', medium: '', sessions: 5, users: 5 },
      { date: 'bad', source: 'x', medium: 'y', sessions: 1, users: 1 },
    ]);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ date: '2026-10-20', business: 'kidscare', total: { sessions: 50, users: 44, new_users: 30, purchases: 2, revenue: 2400 } });
    expect(d[0].by_source['fb / paid']).toMatchObject({ sessions: 40, purchases: 2 });
    expect(d[1].by_source['(direct) / (none)'].sessions).toBe(5);
  });
});

describe('GA4 full push', () => {
  it('keeps exact daily totals, pages, landing pages and devices', () => {
    const [d] = trafficDocs({
      property: '1',
      rows: [{ date: '20261021', source: 'fb', medium: 'paid', sessions: 30, users: 25 }, { date: '20261021', source: 'google', medium: 'organic', sessions: 10, users: 10 }],
      days: [{ date: '20261021', sessions: 40, users: 32, engagedSessions: 24, views: 120, engagementSec: 2400, addToCarts: 5, checkouts: 3, purchases: 2, revenue: 2400 }],
      pages: [{ date: '20261021', page: '/product/cerelac/', views: 50, users: 30, engagementSec: 900 }, { date: '20261021', page: '/', views: 70, users: 35 }],
      landing: [{ date: '20261021', page: '/', sessions: 25, engagedSessions: 15 }],
      devices: [{ date: '20261021', key: 'mobile', sessions: 35 }, { date: '20261021', key: 'desktop', sessions: 5 }],
    });
    expect(d.total).toMatchObject({ sessions: 40, users: 32, engaged_sessions: 24, add_to_carts: 5, purchases: 2 }); // site totals, not the source sum
    expect(Object.keys(d.by_source)).toEqual(['fb / paid', 'google / organic']);
    expect(Object.values(d.pages!)[0]).toMatchObject({ page: '/', views: 70 }); // sorted by views
    expect(d.pages!['_product_cerelac_']).toMatchObject({ views: 50, engagement_sec: 900 });
    expect(d.landing!['_']).toMatchObject({ sessions: 25, engaged_sessions: 15 });
    expect(d.devices).toEqual({ mobile: 35, desktop: 5 });
  });
});
