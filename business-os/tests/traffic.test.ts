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
