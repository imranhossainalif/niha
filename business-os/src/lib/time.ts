// Bangladesh is UTC+6 all year (no DST).
const BD_MS = 6 * 3600 * 1000;
/** YYYY-MM-DD in Asia/Dhaka for a timestamp; null for missing/invalid input. */
export const bdDate = (t: string | number | Date | null | undefined): string | null => {
  if (t == null || t === '') return null;
  const ms = t instanceof Date ? +t : typeof t === 'number' ? t : Date.parse(t);
  return isNaN(ms) ? null : new Date(ms + BD_MS).toISOString().slice(0, 10);
};
export const bdToday = (): string => bdDate(Date.now())!;
/** Whole days from today (BD) to a YYYY-MM-DD date; negative = past. */
export const daysTo = (s: string, today = bdToday()) => Math.round((Date.parse(s + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);
export const addDays = (s: string, n: number) => new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
