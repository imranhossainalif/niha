import { describe, expect, it } from 'vitest';
import { detailDoc, liveDates, mergePreserved, mergeRepRows, parseSheetDate, repCounts, withCallDetail } from '@/lib/jobs/callDetail';

const trend = {
  date: '2026-10-30',
  reps: { Lamia: 0, Nusrat: 0, Shayla: 0, Jhumur: 61, Maruf: 0 },
  calls: 61, received: 24, orders: 0, order_tk: 0, asof: '2026-10-30T15:00:00Z',
};

describe('parseSheetDate', () => {
  it('parses English and Bangla labels for a day in the past', () => {
    expect(parseSheetDate('30 October', '2026-10-31')).toBe('2026-10-30');
    expect(parseSheetDate('Friday 30 October', '2026-10-31')).toBe('2026-10-30');
    expect(parseSheetDate('৩০ অক্টোবর', '2026-10-31')).toBe('2026-10-30');
    expect(parseSheetDate('৩০ অক্টোবর ২০২৬', '2026-10-31')).toBe('2026-10-30');
  });
  it('refuses a future date without an explicit year, and impossible dates', () => {
    expect(parseSheetDate('1 November', '2026-10-31')).toBeNull();
    expect(parseSheetDate('31 February', '2026-03-05')).toBeNull();
    expect(parseSheetDate('', '2026-10-31')).toBeNull();
    expect(parseSheetDate('no date here', '2026-10-31')).toBeNull();
  });
});

describe('liveDates', () => {
  it('takes the sheet labels when they name yesterday (a sync just after midnight) and the selected day', () => {
    expect(liveDates({ asof: '2026-10-30T18:30:00Z', today_label: '31 October', selected_label: '30 October' }))
      .toEqual({ todayDate: '2026-10-31', selectedDate: '2026-10-30' });
  });
  it('falls back to the sync date in Asia/Dhaka when the labels are missing', () => {
    expect(liveDates({ asof: '2026-10-30T18:30:00Z' })).toEqual({ todayDate: '2026-10-31', selectedDate: null });
  });
});

describe('repCounts', () => {
  it('reads non-total rows and keeps missing fields missing (never invents 0)', () => {
    expect(repCounts([
      { name: 'Jhumur', calls: 61, received: 24, orders: 0, order_tk: 1200 },
      { name: 'মোট', calls: 61, received: 24, orders: 0, order_tk: 1200 },
      { name: '', calls: 9 },
      { name: 'Lamia', calls: 0 },
    ])).toEqual({
      Jhumur: { calls: 61, received: 24, orders: 0, order_tk: 1200 },
      Lamia: { calls: 0, received: null, orders: null, order_tk: null },
    });
  });
});

describe('mergePreserved', () => {
  it('keeps the stored per-rep receive/order when the trend write has none', () => {
    const stored = { ...trend, rcv: { Jhumur: 24 }, ord: { Jhumur: 0 }, otk: { Jhumur: 0 } };
    const doc = mergePreserved(trend, stored);
    expect(doc.rcv).toEqual({ Jhumur: 24 });
    expect(doc.ord).toEqual({ Jhumur: 0 });
    expect(doc.received).toBe(24);
    expect(doc.calls).toBe(61);
  });
  it('lets the incoming doc win per rep (e.g. the old call sheets) and never drops totals below the rep sum', () => {
    const stored = { ...trend, rcv: { Jhumur: 20, Lamia: 4 } };
    const incoming = { ...trend, rcv: { Jhumur: 24 }, received: 28 };
    const doc = mergePreserved(incoming, stored);
    expect(doc.rcv).toEqual({ Jhumur: 24, Lamia: 4 });
    expect(doc.received).toBe(28);
  });
});

describe('mergeRepRows', () => {
  it('fills the per-rep receive/order of one day from the sheet table', () => {
    const doc = mergeRepRows(mergePreserved(trend, null), repCounts([
      { name: 'Jhumur', calls: 61, received: 24, orders: 0, order_tk: 0 },
      { name: 'Lamia', calls: 0, received: 0, orders: 0, order_tk: 0 },
    ]));
    expect(doc.rcv).toEqual({ Jhumur: 24, Lamia: 0 });
    expect(doc.ord).toEqual({ Jhumur: 0, Lamia: 0 });
    expect(doc.received).toBe(24);
  });
  it('leaves the field unknown when the sheet row has no receive column', () => {
    const doc = mergeRepRows(mergePreserved(trend, null), repCounts([{ name: 'Jhumur', calls: 61 }]));
    expect(doc.rcv).toEqual({});
    expect(doc.received).toBe(24); // the Mot total still shows
  });
  it('never lowers a number on a second sync', () => {
    const first = mergeRepRows(mergePreserved(trend, null), repCounts([{ name: 'Jhumur', received: 24 }]));
    const second = mergeRepRows(mergePreserved(trend, first), repCounts([{ name: 'Jhumur', received: 10 }]));
    expect(second.rcv).toEqual({ Jhumur: 24 });
  });
});

describe('detailDoc', () => {
  it('creates the doc for a backfilled selected day', () => {
    const doc = detailDoc('2026-10-29', repCounts([{ name: 'Jhumur', calls: 40, received: 18, orders: 2, order_tk: 1800 }]), trend.asof);
    expect(doc).toMatchObject({ date: '2026-10-29', calls: 40, received: 18, orders: 2, order_tk: 1800 });
    expect(doc.rcv).toEqual({ Jhumur: 18 });
    expect(doc.src).toEqual({ detail: 'selected-day' });
  });
});


describe('withCallDetail (sync writes)', () => {
  const write = (collection: string, doc_id: string, data: Record<string, unknown>) => ({ collection, doc_id, data });
  const live = {
    asof: '2026-10-31T05:00:00Z', today_label: '31 October', selected_label: '30 October',
    today: [
      { name: 'Jhumur', calls: 10, received: 4, orders: 0, order_tk: 0 },
      { name: 'Total', calls: 10, received: 4, orders: 0, order_tk: 0 },
    ],
    selected_day: [
      { name: 'Jhumur', calls: 61, received: 24, orders: 0, order_tk: 0 },
      { name: 'Total', calls: 61, received: 24, orders: 0, order_tk: 0 },
    ],
  };

  it('adds today and the selected day, and normalizes the live dates for the UI', () => {
    const out = withCallDetail([
      write('calls_daily', '2026-10-31', { ...trend, date: '2026-10-31', calls: 10, received: 4 }),
      write('calls_daily', '2026-10-30', trend),
      write('sales_team', 'live_calls', live),
    ], []);
    const today = out.find((w) => w.doc_id === '2026-10-31')!.data;
    const sel = out.find((w) => w.doc_id === '2026-10-30')!.data;
    expect(today.rcv).toEqual({ Jhumur: 4 });
    expect(sel.rcv).toEqual({ Jhumur: 24 });
    expect(out.find((w) => w.doc_id === 'live_calls')!.data).toMatchObject({ today_date: '2026-10-31', selected_date: '2026-10-30' });
  });

  it('keeps the stored breakdown when a later trend-only sync writes the day again', () => {
    const out = withCallDetail([write('calls_daily', '2026-10-30', trend)], [
      { id: '2026-10-30', data: { ...trend, rcv: { Jhumur: 24 }, ord: { Jhumur: 0 }, otk: { Jhumur: 0 } } },
    ]);
    expect((out[0].data as { rcv: unknown }).rcv).toEqual({ Jhumur: 24 });
  });

  it('backfills a selected day that the trend table no longer lists', () => {
    const out = withCallDetail([write('sales_team', 'live_calls', { ...live, selected_label: '27 October' })], []);
    const doc = out.find((w) => w.collection === 'calls_daily' && w.doc_id === '2026-10-27');
    expect(doc?.data).toMatchObject({ date: '2026-10-27', received: 24 });
    expect((doc?.data as { rcv: unknown }).rcv).toEqual({ Jhumur: 24 });
  });
});
