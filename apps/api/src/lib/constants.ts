import { addDays, eatDateString, eatHour, toDate } from './time';

export const TERMS_VERSION = '1.0';

export const DELIVERY_WINDOWS = {
  morning: { label: '8am to 12pm', start: '08:00', end: '12:00' },
  afternoon: { label: '12pm to 5pm', start: '12:00', end: '17:00' },
  evening: { label: '5pm to 8pm', start: '17:00', end: '20:00' },
} as const;
export type WindowKey = keyof typeof DELIVERY_WINDOWS;
export const WINDOW_KEYS = Object.keys(DELIVERY_WINDOWS) as [WindowKey, ...WindowKey[]];

export const MAX_DELIVERY_DAYS_AHEAD = 14;

/** Orders placed after the cut-off hour move to the next day. */
export function earliestDeliveryDate(now: Date, cutoffHour: number): string {
  const today = eatDateString(now);
  return eatHour(now) < cutoffHour ? today : addDays(today, 1);
}

export function deliveryWindowAllowed(date: string, key: WindowKey, now: Date, cutoffHour: number): boolean {
  const today = eatDateString(now);
  if (date < earliestDeliveryDate(now, cutoffHour)) return false;
  if (date > addDays(today, MAX_DELIVERY_DAYS_AHEAD)) return false;
  if (date === today) {
    // same-day windows need at least 2 hours of notice
    return toDate(date, DELIVERY_WINDOWS[key].start).getTime() >= now.getTime() + 2 * 3600e3;
  }
  return true;
}
