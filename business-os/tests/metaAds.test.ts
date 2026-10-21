import { afterEach, describe, expect, it, vi } from 'vitest';
import { fieldValue, metaAdsQuery, timeParams } from '@/lib/metaAds';

describe('Meta ads → Supermetrics-shaped rows', () => {
  afterEach(() => vi.unstubAllGlobals());
  const row = { spend: '12.50', impressions: '1000', cpm: '12.5', frequency: '1.3', inline_link_click_ctr: '1.2', date_start: '2026-10-20', ad_name: 'Boro Babu', campaign_name: 'Nov',
    actions: [{ action_type: 'link_click', value: '12' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '7' }] };

  it('maps fields', () => {
    expect(fieldValue('cost', row)).toBe(12.5);
    expect(fieldValue('new_messaging_conversations_7d', row)).toBe(7);
    expect(fieldValue('action_link_click', row)).toBe(12);
    expect(fieldValue('offsite_conversions_fb_pixel_purchase', row)).toBe(0);
    expect(fieldValue('Date', row)).toBe('2026-10-20');
    expect(fieldValue('adcampaign_name', row)).toBe('Nov');
    expect(fieldValue('profile', row, { profile: 'Kids Care' })).toBe('Kids Care');
  });
  it('time window', () => {
    expect(timeParams({ ds_id: 'FA', fields: 'cost', date_range_type: 'last_90_days' })).toBe('date_preset=last_90d');
    expect(timeParams({ ds_id: 'FA', fields: 'cost', start_date: '2026-10-01', end_date: '2026-10-20' })).toContain(encodeURIComponent('"since":"2026-10-01"'));
  });
  it('builds a header row + one row per account/day, following paging', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      calls.push(u);
      if (u.includes('/insights') && !u.includes('after=')) return Response.json({ data: [{ ...row }], paging: { next: 'https://graph.facebook.com/v21.0/next?after=1' } });
      if (u.includes('after=')) return Response.json({ data: [{ ...row, date_start: '2026-10-21', spend: '3' }] });
      return Response.json({ name: 'Kids Care Ads' });
    }));
    const r = await metaAdsQuery({ ds_id: 'FA', ds_accounts: ['act_1'], fields: 'profile,Date,cost', date_range_type: 'last_30_days' }, 'tok');
    expect(r.data).toEqual([['profile', 'Date', 'cost'], ['Kids Care Ads', '2026-10-20', 12.5], ['Kids Care Ads', '2026-10-21', 3]]);
    expect(calls.find((u) => u.includes('/insights'))).toContain('time_increment=1');
    expect(calls.find((u) => u.includes('/insights'))).toContain('level=account');
  });
});
