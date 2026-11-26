import { describe, expect, it } from 'vitest';
import { cellsFor, freeStarts, generateSlotStarts } from './slots';
import { addDays, dayOfWeek, eatDateString } from './time';
import { deliveryWindowAllowed, earliestDeliveryDate } from './constants';
import { normalizePhone } from './phone';

const monday = '2030-01-07'; // a Monday
const base = {
  date: monday,
  weeklyHours: [{ day: 1, open: '09:00', close: '12:00' }],
  daysOff: [],
  durationMinutes: 60,
  intervalMinutes: 30,
  leadTimeHours: 0,
  now: new Date('2030-01-01T00:00:00Z'),
};

describe('slots', () => {
  it('knows the day of week in Kenya time', () => {
    expect(dayOfWeek(monday)).toBe(1);
  });

  it('generates slots that fit inside opening hours', () => {
    const starts = generateSlotStarts(base).map((d) => d.toISOString());
    expect(starts).toEqual([
      '2030-01-07T06:00:00.000Z', // 09:00 EAT
      '2030-01-07T06:30:00.000Z',
      '2030-01-07T07:00:00.000Z',
      '2030-01-07T07:30:00.000Z',
      '2030-01-07T08:00:00.000Z', // 11:00 EAT, last 60 minute slot
    ]);
  });

  it('returns nothing on a day off or a closed day', () => {
    expect(generateSlotStarts({ ...base, daysOff: [{ from: monday, to: monday }] })).toEqual([]);
    expect(generateSlotStarts({ ...base, date: '2030-01-08' })).toEqual([]);
  });

  it('respects lead time', () => {
    const now = new Date('2030-01-07T06:00:00Z'); // 09:00 EAT
    const starts = generateSlotStarts({ ...base, now, leadTimeHours: 1 });
    expect(starts[0].toISOString()).toBe('2030-01-07T07:00:00.000Z');
  });

  it('blocks overlapping slots when capacity is used', () => {
    const starts = generateSlotStarts(base);
    const booked = new Date('2030-01-07T06:30:00Z');
    const occupied = new Map<string, number>();
    for (const c of cellsFor(booked, 60, 30)) occupied.set(c, 1);
    const free = freeStarts(starts, occupied, 1, 60, 30).map((d) => d.toISOString());
    expect(free).not.toContain('2030-01-07T06:00:00.000Z'); // overlaps 06:30
    expect(free).not.toContain('2030-01-07T06:30:00.000Z');
    expect(free).not.toContain('2030-01-07T07:00:00.000Z');
    expect(free).toContain('2030-01-07T07:30:00.000Z');
  });

  it('allows two bookings when capacity is 2', () => {
    const starts = generateSlotStarts(base);
    const occupied = new Map<string, number>();
    for (const c of cellsFor(new Date('2030-01-07T06:00:00Z'), 60, 30)) occupied.set(c, 1);
    expect(freeStarts(starts, occupied, 2, 60, 30)).toHaveLength(starts.length);
  });
});

describe('delivery windows', () => {
  it('moves orders after the cut-off to tomorrow', () => {
    const afterCutoff = new Date('2030-01-07T16:00:00Z'); // 19:00 EAT
    expect(earliestDeliveryDate(afterCutoff, 18)).toBe(addDays(eatDateString(afterCutoff), 1));
    const beforeCutoff = new Date('2030-01-07T06:00:00Z'); // 09:00 EAT
    expect(earliestDeliveryDate(beforeCutoff, 18)).toBe('2030-01-07');
  });

  it('needs two hours of notice for same-day windows', () => {
    const now = new Date('2030-01-07T06:00:00Z'); // 09:00 EAT
    expect(deliveryWindowAllowed('2030-01-07', 'morning', now, 18)).toBe(false); // starts 08:00
    expect(deliveryWindowAllowed('2030-01-07', 'afternoon', now, 18)).toBe(true); // starts 12:00
    expect(deliveryWindowAllowed('2030-01-06', 'evening', now, 18)).toBe(false); // in the past
  });
});

describe('phone', () => {
  it('normalises Kenyan numbers', () => {
    expect(normalizePhone('0712 345 678')).toBe('254712345678');
    expect(normalizePhone('+254112345678')).toBe('254112345678');
    expect(normalizePhone('123')).toBeNull();
  });
});
