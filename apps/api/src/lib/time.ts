// Kenya (Africa/Nairobi) is UTC+3 all year with no daylight saving, so a fixed offset is exact.
// If you ever launch in a region with daylight saving, replace these helpers with a timezone library.
export const EAT = '+03:00';
const OFFSET_MS = 3 * 3600e3;

export const toDate = (date: string, hhmm: string): Date => new Date(`${date}T${hhmm}:00${EAT}`);
export const eatDateString = (d: Date): string => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
export const eatHour = (d: Date): number => new Date(d.getTime() + OFFSET_MS).getUTCHours();
export const dayOfWeek = (date: string): number => new Date(`${date}T12:00:00${EAT}`).getUTCDay();

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00${EAT}`);
  d.setUTCDate(d.getUTCDate() + n);
  return eatDateString(d);
}

export const formatEat = (d: Date): string =>
  d.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' });
